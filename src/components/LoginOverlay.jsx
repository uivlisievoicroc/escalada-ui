import React, { useState } from 'react';
import { login } from '../utilis/auth';
import { debugError } from '../utilis/debug';

const LoginOverlay = ({ onSuccess, defaultUsername = '' }) => {
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
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          background: '#fff',
          padding: '24px',
          borderRadius: '12px',
          width: '320px',
          boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <h3 style={{ margin: 0 }}>Autentificare arbitru</h3>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span>User</span>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoFocus={!defaultUsername}
            style={{ padding: '8px 10px' }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span>Parolă</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ padding: '8px 10px' }}
          />
        </label>
        {error && <div style={{ color: 'red', fontSize: '0.9rem' }}>{error}</div>}
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '10px 12px',
            background: '#111827',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
          }}
        >
          {loading ? 'Se conectează…' : 'Intră'}
        </button>
      </form>
    </div>
  );
};

export default LoginOverlay;
