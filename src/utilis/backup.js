import { fetchWithRetry } from './fetch';

const API_PROTOCOL = window.location.protocol === 'https:' ? 'https' : 'http';
const API_BASE = `${API_PROTOCOL}://${window.location.hostname}:8000/api/admin`;

export async function downloadBoxBackup(boxId) {
  const res = await fetchWithRetry(`${API_BASE}/backup/box/${boxId}`, {
    method: 'GET',
    credentials: 'include',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Backup failed (${res.status})`);
  }
  return res.json();
}

export async function downloadFullBackup() {
  const res = await fetchWithRetry(`${API_BASE}/backup/full`, {
    method: 'GET',
    credentials: 'include',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Backup failed (${res.status})`);
  }
  return res.json();
}

export async function getLastBackupMeta() {
  const res = await fetchWithRetry(`${API_BASE}/backup/last`, {
    method: 'GET',
    credentials: 'include',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Last backup fetch failed (${res.status})`);
  }
  return res.json();
}

export async function downloadLastBackup() {
  const res = await fetchWithRetry(`${API_BASE}/backup/last?download=1`, {
    method: 'GET',
    credentials: 'include',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Last backup download failed (${res.status})`);
  }
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'last_backup.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export async function downloadBoxCsv(boxId) {
  const res = await fetchWithRetry(`${API_BASE}/export/box/${boxId}`, {
    method: 'GET',
    credentials: 'include',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Export failed (${res.status})`);
  }
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `box_${boxId}_export.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export async function downloadOfficialResultsZip(boxId) {
  const res = await fetchWithRetry(`${API_BASE}/export/official/box/${boxId}`, {
    method: 'GET',
    credentials: 'include',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Official export failed (${res.status})`);
  }
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `official_box_${boxId}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
