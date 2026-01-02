import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { clearAuth, getStoredRole, getStoredToken } from '../utilis/auth';
import { fetchAuditEvents } from '../utilis/audit';
import { debugError } from '../utilis/debug';
import LoginOverlay from './LoginOverlay';

type AuditEvent = {
  id: string;
  createdAt: string;
  competitionId: number;
  boxId: number | null;
  action: string;
  actionId: string | null;
  boxVersion: number;
  sessionId: string | null;
  actorUsername: string | null;
  actorRole: string | null;
  actorIp: string | null;
  actorUserAgent: string | null;
  payload?: unknown;
};

const AdminAuditPage: React.FC = () => {
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [role, setRole] = useState<string | null>(() => getStoredRole());
  const [showLogin, setShowLogin] = useState<boolean>(() => !(token && role === 'admin'));

  const [boxId, setBoxId] = useState<string>('');
  const [limit, setLimit] = useState<number>(200);
  const [includePayload, setIncludePayload] = useState<boolean>(false);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const effectiveBoxId = useMemo(() => {
    if (!boxId.trim()) return null;
    const n = Number(boxId);
    return Number.isFinite(n) ? n : null;
  }, [boxId]);

  const refresh = async () => {
    if (showLogin || role !== 'admin') return;
    setLoading(true);
    setError('');
    try {
      const data = await fetchAuditEvents({
        boxId: effectiveBoxId,
        limit,
        includePayload,
      });
      setEvents(Array.isArray(data) ? data : []);
    } catch (err) {
      debugError('Failed to fetch audit events', err);
      setError('Nu am putut încărca audit log-ul. Verifică API + autentificarea admin.');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showLogin, role, effectiveBoxId, limit, includePayload]);

  return (
    <div className="p-6">
      {showLogin && (
        <LoginOverlay
          onSuccess={() => {
            setToken(getStoredToken());
            setRole(getStoredRole());
            setShowLogin(false);
          }}
        />
      )}

      <div className="flex items-center justify-between gap-2 mb-4">
        <h1 className="text-2xl font-bold">Audit viewer (admin)</h1>
        <div className="flex gap-2">
          <button
            className="px-3 py-2 bg-gray-200 rounded hover:bg-gray-300"
            type="button"
            onClick={() => {
              clearAuth();
              setToken(null);
              setRole(null);
              setShowLogin(true);
            }}
          >
            Logout
          </button>
          <Link className="px-3 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700" to="/">
            Înapoi
          </Link>
        </div>
      </div>

      <div className="p-3 border border-gray-200 rounded bg-white">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <label className="text-sm">
            BoxId (gol = toate)
            <input
              className="mt-1 w-full border border-gray-300 rounded px-2 py-1"
              value={boxId}
              onChange={(e) => setBoxId(e.target.value)}
              placeholder="ex: 1"
            />
          </label>
          <label className="text-sm">
            Limit
            <input
              className="mt-1 w-full border border-gray-300 rounded px-2 py-1"
              type="number"
              min={1}
              max={2000}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
            />
          </label>
          <label className="text-sm flex items-center gap-2 mt-6">
            <input
              type="checkbox"
              checked={includePayload}
              onChange={(e) => setIncludePayload(e.target.checked)}
            />
            Include payload
          </label>
          <div className="flex items-end">
            <button
              className="px-3 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
              type="button"
              onClick={refresh}
              disabled={loading || showLogin || role !== 'admin'}
            >
              {loading ? 'Se încarcă…' : 'Refresh'}
            </button>
          </div>
        </div>
        {error && <div className="mt-3 text-red-600 text-sm">{error}</div>}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full border border-gray-200 bg-white">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left text-sm font-semibold p-2 border-b">Time</th>
              <th className="text-left text-sm font-semibold p-2 border-b">Box</th>
              <th className="text-left text-sm font-semibold p-2 border-b">Action</th>
              <th className="text-left text-sm font-semibold p-2 border-b">action_id</th>
              <th className="text-left text-sm font-semibold p-2 border-b">User</th>
              <th className="text-left text-sm font-semibold p-2 border-b">Role</th>
              <th className="text-left text-sm font-semibold p-2 border-b">IP</th>
            </tr>
          </thead>
          <tbody>
            {events.map((ev) => (
              <tr key={ev.id} className="odd:bg-white even:bg-gray-50">
                <td className="text-xs p-2 border-b whitespace-nowrap">{ev.createdAt}</td>
                <td className="text-sm p-2 border-b">{ev.boxId ?? '-'}</td>
                <td className="text-sm p-2 border-b">{ev.action}</td>
                <td className="text-xs p-2 border-b">{ev.actionId ?? '-'}</td>
                <td className="text-sm p-2 border-b">{ev.actorUsername ?? '-'}</td>
                <td className="text-sm p-2 border-b">{ev.actorRole ?? '-'}</td>
                <td className="text-sm p-2 border-b">{ev.actorIp ?? '-'}</td>
              </tr>
            ))}
            {!loading && events.length === 0 && (
              <tr>
                <td className="p-3 text-sm text-gray-600" colSpan={7}>
                  Niciun eveniment.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminAuditPage;
