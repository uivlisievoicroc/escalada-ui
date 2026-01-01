import { fetchWithRetry } from './fetch';
import { safeGetItem, safeSetItem, safeRemoveItem } from './storage';

const API_PROTOCOL = window.location.protocol === 'https:' ? 'https' : 'http';
const API_BASE = `${API_PROTOCOL}://${window.location.hostname}:8000`;
const TOKEN_KEY = 'authToken';
const ROLE_KEY = 'authRole';
const BOXES_KEY = 'authBoxes';

export const getStoredToken = () => safeGetItem(TOKEN_KEY);
export const getAuthHeader = () => {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const logout = () => {
  safeRemoveItem(TOKEN_KEY);
  safeRemoveItem(ROLE_KEY);
  safeRemoveItem(BOXES_KEY);
};

export async function login(username, password) {
  const res = await fetchWithRetry(
    `${API_BASE}/api/auth/login`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
  const token = data.access_token;
  safeSetItem(TOKEN_KEY, token);
  safeSetItem(ROLE_KEY, data.role || '');
  safeSetItem(BOXES_KEY, JSON.stringify(data.boxes || []));
  return data;
}

export const clearAuth = () => {
  safeRemoveItem(TOKEN_KEY);
  safeRemoveItem(ROLE_KEY);
  safeRemoveItem(BOXES_KEY);
};

export const getStoredRole = () => safeGetItem(ROLE_KEY);
export const getStoredBoxes = () => {
  try {
    const raw = safeGetItem(BOXES_KEY);
    return raw ? JSON.parse(raw) : [];
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
  const access = data.access_token;
  safeSetItem(TOKEN_KEY, access);
  safeSetItem(ROLE_KEY, data.role || '');
  safeSetItem(BOXES_KEY, JSON.stringify(data.boxes || []));
  return data;
}

export async function generateMagicToken(boxId) {
  const res = await fetchWithRetry(
    `${API_BASE}/api/admin/auth/boxes/${boxId}/magic-token`,
    { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeader() } },
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
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ password, username }),
    },
    1,
    5000,
  );
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      clearAuth();
      throw new Error('auth_required');
    }
    const errTxt = await res.text();
    throw new Error(errTxt || 'Set judge password failed');
  }
  return res.json();
}
