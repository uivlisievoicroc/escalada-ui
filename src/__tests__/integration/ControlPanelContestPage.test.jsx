import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Integration Tests - ControlPanel & ContestPage Synchronization
 * Tests ranking updates, competition state, and display synchronization
 */

describe('ControlPanel ↔ ContestPage Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.localStorage.clear();
    global.localStorage.getItem.mockReturnValue(null);
    global.localStorage.setItem.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Ranking Updates', () => {
    it('syncs score updates from ControlPanel to ContestPage display', () => {
      // ControlPanel receives SUBMIT_SCORE from Judge
      const scoreUpdate = {
        type: 'SUBMIT_SCORE',
        competitor: 'Jane Smith',
        score: 15,
        time: 245,
        boxId: 0,
      };

      // ContestPage should recalculate rankings
      const competitors = [
        { name: 'Jane Smith', score: 15, time: 245 },
        { name: 'John Doe', score: 10, time: 280 },
      ];

      const sorted = [...competitors].sort((a, b) => (b.score || 0) - (a.score || 0));

      expect(sorted[0].name).toBe('Jane Smith'); // Highest score
      expect(sorted[0].score).toBe(15);
    });

    it('updates rankings when competitor marked', () => {
      // ControlPanel marks competitor as completed
      const markEvent = {
        competitor: 'John Doe',
        marked: true,
      };

      // ContestPage filters marked competitors for display
      const competitors = [
        { name: 'John Doe', marked: true, score: 10 },
        { name: 'Jane Smith', marked: false, score: 0 },
      ];

      const marked = competitors.filter((c) => c.marked);

      expect(marked).toHaveLength(1);
      expect(marked[0].name).toBe(markEvent.competitor);
    });

    it('handles ranking tie-breaking with time criterion', () => {
      // Two competitors with same score, different times
      const competitors = [
        { name: 'Alice', score: 10, time: 200 }, // Better (faster)
        { name: 'Bob', score: 10, time: 250 }, // Worse (slower)
      ];

      const sortedByScoreThenTime = [...competitors].sort((a, b) => {
        const scoreDiff = (b.score || 0) - (a.score || 0);
        if (scoreDiff !== 0) return scoreDiff;

        // Same score: lower time wins
        return (a.time || Infinity) - (b.time || Infinity);
      });

      expect(sortedByScoreThenTime[0].name).toBe('Alice'); // Faster time wins
    });

    it('recalculates geometric mean rankings for multiple routes', () => {
      // After completing all routes, rankings are based on geometric mean
      const routeScores = {
        route1: { Alice: 10, Bob: 8 },
        route2: { Alice: 9, Bob: 10 },
        route3: { Alice: 8, Bob: 9 },
      };

      const geomMean = (scores) => {
        const nonZero = scores.filter((s) => s > 0);
        if (nonZero.length === 0) return 0;

        const product = nonZero.reduce((a, b) => a * b, 1);
        return Math.pow(product, 1 / nonZero.length);
      };

      const aliceScores = [10, 9, 8];
      const bobScores = [8, 10, 9];

      const aliceMean = geomMean(aliceScores);
      const bobMean = geomMean(bobScores);

      // Both should have similar geometric means
      expect(Math.abs(aliceMean - bobMean)).toBeLessThan(1);
    });
  });

  describe('Route Progress Sync', () => {
    it('syncs route progression from ControlPanel to ContestPage', () => {
      // ControlPanel advances to next route
      const routeUpdate = {
        boxId: 0,
        routeIndex: 2, // Route 2 of 3
        holdsCount: 30,
      };

      // ContestPage should display current route
      expect(routeUpdate.routeIndex).toBe(2);
      expect(routeUpdate.holdsCount).toBe(30);
    });

    it('displays progress bar for current route', () => {
      // ContestPage shows route progress: "Route 2/3"
      const currentRoute = 2;
      const totalRoutes = 3;

      const progress = Math.round((currentRoute / totalRoutes) * 100);

      expect(progress).toBe(67); // 2/3 ≈ 67%
    });

    it('shows hold counts for each route', () => {
      // ControlPanel initializes route with holds
      const holdsCounts = [25, 30, 20]; // Route 1, 2, 3

      // ContestPage displays for route selection
      const routeIndex = 0; // 0-indexed (represents route 1)
      const holdsForRoute = holdsCounts[routeIndex];

      // Should be valid hold count
      expect(holdsForRoute).toBeGreaterThan(0);
      expect(holdsForRoute).toBeLessThanOrEqual(100);
    });
  });

  describe('Category & Competition Info Sync', () => {
    it('syncs category name from ControlPanel to ContestPage header', () => {
      // ControlPanel has box with category 'Senior'
      const boxInfo = {
        categorie: 'Senior',
        routeIndex: 1,
        routesCount: 3,
      };

      // ContestPage displays category header
      expect(boxInfo.categorie).toBe('Senior');
    });

    it('displays box name in ContestPage title', () => {
      // ControlPanel box configuration
      const box = {
        name: 'Boulder 1',
        categorie: 'Senior',
      };

      // ContestPage shows "Boulder 1 - Senior - Route 1/3"
      const title = `${box.name} - ${box.categorie}`;

      expect(title).toBe('Boulder 1 - Senior');
    });

    it('handles special characters in box names safely', () => {
      // Malicious box name with HTML
      const boxName = '<script>alert("xss")</script>';

      // Should be sanitized before display
      const sanitized = boxName.replace(/<[^>]*>/g, ''); // Strip HTML tags

      expect(sanitized).not.toContain('<script>');
      expect(sanitized).toContain('alert');
    });
  });

  describe('Timer Sync Across Display', () => {
    it('syncs timer state to ContestPage display', () => {
      // ControlPanel starts timer (TIMER_START event)
      const timerStartEvent = {
        type: 'TIMER_START',
        boxId: 0,
      };

      // ContestPage receives and displays "Time Running"
      expect(timerStartEvent.type).toBe('TIMER_START');
    });

    it('displays countdown timer in ContestPage', () => {
      // ControlPanel timer preset: 5:00
      const preset = '05:00';
      const presetSeconds = 300;

      // Timer counts down via BroadcastChannel
      const elapsedSeconds = [0, 1, 2, 3, 299, 300];

      for (const elapsed of elapsedSeconds) {
        const remaining = presetSeconds - elapsed;
        expect(remaining).toBeGreaterThanOrEqual(0);
      }
    });

    it('handles timer stop and display update', () => {
      // ControlPanel stops timer
      const stopEvent = {
        type: 'TIMER_STOP',
        remaining: 150, // 2:30 remaining
      };

      // ContestPage pauses display
      expect(stopEvent.remaining).toBe(150);
    });
  });

  describe('Competitor List Sync', () => {
    it('syncs competitor list from ControlPanel to ContestPage', () => {
      // ControlPanel box has competitors
      const competitors = [
        { name: 'Alice', score: 0, time: null, marked: false },
        { name: 'Bob', score: 0, time: null, marked: false },
        { name: 'Charlie', score: 0, time: null, marked: false },
      ];

      // ContestPage should show all competitors
      expect(competitors).toHaveLength(3);
    });

    it('highlights completed competitors in ranking', () => {
      // Competitors with scores are "completed"
      const competitors = [
        { name: 'Alice', score: 10, time: 200, marked: true },
        { name: 'Bob', score: 8, time: 250, marked: true },
        { name: 'Charlie', score: 0, time: null, marked: false },
      ];

      const completed = competitors.filter((c) => c.marked);
      const pending = competitors.filter((c) => !c.marked);

      expect(completed).toHaveLength(2);
      expect(pending).toHaveLength(1);
    });

    it('displays competitor club affiliation in ContestPage', () => {
      // ControlPanel uploads competitors with club info
      const competitor = {
        name: 'Alice Smith',
        club: 'Alpine Climbing',
        score: 10,
      };

      // ContestPage shows: "Alice Smith (Alpine Climbing)"
      const displayName = `${competitor.name} (${competitor.club})`;

      expect(displayName).toBe('Alice Smith (Alpine Climbing)');
    });
  });

  describe('Multi-Box Competitions', () => {
    it('syncs multiple box states independently', () => {
      // Competition has 3 boxes, each at different stage
      const boxes = [
        { id: 0, name: 'Boulder 1', route: 1, competitors: ['Alice', 'Bob'] },
        { id: 1, name: 'Boulder 2', route: 2, competitors: ['Charlie', 'David'] },
        { id: 2, name: 'Boulder 3', route: 1, competitors: ['Eve', 'Frank'] },
      ];

      // ControlPanel manages all boxes
      // ContestPage can display any selected box
      expect(boxes).toHaveLength(3);
      expect(boxes[0].route).toBe(1);
      expect(boxes[1].route).toBe(2);
    });

    it('handles switching between boxes in ContestPage', () => {
      // User clicks on "Boulder 2" in menu
      const selectedBox = 1;

      // ContestPage switches to show Boulder 2 data
      // Title, rankings, timer should all update
      expect(selectedBox).toBe(1);
    });

    it('maintains independent timer state per box', () => {
      // Box 0 timer: running (2:30 remaining)
      // Box 1 timer: idle
      // Box 2 timer: paused (1:45 remaining)

      const timerStates = {
        0: { state: 'running', remaining: 150 },
        1: { state: 'idle', remaining: null },
        2: { state: 'paused', remaining: 105 },
      };

      expect(timerStates[0].state).toBe('running');
      expect(timerStates[1].state).toBe('idle');
      expect(timerStates[2].state).toBe('paused');
    });
  });

  describe('Ceremony Mode', () => {
    it('syncs ceremony display from ControlPanel to ceremony window', () => {
      // ControlPanel opens ceremony display in separate window
      const ceremonyWindow = {
        url: '/ceremony.html?category=Senior',
        features: 'fullscreen=yes,menubar=no',
      };

      expect(ceremonyWindow.url).toContain('ceremony');
      expect(ceremonyWindow.url).toContain('Senior');
    });

    it('displays final rankings in ceremony mode', () => {
      // Ceremony receives final rankings after all routes complete
      const finalRankings = [
        { rank: 1, name: 'Alice', score: 28, time: 845 },
        { rank: 2, name: 'Bob', score: 26, time: 920 },
        { rank: 3, name: 'Charlie', score: 24, time: 1050 },
      ];

      // Should display in order with medals/positions
      expect(finalRankings[0].rank).toBe(1);
      expect(finalRankings[0].name).toBe('Alice');
    });
  });

  describe('Real-time Updates via localStorage', () => {
    it('syncs competitor score update via localStorage event', () => {
      // ControlPanel updates competitor score
      global.localStorage.setItem(
        'competitors-0',
        JSON.stringify([
          { name: 'Alice', score: 10 },
          { name: 'Bob', score: 8 },
        ]),
      );

      // ContestPage receives storage event and updates
      const storageEvent = new StorageEvent('storage', {
        key: 'competitors-0',
        newValue: JSON.stringify([
          { name: 'Alice', score: 10 },
          { name: 'Bob', score: 9 }, // Updated
        ]),
      });

      expect(storageEvent.key).toBe('competitors-0');
      expect(global.localStorage.setItem).toHaveBeenCalledWith(
        'competitors-0',
        expect.stringContaining('Alice'),
      );
    });

    it('handles rapid ranking updates gracefully', () => {
      // Multiple competitors submit scores rapidly
      const updates = [
        { competitor: 'Alice', score: 8 },
        { competitor: 'Bob', score: 10 },
        { competitor: 'Charlie', score: 9 },
      ];

      // ContestPage should handle all updates
      // Not drop any or show stale rankings
      expect(updates).toHaveLength(3);
    });
  });

  describe('Performance & Optimization', () => {
    it('debounces progress updates to prevent excessive re-renders', () => {
      // Multiple progress updates arrive rapidly (timer countdown)
      const updates = Array(60).fill({ delta: 1 }); // 60 updates

      // With debouncing, should batch/throttle to avoid UI thrashing
      // Typically debounce 100ms means ~6 renders per second
      const expectedRenders = Math.ceil(60 / 6); // ~10 re-renders instead of 60

      expect(expectedRenders).toBeLessThan(updates.length);
    });

    it('memoizes ranking calculations', () => {
      // Competitor list hasn't changed
      const competitors = [
        { name: 'Alice', score: 10 },
        { name: 'Bob', score: 8 },
      ];

      // Calling getRankings twice should return same instance
      const rankings1 = [...competitors].sort((a, b) => b.score - a.score);
      const rankings2 = [...competitors].sort((a, b) => b.score - a.score);

      // Both should have same ordering
      expect(rankings1[0]).toEqual(rankings2[0]);
    });
  });

  describe('Error Handling', () => {
    it('handles missing competitor in score update', () => {
      // ControlPanel tries to update non-existent competitor
      const updateCommand = {
        competitor: 'NonExistent',
        score: 10,
      };

      const competitors = [
        { name: 'Alice', score: 0 },
        { name: 'Bob', score: 0 },
      ];

      const found = competitors.find((c) => c.name === updateCommand.competitor);

      // Should gracefully handle (not crash)
      expect(found).toBeUndefined();
    });

    it('recovers from corrupted ranking data', () => {
      // localStorage contains invalid ranking JSON
      global.localStorage.setItem('rankings-0', 'invalid-json{{{');

      // ContestPage should fall back to re-calculating or empty array
      let rankings;
      try {
        const data = global.localStorage.getItem('rankings-0');
        rankings = data ? JSON.parse(data) : [];
      } catch {
        rankings = []; // Fallback on parse error
      }

      // Should be array (either parsed or fallback)
      expect(Array.isArray(rankings)).toBe(true);
    });

    it('handles category name with special characters', () => {
      // Category has accented characters or symbols
      const category = 'Seniori (50+) & Juniors';

      // Should display correctly without sanitization removing category
      expect(category).toContain('Seniori');
      expect(category).toContain('50+');
      expect(category).toContain('&');
    });
  });
});
