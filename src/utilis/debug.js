/**
 * Debug utility for environment-gated logging
 * In development (DEV), all logs are printed to console
 * In production (PROD), only errors are logged
 *
 * Usage:
 *   import { debugLog, debugWarn, debugError } from '../utilis/debug';
 *   debugLog('Message with args:', arg1, arg2); // Only in DEV
 *   debugWarn('Warning message'); // Only in DEV
 *   debugError('Error message'); // Always logged
 */

const DEBUG = import.meta.env.DEV;

/**
 * Log message (debug level - DEV only)
 * @param {...any} args - Arguments to log
 */
export const debugLog = (...args) => {
  if (DEBUG) {
    console.log(...args);
  }
};

/**
 * Log warning message (DEV only)
 * @param {...any} args - Arguments to log
 */
export const debugWarn = (...args) => {
  if (DEBUG) {
    console.warn(...args);
  }
};

/**
 * Log error message (ALWAYS logged, even in PROD)
 * @param {...any} args - Arguments to log
 */
export const debugError = (...args) => {
  console.error(...args);
};

export default {
  debugLog,
  debugWarn,
  debugError,
};
