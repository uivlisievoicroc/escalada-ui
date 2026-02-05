import React, { useState } from 'react';
import { login } from '../utilis/auth';
import { debugError } from '../utilis/debug';
import styles from './ControlPanel.module.css';

const LoginOverlay = ({ onSuccess, defaultUsername = '', title = 'Autentificare' }) => {
  const [username, setUsername] = useState(defaultUsername);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await login(username, password);
      onSuccess?.(data);
    } catch (err) {
      debugError('Login failed', err);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'storage_full') {
        setError(
          'Nu pot salva sesiunea în browser (storage plin/blocat). Șterge Local Storage/Cache pentru acest site și reîncearcă.',
        );
      } else if (msg.includes('invalid_credentials')) {
        setError('Autentificare eșuată. Verifică user/parola.');
      } else if (msg.includes('token_expired')) {
        setError('Sesiune expirată. Reîncearcă autentificarea.');
      } else {
        setError('Autentificare eșuată.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalCard} role="dialog" aria-modal="true">
        <div className={styles.modalHeader}>
          <div>
            <div className={styles.modalTitle}>{title}</div>
          </div>
        </div>

        {error && (
          <div className={`${styles.modalAlert} ${styles.modalAlertError}`}>{error}</div>
        )}

        <form onSubmit={handleSubmit} className={styles.modalContent}>
          <div className={styles.modalField}>
            <label className={styles.modalLabel} htmlFor="login-username">
              User
            </label>
            <input
              id="login-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
              autoFocus={!defaultUsername}
              disabled={loading}
              className={styles.modalInput}
            />
          </div>

          <div className={styles.modalField}>
            <label className={styles.modalLabel} htmlFor="login-password">
              Parolă
            </label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              autoFocus={!!defaultUsername}
              disabled={loading}
              className={styles.modalInput}
            />
          </div>

          <div className={styles.modalActions}>
            <button
              type="submit"
              className="modern-btn modern-btn-primary btn-press-effect"
              disabled={loading}
            >
              {loading ? 'Se conectează…' : 'Intră'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LoginOverlay;
