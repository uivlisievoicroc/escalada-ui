import { useState, useEffect, useCallback, Dispatch, SetStateAction } from 'react';
import { safeGetItem, safeSetItem, safeRemoveItem, storageKey } from './storage';

/**
 * Type definitions
 */
export type SetValue<T> = Dispatch<SetStateAction<T>>;

export type UseLocalStorageReturn<T> = [T, SetValue<T>];

export type UseLocalStorageWithRemoveReturn<T> = [T, SetValue<T>, () => void];

/**
 * Custom hook for managing localStorage with error handling
 * @param key - The key to store in localStorage
 * @param initialValue - The initial value if key doesn't exist
 * @returns [value, setValue]
 */
export function useLocalStorage<T>(key: string, initialValue: T): UseLocalStorageReturn<T> {
  // State to store our value
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = safeGetItem(key);
      if (item == null) return initialValue;
      try {
        return JSON.parse(item);
      } catch {
        return item as unknown as T;
      }
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  // Return a wrapped version of useState's setter function that
  // persists the new value to localStorage
  const setValue = useCallback(
    (value: T | ((val: T) => T)) => {
      try {
        const valueToStore = value instanceof Function ? value(storedValue) : value;
        setStoredValue(valueToStore);
        safeSetItem(key, JSON.stringify(valueToStore));
      } catch (error) {
        if (error instanceof DOMException && error.name === 'QuotaExceededError') {
          console.error(`localStorage quota exceeded for key "${key}"`, error);
        } else {
          console.error(`Error writing to localStorage key "${key}":`, error);
        }
      }
    },
    [key, storedValue],
  );

  // Listen for changes in other tabs/windows
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if ((e.key === storageKey(key) || e.key === key) && e.newValue) {
        try {
          setStoredValue(JSON.parse(e.newValue));
        } catch (error) {
          console.error(`Error parsing storage event for key "${key}":`, error);
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
 * @param key - The localStorage key
 * @param initialValue - The initial value
 * @returns [value, setValue, removeValue]
 */
export function useLocalStorageWithRemove<T>(
  key: string,
  initialValue: T,
): UseLocalStorageWithRemoveReturn<T> {
  const [value, setValue] = useLocalStorage(key, initialValue);

  const removeValue = useCallback(() => {
    try {
      safeRemoveItem(key);
      setValue(initialValue);
    } catch (error) {
      console.error(`Error removing localStorage key "${key}":`, error);
    }
  }, [key, initialValue]);

  return [value, setValue, removeValue];
}
