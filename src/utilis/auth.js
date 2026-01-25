import { fetchWithRetry } from './fetch';
import { safeGetItem, safeSetItem, safeRemoveItem } from './storage';

const API_PROTOCOL = window.location.protocol === 'https:' ? 'https' : 'http';
const API_BASE = `${API_PROTOCOL}://${window.location.hostname}:8000`;
// Token is now in httpOnly cookie, not accessible via JS
// Only store non-sensitive metadata in localStorage
const ROLE_KEY = 'authRole';
const BOXES_KEY = 'authBoxes';
// Flag to track if user is "logged in" (cookie is set server-side)
const AUTH_FLAG_KEY = 'authActive';

const _normalizeStoredString = (v) => {
  if (v == null) return null;
  if (v === '' || v === 'null' || v === 'undefined') return null;
  return v;
};

/**
 * Check if user appears to be authenticated.
 * Note: The actual token is in httpOnly cookie (not accessible via JS).
 * This flag is just for UI state; server validates the real token.
 */
export const isAuthenticated = () => _normalizeStoredString(safeGetItem(AUTH_FLAG_KEY)) === 'true';

/**
 * @deprecated Token is now in httpOnly cookie. Use credentials: 'include' instead.
 * Returns empty object for backwards compatibility during migration.
 */
export const getAuthHeader = () => {
  // During migration, return empty - all requests should use credentials: 'include'
  return {};
};

/**
 * @deprecated Token is now in httpOnly cookie.
 */
export const getStoredToken = () => null;

export const logout = async () => {
  // Clear server-side cookie
  try {
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    // Ignore network errors during logout
  }
  // Clear local state
  safeRemoveItem(ROLE_KEY);
  safeRemoveItem(BOXES_KEY);
  safeRemoveItem(AUTH_FLAG_KEY);
};

export async function login(username, password) {
  const res = await fetchWithRetry(
    `${API_BASE}/api/auth/login`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // Important: allows cookie to be set
      body: JSON.stringify({ username, password }),
    },
    1,
    5000,
  );

  if (!res.ok) {
    const errTxt = await res.text();
    throw new Error(errTxt || 'Login failed');
  }

  const data = await res.json();

  // Store non-sensitive metadata only (token is in httpOnly cookie)
  const ok =
    safeSetItem(AUTH_FLAG_KEY, 'true') &&
    safeSetItem(ROLE_KEY, data.role || '') &&
    safeSetItem(BOXES_KEY, JSON.stringify(data.boxes || []));
  if (!ok) {
    await logout();
    throw new Error('storage_full');
  }
  return data;
}

export const clearAuth = async () => {
  await logout();
};

export const getStoredRole = () => _normalizeStoredString(safeGetItem(ROLE_KEY));
export const getStoredBoxes = () => {
  try {
    const raw = safeGetItem(BOXES_KEY);
    const normalized = _normalizeStoredString(raw);
    return normalized ? JSON.parse(normalized) : [];
  } catch {
    return [];
  }
};

export async function magicLogin(token) {
  const res = await fetchWithRetry(
    `${API_BASE}/api/auth/magic-login`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ token }),
    },
    1,
    5000,
  );

  if (!res.ok) {
    const errTxt = await res.text();
    throw new Error(errTxt || 'Magic login failed');
  }

  const data = await res.json();

  const ok =
    safeSetItem(AUTH_FLAG_KEY, 'true') &&
    safeSetItem(ROLE_KEY, data.role || '') &&
    safeSetItem(BOXES_KEY, JSON.stringify(data.boxes || []));
  if (!ok) {
    await logout();
    throw new Error('storage_full');
  }
  return data;
}

export async function generateMagicToken(boxId) {
  const res = await fetchWithRetry(
    `${API_BASE}/api/admin/auth/boxes/${boxId}/magic-token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    },
    1,
    5000,
  );
  if (!res.ok) {
    const errTxt = await res.text();
    throw new Error(errTxt || 'Generate magic token failed');
  }
  return res.json();
}

export async function setJudgePassword(boxId, password, username) {
  const res = await fetchWithRetry(
    `${API_BASE}/api/admin/auth/boxes/${boxId}/password`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ password, username }),
    },
    1,
    5000,
  );
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      await clearAuth();
      throw new Error('auth_required');
    }
    const errTxt = await res.text();
    throw new Error(errTxt || 'Set judge password failed');
  }
  return res.json();
}
