import { useState, useEffect, useCallback } from 'react';
import { debugError } from './debug';
import { safeSetItem, safeGetItem, safeRemoveItem, storageKey } from './storage';

/**
 * Custom hook for managing localStorage with error handling
 * @param {string} key - The key to store in localStorage
 * @param {any} initialValue - The initial value if key doesn't exist
 * @returns {[any, function]} - [value, setValue]
 */
export function useLocalStorage(key, initialValue) {
  // State to store our value
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = safeGetItem(key);
      if (item == null) return initialValue;
      try {
        return JSON.parse(item);
      } catch {
        return item;
      }
    } catch (error) {
      debugError(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  // Return a wrapped version of useState's setter function that
  // persists the new value to localStorage
  const setValue = useCallback(
    (value) => {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      safeSetItem(key, JSON.stringify(valueToStore));
    },
    [key, storedValue],
  );

  // Listen for changes in other tabs/windows
  useEffect(() => {
    const handleStorageChange = (e) => {
      if ((e.key === storageKey(key) || e.key === key) && e.newValue) {
        try {
          setStoredValue(JSON.parse(e.newValue));
        } catch (error) {
          debugError(`Error parsing storage event for key "${key}":`, error);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [key]);

  return [storedValue, setValue];
}

/**
 * Hook for localStorage with removal capability
 * @param {string} key
 * @param {any} initialValue
 * @returns {[any, function, function]} - [value, setValue, removeValue]
 */
export function useLocalStorageWithRemove(key, initialValue) {
  const [value, setValue] = useLocalStorage(key, initialValue);

  const removeValue = useCallback(() => {
    try {
      safeRemoveItem(key);
      setValue(initialValue);
    } catch (error) {
      debugError(`Error removing localStorage key "${key}":`, error);
    }
  }, [key, initialValue]);

  return [value, setValue, removeValue];
}
