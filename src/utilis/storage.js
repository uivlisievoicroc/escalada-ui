import { debugError, debugWarn } from './debug';

// Namespace prefix for all localStorage keys
const STORAGE_PREFIX = 'escalada_';
const getKey = (key) => `${STORAGE_PREFIX}${key}`;

// Keys that can be evicted when storage is full (LRU eviction)
const LRU_KEYS = ['timer-', 'registeredTime-', 'sessionId-', 'boxVersion-'];

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
      const boxKeys = allKeys.filter((k) => LRU_KEYS.some((prefix) => k.startsWith(prefix)));

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
        alert('Unable to save data - storage full. Please close other tabs or clear browser data.');
        return false;
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

// Export helper for advanced use cases
export const storageKey = getKey;
