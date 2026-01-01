import React, { useState } from 'react';
import { debugLog, debugError } from '../utilis/debug';
import { getAuthHeader, clearAuth } from '../utilis/auth';
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
      alert('Completează toate câmpurile');
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
        headers: { ...getAuthHeader() },
        body: formData,
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          clearAuth();
          alert('Nu ești autentificat ca admin. Reloghează-te.');
          return;
        }
        const errorText = await res.text();
        debugError('Eroare la upload:', errorText);
        alert(`Eroare: ${errorText}`);
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
        alert('✅ Listbox încărcat cu succes!');
      } else {
        debugError('No listbox in response:', data);
        alert('Eroare: nu s-a putut procesa răspunsul');
      }
    } catch (err) {
      debugError('❌ Upload error:', err);
      alert('Eroare la conectare: ' + err.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="mt-4 p-6 bg-white border border-gray-300 rounded shadow-md max-w-md mx-auto">
      <h2 className="text-xl font-semibold mb-4">Upload Listbox</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          id="upload-category"
          name="category"
          placeholder="Categorie (ex: U16-Baieti)"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full border border-gray-300 p-2 rounded"
          required
        />
        {/* Number of routes */}
        <input
          type="number"
          min="1"
          id="upload-routes-count"
          name="routesCount"
          placeholder="Nr of routes"
          value={routesCount}
          onChange={(e) => {
            const val = e.target.value;
            setRoutesCount(val);
            setHoldsCounts(Array(Number(val)).fill(''));
          }}
          className="w-full border border-gray-300 p-2 rounded"
          required
        />
        {/* Holds per route */}
        {routesCount &&
          Array.from({ length: Number(routesCount) }).map((_, i) => (
            <input
              key={i}
              type="number"
              min="1"
              id={`upload-holds-${i + 1}`}
              name={`holdsRoute${i + 1}`}
              placeholder={`Nr of holds, Route ${i + 1}`}
              value={holdsCounts[i] || ''}
              onChange={(e) => {
                const newCounts = [...holdsCounts];
                newCounts[i] = e.target.value;
                setHoldsCounts(newCounts);
              }}
              className="w-full border border-gray-300 p-2 rounded"
              required
            />
          ))}
        <input
          type="file"
          accept=".xlsx"
          onChange={(e) => setFile(e.target.files[0])}
          className="w-full"
          required
        />
        <div className="flex justify-end space-x-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 border border-gray-400 rounded"
          >
            Anulează
          </button>
          <button
            type="submit"
            className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Încarcă
          </button>
        </div>
      </form>
    </div>
  );
};

export default ModalUpload;
