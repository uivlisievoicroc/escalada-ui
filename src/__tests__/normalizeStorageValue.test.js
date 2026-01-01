import { describe, it, expect } from 'vitest';
import { normalizeStorageValue } from '../utilis/normalizeStorageValue';

describe('normalizeStorageValue', () => {
  it('returns empty string for nullish', () => {
    expect(normalizeStorageValue(null)).toBe('');
    expect(normalizeStorageValue(undefined)).toBe('');
  });

  it('trims whitespace', () => {
    expect(normalizeStorageValue('   Ion  ')).toBe('Ion');
  });

  it('parses JSON-encoded empty string and null', () => {
    expect(normalizeStorageValue('""')).toBe('');
    expect(normalizeStorageValue('null')).toBe('');
    expect(normalizeStorageValue('undefined')).toBe('');
  });

  it('parses JSON-encoded valid string', () => {
    expect(normalizeStorageValue('"Ion"')).toBe('Ion');
  });

  it('passes through regular strings', () => {
    expect(normalizeStorageValue('Ion')).toBe('Ion');
  });
});
