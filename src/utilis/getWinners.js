const API_PROTOCOL = window.location.protocol === 'https:' ? 'https' : 'http';
const API_BASE = `${API_PROTOCOL}://${window.location.hostname}:8000/api`;

/**
 * Fetches the podium (top-3) for a given contest box from the backend.
 * Expects endpoint GET /api/podium/{boxIdx} to return:
 *   [ { name: string, color: string }, ... ] (length 3)
 */
export default async function getWinners(category) {
  const res = await fetch(`${API_BASE}/podium/${encodeURIComponent(category)}`);
  if (!res.ok) {
    throw new Error(`Unable to fetch podium: ${res.statusText}`);
  }
  const data = await res.json();
  return data;
}
