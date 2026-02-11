import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { clearAuth, getStoredRole, getStoredToken } from '../utilis/auth';
import { fetchAuditEvents } from '../utilis/audit';
import { debugError } from '../utilis/debug';
import LoginOverlay from './LoginOverlay';
import controlPanelStyles from './ControlPanel.module.css';
import styles from './AdminAuditView.module.css';

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

type AdminAuditViewProps = {
  className?: string;
  showBackLink?: boolean;
  showOpenFullPage?: boolean;
  showLogout?: boolean;
};

const AdminAuditView: React.FC<AdminAuditViewProps> = ({
  className = '',
  showBackLink = false,
  showOpenFullPage = false,
  showLogout = true,
}) => {
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
    <div className={className}>
      {showLogin && (
        <LoginOverlay
          title="Autentificare admin"
          onSuccess={() => {
            setToken(getStoredToken());
            setRole(getStoredRole());
            setShowLogin(false);
          }}
        />
      )}

      <div className={styles.header}>
        <div className={styles.titleBlock}>
          <div className={styles.title}>Audit</div>
          <div className={styles.subtitle}>Evenimente admin (read-only)</div>
        </div>
        <div className={styles.actions}>
          {showOpenFullPage && (
            <Link
              className="modern-btn modern-btn-ghost modern-btn-sm"
              to="/admin/audit"
            >
              Open full page
            </Link>
          )}
          {showLogout && (
            <button
              className="modern-btn modern-btn-ghost modern-btn-sm"
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
          )}
          {showBackLink && (
            <Link className="modern-btn modern-btn-primary modern-btn-sm" to="/">
              Înapoi
            </Link>
          )}
        </div>
      </div>

      <div className={controlPanelStyles.adminCard}>
        <div className={styles.controlsGrid}>
          <label className={controlPanelStyles.modalField}>
            <span className={controlPanelStyles.modalLabel}>BoxId (gol = toate)</span>
            <input
              className={controlPanelStyles.modalInput}
              value={boxId}
              onChange={(e) => setBoxId(e.target.value)}
              placeholder="ex: 1"
            />
          </label>
          <label className={controlPanelStyles.modalField}>
            <span className={controlPanelStyles.modalLabel}>Limit</span>
            <input
              className={controlPanelStyles.modalInput}
              type="number"
              min={1}
              max={2000}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
            />
          </label>
          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={includePayload}
              onChange={(e) => setIncludePayload(e.target.checked)}
            />
            Include payload
          </label>
          <div>
            <button
              className="modern-btn modern-btn-primary modern-btn-sm"
              type="button"
              onClick={refresh}
              disabled={loading || showLogin || role !== 'admin'}
            >
              {loading ? 'Se încarcă…' : 'Refresh'}
            </button>
          </div>
        </div>
        {error && <div className={styles.errorBox}>{error}</div>}
      </div>

      <div className={styles.tableWrap} aria-label="Audit events list">
        <table className={styles.table}>
          <thead className={styles.thead}>
            <tr>
              <th>Time</th>
              <th>Box</th>
              <th>Action</th>
              <th>action_id</th>
              <th>User</th>
              <th>Role</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody className={styles.tbody}>
            {events.map((ev) => (
              <tr key={ev.id}>
                <td className={styles.mono}>{ev.createdAt}</td>
                <td>{ev.boxId ?? '-'}</td>
                <td>{ev.action}</td>
                <td className={styles.mono}>{ev.actionId ?? '-'}</td>
                <td>{ev.actorUsername ?? '-'}</td>
                <td>{ev.actorRole ?? '-'}</td>
                <td>{ev.actorIp ?? '-'}</td>
              </tr>
            ))}
            {!loading && events.length === 0 && (
              <tr>
                <td className={styles.emptyState} colSpan={7}>
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

export default AdminAuditView;
