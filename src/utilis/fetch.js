/**
 * Fetch utilities with timeout and retry logic
 * Provides resilient network request handling for competition commands
 */

import { debugWarn, debugError } from './debug';

// ==================== TIMEOUT WRAPPER ====================

/**
 * Fetch with timeout protection
 * Prevents hanging requests that block UI indefinitely
 *
 * @param {string} url - Request URL
 * @param {object} options - Fetch options (method, headers, body, etc)
 * @param {number} timeout - Timeout in milliseconds (default 5000ms)
 * @returns {Promise<Response>} Fetch response or timeout error
 * @throws {Error} If timeout is exceeded
 */
export const fetchWithTimeout = (url, options = {}, timeout = 5000) => {
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Request timeout after ${timeout}ms`)), timeout),
    ),
  ]);
};

// ==================== RETRY WRAPPER ====================

/**
 * Fetch with automatic retry and exponential backoff
 * Handles transient network errors and server errors (5xx)
 * Does NOT retry 4xx client errors (validation, auth, not found, etc)
 *
 * @param {string} url - Request URL
 * @param {object} options - Fetch options (method, headers, body, etc)
 * @param {number} retries - Number of retry attempts (default 3)
 * @param {number} timeout - Timeout per request in milliseconds (default 5000ms)
 * @returns {Promise<Response>} Fetch response after retries exhausted
 * @throws {Error} If all retries fail or network error on last attempt
 *
 * Retry logic:
 * - Success (2xx) or client error (4xx) → return immediately
 * - Server error (5xx) → retry with exponential backoff: 1s, 2s, 4s
 * - Network timeout → retry with same backoff
 * - Last attempt failure → throw error or return response
 *
 * Example:
 * try {
 *   const response = await fetchWithRetry(url, { method: 'POST', body: JSON.stringify(data) }, 3, 5000);
 *   if (response.ok) {
 *     const data = await response.json();
 *     console.log('Success:', data);
 *   } else {
 *     console.error('Request failed:', response.status);
 *   }
 * } catch (err) {
 *   console.error('All retries failed:', err.message);
 * }
 */
export const fetchWithRetry = async (url, options = {}, retries = 3, timeout = 5000) => {
  let lastError = null;

  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetchWithTimeout(url, options, timeout);

      // Success - return immediately
      if (response.ok) {
        return response;
      }

      // Client error (4xx) - don't retry
      if (response.status < 500) {
        debugWarn(`[fetchWithRetry] Client error ${response.status}, not retrying`);
        return response;
      }

      // Server error (5xx) - retry with backoff
      if (i < retries - 1) {
        const delay = 1000 * Math.pow(2, i); // 1s, 2s, 4s
        debugWarn(
          `[fetchWithRetry] Server error ${response.status}, retrying in ${delay}ms (attempt ${i + 1}/${retries})`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      // Last attempt - return response even if error
      return response;
    } catch (err) {
      lastError = err;

      // Last attempt - throw error
      if (i === retries - 1) {
        debugError(`[fetchWithRetry] All ${retries} attempts failed:`, err.message);
        throw err;
      }

      // Retry with backoff
      const delay = 1000 * Math.pow(2, i);
      debugWarn(
        `[fetchWithRetry] Network error (${err.message}), retrying in ${delay}ms (attempt ${i + 1}/${retries})`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // Should not reach here, but throw lastError as fallback
  throw lastError || new Error('Fetch failed after all retries');
};

// ==================== EXPORTS ====================

export default {
  fetchWithTimeout,
  fetchWithRetry,
};
