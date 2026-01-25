import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { BrowserRouter, MemoryRouter, Routes, Route } from 'react-router-dom';
import ContestPage from '../components/ContestPage';

let localStore = {};
let originalConsoleLog;

const setupLocalStorage = () => {
  localStore = {};
  localStorage.getItem.mockImplementation((key) => (key in localStore ? localStore[key] : null));
  localStorage.setItem.mockImplementation((key, value) => {
    localStore[key] = value;
  });
  localStorage.removeItem.mockImplementation((key) => {
    delete localStore[key];
  });
  localStorage.clear.mockImplementation(() => {
    localStore = {};
  });
};

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


const renderContestPageAt = (path = '/contest/0') => {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/contest/:boxId" element={<ContestPage />} />
      </Routes>
    </MemoryRouter>,
  );
};

beforeAll(() => {
  originalConsoleLog = console.log;
  console.log = () => {};
  if (typeof window !== 'undefined' && window.console) {
    window.console.log = () => {};
  }
});

afterAll(() => {
  console.log = originalConsoleLog;
  if (typeof window !== 'undefined' && window.console) {
    window.console.log = originalConsoleLog;
  }
});

describe('ContestPage - JSON.parse Regression Tests', () => {
  beforeEach(() => {
    setupLocalStorage();

    global.fetch = vi.fn(() => new Promise(() => {}));

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

  // SKIPPED: Ranking display with times was moved from ContestPage to RankingsPage.
  // ContestPage now only stores ranking data internally for podium calculation.
  // These tests should be migrated to RankingsPage.test.jsx if needed.
  it.skip('shows times only for top 3 when time criterion is enabled', async () => {
    const listboxes = [
      {
        idx: 0,
        routeIndex: 1,
        routesCount: 1,
        holdsCount: 10,
        holdsCounts: [10],
        categorie: 'Test',
        concurenti: [
          { nume: 'Ana', marked: false },
          { nume: 'Bogdan', marked: false },
          { nume: 'Carmen', marked: false },
          { nume: 'Dan', marked: false },
        ],
      },
    ];

    localStorage.setItem('listboxes', JSON.stringify(JSON.stringify(listboxes)));
    localStorage.setItem('timeCriterionEnabled-0', JSON.stringify('on'));

    renderContestPageAt('/contest/0');

    const sendScore = (competitor, score, registeredTime) => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'SUBMIT_SCORE',
            boxId: 0,
            competitor,
            score,
            registeredTime,
          },
        }),
      );
    };

    await act(async () => {
      sendScore('Ana', 10, 120);
    });
    await act(async () => {
      sendScore('Bogdan', 9, 150);
    });
    await act(async () => {
      sendScore('Carmen', 8, 180);
    });
    await act(async () => {
      sendScore('Dan', 7, 210);
    });

    expect(await screen.findByText('02:00')).toBeInTheDocument();
    expect(screen.getByText('02:30')).toBeInTheDocument();
    expect(screen.getByText('03:00')).toBeInTheDocument();
    expect(screen.queryByText('03:30')).toBeNull();

    await act(async () => {
      sendScore('Dan', 11, 110);
    });

    expect(await screen.findByText('01:50')).toBeInTheDocument();
    expect(screen.queryByText('03:00')).toBeNull();
  });

  // SKIPPED: Ranking display with tie ordering was moved from ContestPage to RankingsPage.
  it.skip('does not break ties by time and orders ties by name', async () => {
    const listboxes = [
      {
        idx: 0,
        routeIndex: 1,
        routesCount: 1,
        holdsCount: 10,
        holdsCounts: [10],
        categorie: 'Test',
        concurenti: [
          { nume: 'Zoe', marked: false },
          { nume: 'Ana', marked: false },
        ],
      },
    ];

    localStorage.setItem('listboxes', JSON.stringify(JSON.stringify(listboxes)));
    localStorage.setItem('timeCriterionEnabled-0', JSON.stringify('on'));

    renderContestPageAt('/contest/0');

    const sendScore = (competitor, score, registeredTime) => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'SUBMIT_SCORE',
            boxId: 0,
            competitor,
            score,
            registeredTime,
          },
        }),
      );
    };

    await act(async () => {
      sendScore('Zoe', 10, 60);
    });
    await act(async () => {
      sendScore('Ana', 10, 120);
    });

    const ana = await screen.findByText('1. Ana');
    const zoe = screen.getByText('1. Zoe');
    expect(ana.compareDocumentPosition(zoe) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

});
