import React, { useState } from 'react';
import { debugLog, debugError } from '../utilis/debug';
import { clearAuth } from '../utilis/auth';
import styles from './ControlPanel.module.css';

// NOTE: admin-only route now under /api/admin
const API_PROTOCOL = window.location.protocol === 'https:' ? 'https' : 'http';
const API_BASE = `${API_PROTOCOL}://${window.location.hostname}:8000/api/admin`;

const ModalUpload = ({ isOpen, onClose, onUpload }) => {
  const [category, setCategory] = useState('');
  const [file, setFile] = useState(null);
  const [routesCount, setRoutesCount] = useState('');
  const [holdsCounts, setHoldsCounts] = useState([]);

  const handleSubmit = async (e) => {
    e.preventDefault();
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
      const formData = new FormData();
      formData.append('routesCount', routesCount);
      formData.append('holdsCounts', JSON.stringify(holdsCounts));
      formData.append('category', category);
      formData.append('file', file);
      formData.append('include_clubs', 'true');

      const res = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!res.ok) {
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

      // Notifică ControlPanel cu noul listbox
      if (data && data.listbox) {
        onUpload(data.listbox);
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

  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalCard}>
        <div className={styles.modalHeader}>
          <div>
            <div className={styles.modalTitle}>Upload Listbox</div>
            <div className={styles.modalSubtitle}>
              Upload an Excel file with competitor data
            </div>
          </div>
          <button
            className="modern-btn modern-btn-sm modern-btn-ghost"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalContent}>
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
                    const newCounts = [...holdsCounts];
                    newCounts[i] = e.target.value;
                    setHoldsCounts(newCounts);
                  }}
                  className={styles.modalInput}
                  required
                />
              </div>
            ))}
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
