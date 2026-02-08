import React, { useState } from 'react';
import { debugLog, debugError } from '../utilis/debug';
import { clearAuth } from '../utilis/auth';
import styles from './ControlPanel.module.css';

// Admin-only route (cookie-authenticated) is served under `/api/admin`.
// The UI always talks to the API on port 8000 on the same host.
const API_PROTOCOL = window.location.protocol === 'https:' ? 'https' : 'http';
const API_BASE = `${API_PROTOCOL}://${window.location.hostname}:8000/api/admin`;

const ModalUpload = ({ isOpen, onClose, onUpload }) => {
  // Form state: category label, Excel file, number of routes and per-route holds count.
  const [category, setCategory] = useState('');
  const [file, setFile] = useState(null);
  const [routesCount, setRoutesCount] = useState('');
  const [holdsCounts, setHoldsCounts] = useState([]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Basic client-side validation:
    // - file/category/routesCount must be present
    // - holdsCounts must contain a value for each route
    if (
      !file ||
      !category ||
      !routesCount ||
      holdsCounts.length !== Number(routesCount) ||
      holdsCounts.some((h) => !h)
    ) {
      alert('Please fill in all fields.');
      return;
    }

    try {
      // Build multipart form-data for the upload endpoint.
      // Backend reads these as strings and parses `holdsCounts` as JSON.
      const formData = new FormData();
      formData.append('routesCount', routesCount);
      formData.append('holdsCounts', JSON.stringify(holdsCounts));
      formData.append('category', category);
      formData.append('file', file);
      formData.append('include_clubs', 'true');

      // `credentials: 'include'` sends the httpOnly admin cookie to the API.
      const res = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!res.ok) {
        // Auth failures typically mean the admin cookie expired or was cleared.
        if (res.status === 401 || res.status === 403) {
          clearAuth();
          alert('You are not authenticated as admin. Please log in again.');
          return;
        }
        const errorText = await res.text();
        debugError('Upload failed:', errorText);
        alert(`Error: ${errorText}`);
        return;
      }

      const data = await res.json();
      debugLog('✅ Upload successful:', data);

      // Notify ControlPanel with the new listbox so it can be added to the local UI state.
      if (data && data.listbox) {
        onUpload(data.listbox);

        // Reset form state for the next upload.
        setCategory('');
        setRoutesCount('');
        setHoldsCounts([]);
        setFile(null);
        onClose?.();
        alert('✅ Listbox uploaded successfully!');
      } else {
        debugError('No listbox in response:', data);
        alert('Error: unable to process the response.');
      }
    } catch (err) {
      debugError('❌ Upload error:', err);
      alert('Connection error: ' + err.message);
    }
  };

  // Unmount the modal when closed.
  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalCard}>
        <div className={styles.modalHeader}>
          <div>
            <div className={styles.modalTitle}>Upload Listbox Category</div>
            <div className={styles.modalSubtitle}>
              Upload an Excel file with competitor data
            </div>
          </div>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalContent}>
          {/* Category label is used throughout the UI (dropdowns, headers, exports). */}
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>Category</label>
            <input
              type="text"
              id="upload-category"
              name="category"
              placeholder="Category (e.g. U16-Boys)"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={styles.modalInput}
              required
            />
          </div>
          {/* Number of routes */}
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>Number of routes</label>
            <input
              type="number"
              min="1"
              id="upload-routes-count"
              name="routesCount"
              placeholder="Number of routes"
              value={routesCount}
              onChange={(e) => {
                const val = e.target.value;
                // Keep holdsCounts aligned with routesCount so we render one input per route.
                setRoutesCount(val);
                setHoldsCounts(Array(Number(val)).fill(''));
              }}
              className={styles.modalInput}
              required
            />
          </div>
          {/* Holds per route */}
          {routesCount &&
            Array.from({ length: Number(routesCount) }).map((_, i) => (
              <div key={i} className={styles.modalField}>
                <label className={styles.modalLabel}>Route {i + 1} holds</label>
                <input
                  type="number"
                  min="1"
                  id={`upload-holds-${i + 1}`}
                  name={`holdsRoute${i + 1}`}
                  placeholder={`Number of holds, Route ${i + 1}`}
                  value={holdsCounts[i] || ''}
                  onChange={(e) => {
                    // Copy-on-write to keep React state updates predictable.
                    const newCounts = [...holdsCounts];
                    newCounts[i] = e.target.value;
                    setHoldsCounts(newCounts);
                  }}
                  className={styles.modalInput}
                  required
                />
              </div>
            ))}
          {/* Excel file containing competitors (Name, Club). */}
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>Excel file</label>
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => setFile(e.target.files[0])}
              className={styles.modalInput}
              style={{ padding: '8px 12px' }}
              required
            />
          </div>
          {/* Actions: Cancel keeps data local; Upload sends to API and returns a listbox object. */}
          <div className={styles.modalActions}>
            <button
              type="button"
              onClick={onClose}
              className="modern-btn modern-btn-ghost"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="modern-btn modern-btn-primary"
            >
              Upload
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ModalUpload;
