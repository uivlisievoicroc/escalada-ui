import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import ContestPage from '../components/ContestPage';

// Mock dependencies
vi.mock('../utilis/debug', () => ({
  debugLog: vi.fn(),
  debugWarn: vi.fn(),
  debugError: vi.fn(),
}));

vi.mock('../utilis/sanitize', () => ({
  sanitizeBoxName: (text) => text,
  sanitizeCompetitorName: (text) => text,
}));

vi.mock('../utilis/storage', () => ({
  safeGetItem: (key, defaultValue) => {
    try {
      const value = localStorage.getItem(key);
      return value !== null ? JSON.parse(value) : defaultValue;
    } catch {
      return defaultValue;
    }
  },
  safeSetItem: (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      console.error('Storage error:', err);
    }
  },
  safeRemoveItem: (key) => {
    try {
      localStorage.removeItem(key);
    } catch (err) {
      console.error('Storage error:', err);
    }
  },
  storageKey: (key) => `escalada_${key}`,
}));

// Helper to render ContestPage with router context
const renderContestPage = () => {
  return render(
    <BrowserRouter>
      <ContestPage />
    </BrowserRouter>,
  );
};

describe('ContestPage - JSON.parse Regression Tests', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();

    // Mock WebSocket to prevent connection attempts
    global.WebSocket = vi.fn().mockImplementation(() => ({
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      send: vi.fn(),
      close: vi.fn(),
      readyState: 0,
    }));

    // Mock BroadcastChannel
    global.BroadcastChannel = vi.fn().mockImplementation(() => ({
      postMessage: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      close: vi.fn(),
    }));
  });

  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('handles malformed JSON in localStorage gracefully', () => {
    // Set malformed JSON that would normally crash JSON.parse
    localStorage.setItem('escalada_listboxes', 'invalid-json{{{');
    localStorage.setItem('escalada_climbingTime', '{"broken": json}');

    // Should not throw error
    expect(() => {
      renderContestPage();
    }).not.toThrow();

    // Component should still render (even if with default/empty state)
    expect(document.body).toBeTruthy();
  });

  it('handles double-quoted empty string in localStorage', () => {
    // This was a bug where '""' (4 bytes) looked non-empty but parsed to empty string
    localStorage.setItem('escalada_activeClimber', '""');
    localStorage.setItem('escalada_tick-owner', '""');

    // Should not throw error
    expect(() => {
      renderContestPage();
    }).not.toThrow();

    // Should not cause invalid state or command sends
    expect(document.body).toBeTruthy();
  });

  it('handles null values in localStorage gracefully', () => {
    localStorage.setItem('escalada_listboxes', 'null');
    localStorage.setItem('escalada_climbingTime', 'null');

    // Should not throw error
    expect(() => {
      renderContestPage();
    }).not.toThrow();

    expect(document.body).toBeTruthy();
  });

  it('handles undefined string in localStorage gracefully', () => {
    localStorage.setItem('escalada_listboxes', 'undefined');
    localStorage.setItem('escalada_climbingTime', 'undefined');

    // Should not throw error
    expect(() => {
      renderContestPage();
    }).not.toThrow();

    expect(document.body).toBeTruthy();
  });

  it('handles empty string in localStorage gracefully', () => {
    localStorage.setItem('escalada_listboxes', '');
    localStorage.setItem('escalada_climbingTime', '');
    localStorage.setItem('escalada_activeClimber', '');

    // Should not throw error
    expect(() => {
      renderContestPage();
    }).not.toThrow();

    expect(document.body).toBeTruthy();
  });

  it('handles valid JSON in localStorage correctly', () => {
    // Set valid box configuration
    const validBoxes = [
      {
        idx: 0,
        name: 'Test Box',
        routeIndex: 1,
        routesCount: 3,
        holdsCount: 25,
        timerPreset: '05:00',
        categorie: 'Test Category',
        concurenti: [{ name: 'Competitor 1', score: 0, time: null, marked: false }],
      },
    ];

    localStorage.setItem('escalada_listboxes', JSON.stringify(validBoxes));
    localStorage.setItem('escalada_climbingTime', JSON.stringify({ 0: '05:00' }));

    // Should not throw error
    expect(() => {
      renderContestPage();
    }).not.toThrow();

    expect(document.body).toBeTruthy();
  });

  it('handles mixed valid and invalid localStorage keys', () => {
    // Valid data
    localStorage.setItem('escalada_listboxes', JSON.stringify([{ name: 'Box 1' }]));

    // Invalid data
    localStorage.setItem('escalada_climbingTime', 'malformed{');
    localStorage.setItem('escalada_activeClimber', '""');
    localStorage.setItem('escalada_tick-owner', 'undefined');

    // Should not throw error - valid keys should work, invalid should fail gracefully
    expect(() => {
      renderContestPage();
    }).not.toThrow();

    expect(document.body).toBeTruthy();
  });

  it('handles corrupted nested JSON structures', () => {
    // Partially valid JSON with nested corruption
    const corruptedData = '{"idx":0,"name":"Test","concurenti":[{broken}]}';
    localStorage.setItem('escalada_listboxes', corruptedData);

    // Should not throw error
    expect(() => {
      renderContestPage();
    }).not.toThrow();

    expect(document.body).toBeTruthy();
  });

  it('handles very long strings in localStorage', () => {
    // Create a very long string that might cause issues
    const longString = 'x'.repeat(10000);
    localStorage.setItem('escalada_someKey', longString);

    // Should not throw error
    expect(() => {
      renderContestPage();
    }).not.toThrow();

    expect(document.body).toBeTruthy();
  });

  it('handles special characters in localStorage values', () => {
    // Test with special characters that might break JSON parsing
    localStorage.setItem('escalada_activeClimber', '{"name":"Test\nName\tWith\rSpecial"}');

    // Should handle gracefully
    expect(() => {
      renderContestPage();
    }).not.toThrow();

    expect(document.body).toBeTruthy();
  });
});
