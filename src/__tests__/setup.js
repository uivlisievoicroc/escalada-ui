import '@testing-library/jest-dom';
import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Polyfills to align CI (Node/JS DOM) with browser APIs
// Fetch API
try {
  // Prefer existing global fetch (Node 18+)
  if (typeof globalThis.fetch === 'function') {
    if (typeof window !== 'undefined') {
      if (typeof window.fetch !== 'function') window.fetch = globalThis.fetch.bind(globalThis);
      if (typeof window.Headers === 'undefined' && typeof globalThis.Headers !== 'undefined')
        window.Headers = globalThis.Headers;
      if (typeof window.Request === 'undefined' && typeof globalThis.Request !== 'undefined')
        window.Request = globalThis.Request;
      if (typeof window.Response === 'undefined' && typeof globalThis.Response !== 'undefined')
        window.Response = globalThis.Response;
    }
  } else {
    // Else polyfill using whatwg-fetch if available
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('whatwg-fetch');
  }
} catch (_) {
  // Ignore if not installed; tests that rely on fetch should mock it
}

// URL and URLSearchParams (fallback to Node implementations if missing)
try {
  if (typeof globalThis.URL === 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { URL } = require('url');
    globalThis.URL = URL;
  }
  if (typeof globalThis.URLSearchParams === 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { URLSearchParams } = require('url');
    globalThis.URLSearchParams = URLSearchParams;
  }
} catch (_) {}

// TextEncoder/TextDecoder (used by many libs, including whatwg-url)
try {
  if (
    typeof globalThis.TextEncoder === 'undefined' ||
    typeof globalThis.TextDecoder === 'undefined'
  ) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { TextEncoder, TextDecoder } = require('util');
    if (typeof globalThis.TextEncoder === 'undefined') globalThis.TextEncoder = TextEncoder;
    if (typeof globalThis.TextDecoder === 'undefined') globalThis.TextDecoder = TextDecoder;
  }
} catch (_) {}

// crypto.getRandomValues (for UUIDs or random IDs)
try {
  if (
    typeof globalThis.crypto === 'undefined' ||
    typeof globalThis.crypto.getRandomValues !== 'function'
  ) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodeCrypto = require('crypto');
    globalThis.crypto = {
      // Delegate to Node's secure random
      getRandomValues: (typedArray) => nodeCrypto.randomFillSync(typedArray),
      // Expose subtle if available (Node 16+)
      subtle: nodeCrypto.webcrypto ? nodeCrypto.webcrypto.subtle : undefined,
    };
  }
} catch (_) {}

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

global.localStorage = localStorageMock;

// Mock WebSocket
global.WebSocket = vi.fn(() => ({
  send: vi.fn(),
  close: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
}));

// Mock BroadcastChannel
global.BroadcastChannel = vi.fn(function (name) {
  this.name = name;
  this.postMessage = vi.fn();
  this.addEventListener = vi.fn();
  this.removeEventListener = vi.fn();
  this.close = vi.fn();
});
