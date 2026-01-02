import { fetchWithRetry } from './fetch';
import { getAuthHeader } from './auth';

const API_PROTOCOL = window.location.protocol === 'https:' ? 'https' : 'http';
const API_BASE = `${API_PROTOCOL}://${window.location.hostname}:8000/api/admin`;

export async function fetchAuditEvents({ boxId, limit = 200, includePayload = false } = {}) {
  const params = new URLSearchParams();
  if (boxId !== undefined && boxId !== null && boxId !== '') params.set('boxId', String(boxId));
  if (limit) params.set('limit', String(limit));
  if (includePayload) params.set('includePayload', '1');

  const res = await fetchWithRetry(`${API_BASE}/audit/events?${params.toString()}`, {
    method: 'GET',
    headers: { ...getAuthHeader() },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Audit fetch failed (${res.status})`);
  }
  return res.json();
}
