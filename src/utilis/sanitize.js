/**
 * Sanitization utilities for preventing XSS attacks
 * Uses DOMPurify to strip HTML/JavaScript from user-generated content
 */

import DOMPurify from 'dompurify';

/**
 * Sanitize text by stripping all HTML tags and dangerous content
 * @param {string} text - Text to sanitize
 * @returns {string} - Sanitized text with all HTML removed
 */
export const sanitizeText = (text) => {
  if (!text || typeof text !== 'string') {
    return '';
  }

  // Strip ALL HTML tags (ALLOWED_TAGS: [])
  // This prevents XSS like: <script>alert(1)</script> or <img onerror="alert(1)">
  return DOMPurify.sanitize(text, { ALLOWED_TAGS: [] });
};

/**
 * Sanitize box/category name for display
 * @param {string} name - Category or box name
 * @returns {string} - Sanitized name
 */
export const sanitizeBoxName = (name) => {
  return sanitizeText(name);
};

/**
 * Sanitize competitor name for display
 * @param {string} name - Competitor name
 * @returns {string} - Sanitized name
 */
export const sanitizeCompetitorName = (name) => {
  return sanitizeText(name);
};

/**
 * Normalize competitor names for internal matching across FE/BE.
 * Mirrors escalada-core InputSanitizer.sanitize_competitor_name.
 * @param {string} name
 * @returns {string}
 */
export const normalizeCompetitorKey = (name) => {
  if (!name || typeof name !== 'string') return '';

  const trimmed = name.trim().slice(0, 255).replace(/\0/g, '');
  if (!trimmed) return '';

  // Remove dangerous characters (keep Unicode letters/diacritics intact).
  const withoutDangerous = trimmed.replace(/[<>{}[\]\\|;()&$`"*]/g, '');
  // Remove ASCII control chars without a control-char regex (keeps eslint rule happy).
  const withoutControl = [...withoutDangerous]
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join('');
  return withoutControl.trim();
};
