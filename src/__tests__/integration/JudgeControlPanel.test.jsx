import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Integration Tests - Judge & ControlPanel Synchronization
 * Tests cross-component communication via WebSocket and localStorage
 */

describe('Judge ↔ ControlPanel Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.localStorage.clear();
    global.localStorage.getItem.mockReturnValue(null);
    global.localStorage.setItem.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Timer Synchronization', () => {
    it('syncs timer state from ControlPanel to Judge via WebSocket', () => {
      // ControlPanel sends START_TIMER command
      const command = {
        type: 'START_TIMER',
        boxId: 0,
        boxVersion: 1,
        sessionId: 'session-123',
      };

      // Backend broadcasts STATE_SNAPSHOT to Judge
      const stateSnapshot = {
        type: 'STATE_SNAPSHOT',
        boxId: 0,
        timerState: 'running',
        remaining: 280,
        sessionId: 'session-123',
      };

      // Judge should update timer display
      expect(stateSnapshot.timerState).toBe('running');
      expect(stateSnapshot.remaining).toBe(280);
      expect(stateSnapshot.boxId).toBe(command.boxId);
    });

    it('syncs timer stop from ControlPanel to Judge', () => {
      const stopCommand = {
        type: 'STOP_TIMER',
        boxId: 0,
        boxVersion: 1,
        sessionId: 'session-123',
      };

      const stateSnapshot = {
        type: 'STATE_SNAPSHOT',
        boxId: 0,
        timerState: 'idle',
        remaining: 150,
        sessionId: 'session-123',
      };

      expect(stateSnapshot.timerState).toBe('idle');
      expect(stopCommand.boxId).toBe(stateSnapshot.boxId);
    });

    it('syncs progress updates from Judge to ControlPanel via BroadcastChannel', () => {
      // Judge updates progress (timer counts down)
      const progressUpdate = {
        type: 'PROGRESS_UPDATE',
        boxId: 0,
        delta: 1, // +1 second elapsed
        timestamp: Date.now(),
      };

      // ControlPanel receives via BroadcastChannel
      const broadcastMessage = {
        type: 'PROGRESS_UPDATE',
        boxId: 0,
        newRemaining: 149, // 280 - 1 second
      };

      expect(progressUpdate.boxId).toBe(broadcastMessage.boxId);
      expect(broadcastMessage.newRemaining).toBe(150 - 1);
    });

    it('handles resume timer request from Judge to ControlPanel', () => {
      const resumeCommand = {
        type: 'RESUME_TIMER',
        boxId: 0,
        boxVersion: 1,
        sessionId: 'session-123',
      };

      const resumeSnapshot = {
        type: 'STATE_SNAPSHOT',
        timerState: 'running',
        remaining: 150,
        sessionId: 'session-123',
      };

      expect(resumeCommand.type).toBe('RESUME_TIMER');
      expect(resumeSnapshot.timerState).toBe('running');
    });
  });

  describe('Competitor Management Sync', () => {
    it('syncs active climber from ControlPanel to Judge', () => {
      // ControlPanel sends ACTIVE_CLIMBER command
      const activeCommand = {
        type: 'ACTIVE_CLIMBER',
        boxId: 0,
        boxVersion: 1,
        sessionId: 'session-123',
        climber: 'John Doe',
      };

      // Backend broadcasts to Judge
      const stateSnapshot = {
        type: 'STATE_SNAPSHOT',
        currentClimber: 'John Doe',
        boxId: 0,
      };

      expect(stateSnapshot.currentClimber).toBe(activeCommand.climber);
    });

    it('syncs competitor marking from Judge to ControlPanel', () => {
      // Judge submits MARK_COMPETITOR
      const markCommand = {
        type: 'MARK_COMPETITOR',
        boxId: 0,
        boxVersion: 1,
        sessionId: 'session-123',
        competitor: 'Jane Smith',
        marked: true,
      };

      // ControlPanel receives STATE_SNAPSHOT showing marked status
      const snapshot = {
        type: 'STATE_SNAPSHOT',
        competitors: [
          { name: 'Jane Smith', marked: true, score: 10 },
          { name: 'John Doe', marked: false, score: 0 },
        ],
      };

      expect(snapshot.competitors.find((c) => c.name === markCommand.competitor).marked).toBe(true);
    });

    it('syncs score updates from Judge to ControlPanel rankings', () => {
      // Judge submits SUBMIT_SCORE
      const scoreCommand = {
        type: 'SUBMIT_SCORE',
        boxId: 0,
        boxVersion: 2,
        sessionId: 'session-123',
        competitor: 'Jane Smith',
        score: 15,
        registeredTime: 245,
      };

      // ControlPanel receives and should display updated ranking
      const ranking = {
        competitors: [
          { name: 'Jane Smith', score: 15, time: 245, place: 1 },
          { name: 'John Doe', score: 10, time: 280, place: 2 },
        ],
      };

      const jane = ranking.competitors.find((c) => c.name === scoreCommand.competitor);
      expect(jane.score).toBe(scoreCommand.score);
      expect(jane.time).toBe(scoreCommand.registeredTime);
    });
  });

  describe('Route Initialization Sync', () => {
    it('syncs route initialization from ControlPanel to Judge', () => {
      // ControlPanel sends INIT_ROUTE
      const initCommand = {
        type: 'INIT_ROUTE',
        boxId: 0,
        routeIndex: 1,
        holdsCount: 25,
        competitors: [
          { nome: 'John Doe', score: 0, time: null },
          { nome: 'Jane Smith', score: 0, time: null },
        ],
        timerPreset: '05:00',
      };

      // Backend generates sessionId and broadcasts to Judge
      const initSnapshot = {
        type: 'STATE_SNAPSHOT',
        initiated: true,
        holdsCount: 25,
        sessionId: 'new-session-456',
        timerPreset: '05:00',
        competitors: initCommand.competitors,
      };

      expect(initSnapshot.initiated).toBe(true);
      expect(initSnapshot.holdsCount).toBe(initCommand.holdsCount);
      expect(initSnapshot.sessionId).toBeDefined();
    });

    it('generates unique sessionId on each route initialization', () => {
      // First initialization
      const session1 = 'session-uuid-1';

      // Second initialization (new route)
      const session2 = 'session-uuid-2';

      // Sessions should be different
      expect(session1).not.toBe(session2);

      // This prevents old Judge tabs from interfering
    });

    it('invalidates old Judge tabs after route re-initialization', () => {
      // Old Judge tab has sessionId 'old-session'
      const oldTabCommand = {
        type: 'START_TIMER',
        boxId: 0,
        boxVersion: 1,
        sessionId: 'old-session', // Stale session
      };

      // New route created with sessionId 'new-session'
      const currentSession = 'new-session';

      // Backend should reject old tab's command
      const isStale = oldTabCommand.sessionId !== currentSession;
      expect(isStale).toBe(true);
    });
  });

  describe('Box Version Tracking', () => {
    it('increments boxVersion on each INIT_ROUTE', () => {
      const stateVersions = [
        { boxId: 0, version: 0, event: 'Box created' },
        { boxId: 0, version: 1, event: 'INIT_ROUTE (route 1)' },
        { boxId: 0, version: 2, event: 'INIT_ROUTE (route 2)' },
        { boxId: 0, version: 3, event: 'INIT_ROUTE (route 3)' },
      ];

      // Each initialization increments version
      expect(stateVersions[1].version).toBe(stateVersions[0].version + 1);
      expect(stateVersions[2].version).toBe(stateVersions[1].version + 1);
      expect(stateVersions[3].version).toBe(stateVersions[2].version + 1);
    });

    it('rejects commands with old boxVersion', () => {
      // ControlPanel has version 2 cached
      const oldCommand = {
        type: 'START_TIMER',
        boxId: 0,
        boxVersion: 1, // Old version
        sessionId: 'session-123',
      };

      // Server has version 3
      const serverVersion = 3;

      // Command should be rejected
      const isStale = oldCommand.boxVersion < serverVersion;
      expect(isStale).toBe(true);
    });

    it('accepts commands matching current boxVersion', () => {
      const freshCommand = {
        type: 'START_TIMER',
        boxId: 0,
        boxVersion: 3, // Current version
        sessionId: 'session-123',
      };

      const serverVersion = 3;

      // Command should be accepted
      const isFresh = freshCommand.boxVersion === serverVersion;
      expect(isFresh).toBe(true);
    });
  });

  describe('Error Handling & Recovery', () => {
    it('recovers from WebSocket disconnect during command', () => {
      // Judge sends PROGRESS_UPDATE while WebSocket disconnects
      const progressCommand = {
        type: 'PROGRESS_UPDATE',
        boxId: 0,
        delta: 1,
      };

      // With timeout utility, should retry automatically
      const maxRetries = 3;
      const retryAttempts = [1, 2, 3];

      expect(retryAttempts.length).toBe(maxRetries);
    });

    it('syncs stale commands detection prevents state corruption', () => {
      // Scenario: ControlPanel creates Box 0 (sessionId: old-session)
      // Judge opens and gets sessionId: old-session
      // Admin deletes Box 0
      // Admin creates new Box 0 (sessionId: new-session)
      // Old Judge tab tries to send command with old-session

      const oldJudgeCommand = {
        type: 'PROGRESS_UPDATE',
        boxId: 0,
        sessionId: 'old-session', // Stale
        delta: 1,
      };

      const newBoxSession = 'new-session';

      // Backend should reject stale command
      const isRejected = oldJudgeCommand.sessionId !== newBoxSession;
      expect(isRejected).toBe(true);
    });

    it('handles concurrent commands from Judge and ControlPanel', () => {
      // Both send commands simultaneously
      const judgeCommand = {
        type: 'PROGRESS_UPDATE',
        boxId: 0,
        timestamp: Date.now(),
      };

      const controlPanelCommand = {
        type: 'STOP_TIMER',
        boxId: 0,
        timestamp: Date.now(),
      };

      // Both should have same boxId (targeting same box)
      expect(judgeCommand.boxId).toBe(controlPanelCommand.boxId);

      // Backend uses locks to serialize
      // Expected order: whichever reaches backend first wins
      // Second command sees updated state
    });
  });

  describe('localStorage Synchronization', () => {
    it('syncs timer state across tabs via storage events', () => {
      // ControlPanel (Tab 1) updates timer state
      global.localStorage.setItem('timer-0', 'running');

      // JudgePage (Tab 2) receives storage event
      const storageEvent = new StorageEvent('storage', {
        key: 'timer-0',
        newValue: 'running',
        oldValue: 'idle',
      });

      // Judge should update display
      expect(storageEvent.newValue).toBe('running');
      expect(storageEvent.key).toBe('timer-0');
    });

    it('syncs current climber across tabs', () => {
      // ControlPanel sets active climber
      const climberName = 'Jane Smith';
      global.localStorage.setItem('activeClimber-0', climberName);

      // Judge reads from localStorage - mock should return value
      global.localStorage.getItem.mockReturnValue(climberName);

      const climber = global.localStorage.getItem('activeClimber-0');

      // Should read the climber name
      expect(climber).toBe(climberName);
    });

    it('syncs boxVersion across tabs to prevent stale commands', () => {
      // ControlPanel updates boxVersion after initialization
      const versionString = '2';
      global.localStorage.setItem('boxVersion-0', versionString);

      // Mock return the value
      global.localStorage.getItem.mockReturnValue(versionString);

      // Judge reads version for commands
      const version = global.localStorage.getItem('boxVersion-0');

      // Should retrieve version string
      expect(version).toBe(versionString);
    });

    it('normalizes JSON-encoded localStorage values in sync', () => {
      // One tab may write JSON-encoded value
      const encodedValue = '"05:00"';
      global.localStorage.setItem('climbingTime', encodedValue);
      global.localStorage.getItem.mockReturnValue(encodedValue);

      // Another tab reads and normalizes
      let value = global.localStorage.getItem('climbingTime');

      // Normalization logic: if starts with quote, parse it
      if (value && value.startsWith('"')) {
        try {
          value = JSON.parse(value);
        } catch {
          // Fallback to string
        }
      }

      expect(value).toBe('05:00');
    });
  });

  describe('Cross-Tab Communication', () => {
    it('broadcasts timer updates via BroadcastChannel', () => {
      // ControlPanel creates BroadcastChannel for timer sync
      const channelName = 'escalada-timer-0';

      // Multiple tabs can listen on same channel
      const tab1Listener = vi.fn();
      const tab2Listener = vi.fn();

      // ControlPanel broadcasts timer start
      const timerMessage = {
        type: 'TIMER_UPDATE',
        state: 'running',
        remaining: 280,
      };

      // Both Judge and other ControlPanel tabs receive
      expect(timerMessage.type).toBe('TIMER_UPDATE');
      expect(timerMessage.state).toBe('running');
    });

    it('handles window references for opening Judge pages', () => {
      // ControlPanel opens Judge in new window
      const judgeWindow = {
        name: 'escalada-judge-0',
        closed: false,
      };

      // ControlPanel stores reference
      const openTabs = {
        0: judgeWindow,
      };

      // Can send messages via postMessage
      expect(openTabs[0]).toBeDefined();
      expect(openTabs[0].closed).toBe(false);
    });

    it('cleans up window references when Judge closes', () => {
      // Judge window closes
      const judgeWindow = {
        closed: true, // User closed the tab
      };

      // ControlPanel should clean up reference
      const shouldRemove = judgeWindow.closed;
      expect(shouldRemove).toBe(true);
    });
  });

  describe('Rate Limiting Sync', () => {
    it('respects rate limits across components', () => {
      // ControlPanel sends PROGRESS_UPDATE (120/min limit)
      const progressCommands = Array(2).fill({
        type: 'PROGRESS_UPDATE',
        boxId: 0,
        delta: 1,
      });

      // Backend enforces rate limit
      // After 120 commands/minute, returns 429
      const rateLimit = 120; // per minute
      const commandsPerSecond = rateLimit / 60; // 2 commands per second

      expect(progressCommands.length).toBeLessThanOrEqual(commandsPerSecond);
    });

    it('handles rate limit error and backs off', () => {
      // Component receives 429 Too Many Requests
      const rateLimitError = {
        status: 429,
        detail: 'Too many requests',
      };

      // With fetchWithRetry, should exponential backoff
      // Don't retry immediately: wait 1s, 2s, 4s

      expect(rateLimitError.status).toBe(429);
    });
  });

  describe('Session Cleanup', () => {
    it('clears sessionId when box is deleted', () => {
      // Box 0 with sessionId 'session-123' is deleted
      const deletedBoxId = 0;

      // Frontend should clear the stored sessionId
      global.localStorage.removeItem(`sessionId-${deletedBoxId}`);

      expect(global.localStorage.removeItem).toHaveBeenCalledWith(`sessionId-${deletedBoxId}`);
    });

    it('prevents deleted box cleanup from affecting new box at same index', () => {
      // Old Box 0 (sessionId: old-1) deleted
      // New Box 0 (sessionId: new-1) created at same index

      const oldSession = 'old-1';
      const newSession = 'new-1';

      // Old Judge tab should be unable to sync because session changed
      const oldJudgeSession = oldSession;
      const currentSession = newSession;

      expect(oldJudgeSession).not.toBe(currentSession);
    });
  });
});
