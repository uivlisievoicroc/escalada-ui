// Normalizes values read from localStorage storage events
// Handles JSON-encoded empty strings (e.g., '""'), null/undefined, and trims whitespace
export function normalizeStorageValue(raw) {
  let normalized = raw ?? '';

  // Coerce to string for consistent handling
  if (typeof normalized !== 'string') {
    normalized = String(normalized);
  }

  // Attempt to parse JSON-encoded primitives
  if (normalized.startsWith('"') || normalized === 'null' || normalized === 'undefined') {
    try {
      const parsed = JSON.parse(normalized);
      normalized = parsed ?? '';
    } catch {
      // leave as-is if not valid JSON
    }
  }

  if (typeof normalized !== 'string') {
    normalized = String(normalized);
  }

  const trimmed = normalized.trim();

  // Treat empty/invalid values as empty string so callers can guard easily
  if (!trimmed || trimmed === '""' || trimmed === 'null' || trimmed === 'undefined') {
    return '';
  }

  return trimmed;
}
