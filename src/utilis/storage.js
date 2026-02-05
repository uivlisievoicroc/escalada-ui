import { debugError, debugWarn } from './debug';

// Namespace prefix for all localStorage keys
const STORAGE_PREFIX = 'escalada_';
const getKey = (key) => `${STORAGE_PREFIX}${key}`;

// Keys that can be evicted when storage is full (LRU eviction)
const LRU_KEYS = [
  'listboxes',
  'ranking-',
  'rankingTimes-',
  'podium-',
  'timer-sync-',
  'timer-',
  'registeredTime-',
  'sessionId-',
  'boxVersion-',
  'currentClimber-',
  'climbingTime-',
  'tick-owner-',
  'timeCriterionEnabled-',
  'timer-cmd',
];

// Keys that should never be evicted
const PROTECTED_KEYS = ['authToken', 'authRole', 'authBoxes'];

/**
 * Safely set item in localStorage with quota handling
 * @param {string} key - Storage key
 * @param {string} value - Value to store
 * @returns {boolean} - True if successful, false otherwise
 */
export const safeSetItem = (key, value) => {
  try {
    localStorage.setItem(getKey(key), value);
    return true;
  } catch (err) {
    if (err.name === 'QuotaExceededError') {
      debugWarn('localStorage quota exceeded, attempting to free space');

      // Clear oldest box-specific data (LRU eviction)
      const allKeys = Object.keys(localStorage);
      const boxKeys = allKeys.filter((k) =>
        LRU_KEYS.some((prefix) => k.startsWith(prefix) || k.startsWith(getKey(prefix))),
      );

      // Sort by box index (oldest = smallest index)
      boxKeys.sort((a, b) => {
        const aIdx = parseInt(a.match(/\d+/)?.[0] || '0', 10);
        const bIdx = parseInt(b.match(/\d+/)?.[0] || '0', 10);
        return aIdx - bIdx;
      });

      // Remove oldest 25% of box data
      const toRemove = boxKeys.slice(0, Math.ceil(boxKeys.length * 0.25));
      toRemove.forEach((k) => {
        try {
          localStorage.removeItem(k);
        } catch (removeErr) {
          debugError('Failed to remove storage key:', k, removeErr);
        }
      });

      // Retry after cleanup
      try {
        localStorage.setItem(getKey(key), value);
        debugWarn(`Successfully saved after cleanup: ${key}`);
        return true;
      } catch (retryErr) {
        debugError('Still cannot save to localStorage after cleanup:', retryErr);
        // Last-resort: purge non-essential Escalada keys (keep auth + key being written)
        try {
          const protectedKeys = new Set(PROTECTED_KEYS.map((k) => getKey(k)));
          protectedKeys.add(getKey(key));

          for (const k of Object.keys(localStorage)) {
            if (!k.startsWith(STORAGE_PREFIX)) continue;
            if (protectedKeys.has(k)) continue;
            try {
              localStorage.removeItem(k);
            } catch {}
          }

          localStorage.setItem(getKey(key), value);
          debugWarn(`Successfully saved after full purge: ${key}`);
          return true;
        } catch (purgeErr) {
          debugError('Still cannot save to localStorage after purge:', purgeErr);
          alert('Unable to save data - storage full. Please close other tabs or clear browser data.');
          return false;
        }
      }
    } else {
      debugError('localStorage error:', err);
      return false;
    }
  }
};

/**
 * Safely get item from localStorage with error handling
 * @param {string} key - Storage key
 * @param {*} defaultValue - Default value if key doesn't exist or error occurs
 * @returns {string|*} - Retrieved value or default
 */
export const safeGetItem = (key, defaultValue = null) => {
  try {
    // Try namespaced key first
    const namespaced = localStorage.getItem(getKey(key));
    if (namespaced !== null && namespaced !== undefined) {
      return namespaced;
    }
    // Fallback to legacy key for backward compatibility
    const legacy = localStorage.getItem(key);
    return legacy !== null && legacy !== undefined ? legacy : defaultValue;
  } catch (err) {
    debugError('localStorage read error:', err);
    return defaultValue;
  }
};

/**
 * Safely remove item from localStorage with error handling
 * @param {string} key - Storage key
 * @returns {boolean} - True if successful, false otherwise
 */
export const safeRemoveItem = (key) => {
  try {
    // Remove both namespaced and legacy keys
    localStorage.removeItem(getKey(key));
    localStorage.removeItem(key);
    return true;
  } catch (err) {
    debugError('localStorage remove error:', err);
    return false;
  }
};

/**
 * Safely parse JSON from localStorage with error handling
 * @param {string} key - Storage key
 * @param {*} defaultValue - Default value if parse fails
 * @returns {*} - Parsed value or default
 */
export const safeGetJSON = (key, defaultValue = null) => {
  try {
    const raw = safeGetItem(key);
    if (!raw) return defaultValue;
    return JSON.parse(raw);
  } catch (err) {
    debugError(`JSON parse error for key "${key}":`, err);
    // Clear corrupt data
    try {
      safeRemoveItem(key);
      debugWarn(`Removed corrupt localStorage entry: ${key}`);
    } catch (removeErr) {
      debugError('Failed to remove corrupt entry:', removeErr);
    }
    return defaultValue;
  }
};

/**
 * Safely set JSON to localStorage with error handling
 * @param {string} key - Storage key
 * @param {*} value - Value to stringify and store
 * @returns {boolean} - True if successful, false otherwise
 */
export const safeSetJSON = (key, value) => {
  try {
    return safeSetItem(key, JSON.stringify(value));
  } catch (err) {
    debugError(`JSON stringify error for key "${key}":`, err);
    return false;
  }
};

// Export helper for advanced use cases
export const storageKey = getKey;
