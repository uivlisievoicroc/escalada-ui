import React, { useState } from 'react';
import { login } from '../utilis/auth';
import { debugError } from '../utilis/debug';
import styles from './ControlPanel.module.css';

/**
 * LoginOverlay - Full-screen authentication modal for admin/judge/spectator login.
 * 
 * @component
 * @param {Function} onSuccess - Callback invoked after successful authentication (receives auth data)
 * @param {string} defaultUsername - Pre-filled username (e.g., "viewer" for spectators)
 * @param {string} title - Modal title (default: "Authentication")
 * 
 * Usage contexts:
 * - ControlPanel: Admin authentication (title="Admin Authentication")
 * - JudgePage: Judge authentication
 * - ContestPage: Spectator authentication (title="Spectator Authentication", defaultUsername="viewer")
 * 
 * Authentication flow:
 * 1. User submits username + password
 * 2. Calls login() from auth.js → POST /api/auth/login
 * 3. Backend returns JWT (stored in httpOnly cookie) + role/username
 * 4. Token and role saved to localStorage for subsequent requests
 * 5. onSuccess callback triggered to update parent component state
 * 
 * Error handling:
 * - storage_full: localStorage quota exceeded or blocked (privacy mode)
 * - invalid_credentials: Wrong username/password
 * - token_expired: Previous session expired (forces re-login)
 * - Generic: Network errors or unexpected failures
 * 
 * Accessibility:
 * - autoFocus strategy: username field if empty, password field if username pre-filled
 * - autoComplete attributes for password manager integration
 * - ARIA attributes (role="dialog", aria-modal="true")
 * - Loading state disables inputs and changes button text
 */
const LoginOverlay = ({ onSuccess, defaultUsername = '', title = 'Authentication' }) => {
  // Form state: username (pre-filled for spectators), password (always empty), error message, loading flag
  const [username, setUsername] = useState(defaultUsername);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  /**
   * Handle form submission: authenticate user and update parent state on success.
   * 
   * Flow:
   * 1. Clear previous errors and set loading state
   * 2. Call login() which sends credentials to /api/auth/login
   * 3. On success: JWT cookie set by backend, localStorage updated, onSuccess callback fired
   * 4. On error: map error message to user-friendly text
   * 
   * Error mapping:
   * - "storage_full": localStorage quota exceeded (common in Safari private mode)
   * - "invalid_credentials": Backend rejected username/password (401)
   * - "token_expired": Previous session expired (rare on login, more common on refresh)
   * - Default: Generic network or unexpected error
   */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); // Clear previous error message
    setLoading(true);
    try {
      // Call auth.js login() → POST /api/auth/login → returns { role, username, ... }
      const data = await login(username, password);
      onSuccess?.(data); // Notify parent component (e.g., ControlPanel sets adminRole state)
    } catch (err) {
      debugError('Login failed', err);
      // Extract error message (thrown by auth.js as Error or string)
      const msg = err instanceof Error ? err.message : String(err);
      
      // Map backend/localStorage errors to user-friendly messages
      if (msg === 'storage_full') {
        setError(
          'Cannot save session in browser (storage full/blocked). Clear Local Storage/Cache for this site and try again.',
        );
      } else if (msg.includes('invalid_credentials')) {
        setError('Authentication failed. Check username/password.');
      } else if (msg.includes('token_expired')) {
        setError('Session expired. Try authenticating again.');
      } else {
        setError('Authentication failed.');
      }
    } finally {
      setLoading(false); // Reset loading state (enables button + inputs)
    }
  };

  return (
    // Full-screen overlay (blocks interaction with underlying page)
    <div className={styles.modalOverlay}>
      {/* Modal card with ARIA attributes for screen readers */}
      <div className={styles.modalCard} role="dialog" aria-modal="true">
        {/* Header with customizable title (e.g., "Admin Authentication", "Spectator Authentication") */}
        <div className={styles.modalHeader}>
          <div>
            <div className={styles.modalTitle}>{title}</div>
          </div>
        </div>

        {/* Error banner: only visible when error state is non-empty */}
        {error && (
          <div className={`${styles.modalAlert} ${styles.modalAlertError}`}>{error}</div>
        )}

        <form onSubmit={handleSubmit} className={styles.modalContent}>
          {/* Username field: pre-filled for spectators ("viewer"), empty for admin/judge */}
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
              autoComplete="username" // Enables password managers to recognize username field
              autoFocus={!defaultUsername} // Focus on username if not pre-filled
              disabled={loading} // Disable during submission to prevent changes
              className={styles.modalInput}
            />
          </div>

          {/* Password field: always empty on mount, autoFocus if username pre-filled */}
          <div className={styles.modalField}>
            <label className={styles.modalLabel} htmlFor="login-password">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password" // Enables password managers to recognize password field
              autoFocus={!!defaultUsername} // Focus on password if username pre-filled (spectator flow)
              disabled={loading} // Disable during submission
              className={styles.modalInput}
            />
          </div>

          {/* Submit button: shows "Connecting…" during loading, "Sign In" otherwise */}
          <div className={styles.modalActions}>
            <button
              type="submit"
              className="modern-btn modern-btn-primary btn-press-effect"
              disabled={loading} // Prevent double-submission
            >
              {loading ? 'Connecting…' : 'Sign In'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LoginOverlay;
