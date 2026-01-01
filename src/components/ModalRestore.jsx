import React, { useState } from 'react';
import { debugError } from '../utilis/debug';
import { getAuthHeader } from '../utilis/auth';

const API_PROTOCOL = window.location.protocol === 'https:' ? 'https' : 'http';
const API_BASE = `${API_PROTOCOL}://${window.location.hostname}:8000/api`;

const ModalRestore = ({ isOpen, onClose, onSuccess }) => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!file) {
      setError('Selectează un fișier JSON de backup.');
      return;
    }
    try {
      setLoading(true);
      const text = await file.text();
      const payload = JSON.parse(text);
      const res = await fetch(`${API_BASE}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(payload),
      });
      if (res.status === 409) {
        const detail = await res.json();
        setError(`Conflict la restore: ${JSON.stringify(detail.detail || detail)}`);
        return;
      }
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }
      onSuccess?.();
      onClose?.();
    } catch (err) {
      debugError('Restore failed', err);
      setError(err.message || 'Restore failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          background: '#fff',
          padding: '20px',
          borderRadius: '10px',
          width: '360px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
        }}
      >
        <h3 style={{ margin: 0 }}>Restore backup</h3>
        <input type="file" accept=".json" onChange={(e) => setFile(e.target.files[0])} />
        {error && <div style={{ color: 'red', fontSize: '0.9rem' }}>{error}</div>}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} disabled={loading}>
            Anulează
          </button>
          <button
            type="submit"
            disabled={loading}
            style={{ background: '#111827', color: '#fff', padding: '8px 12px' }}
          >
            {loading ? 'Restoring…' : 'Restore'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ModalRestore;
