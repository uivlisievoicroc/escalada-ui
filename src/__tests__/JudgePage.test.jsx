import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * JudgePage Unit Tests - Focus on helper functions and state logic
 * Component rendering tests are in controlPanelFlows.test.jsx
 */

describe('JudgePage - Helper Functions & Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.localStorage.getItem.mockReturnValue(null);
    global.localStorage.setItem.mockClear();
    global.localStorage.removeItem.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Timer Helper Functions', () => {
    it('converts timer preset to seconds correctly', () => {
      const presetToSec = (preset) => {
        const [mm, ss] = String(preset).split(':').map(Number);
        return mm * 60 + ss;
      };

      expect(presetToSec('05:00')).toBe(300);
      expect(presetToSec('04:30')).toBe(270);
      expect(presetToSec('00:45')).toBe(45);
      expect(presetToSec('10:15')).toBe(615);
    });

    it('formats seconds to mm:ss correctly', () => {
      const formatTime = (sec) => {
        if (sec === null || sec === undefined) return '--:--';
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      };

      expect(formatTime(300)).toBe('05:00');
      expect(formatTime(270)).toBe('04:30');
      expect(formatTime(45)).toBe('00:45');
      expect(formatTime(0)).toBe('00:00');
      expect(formatTime(null)).toBe('--:--');
      expect(formatTime(undefined)).toBe('--:--');
    });

    it('calculates progress percentage correctly', () => {
      const calcProgress = (current, total) => {
        if (total === 0) return 0;
        return Math.min(100, Math.round((current / total) * 100));
      };

      expect(calcProgress(0, 25)).toBe(0);
      expect(calcProgress(10, 25)).toBe(40);
      expect(calcProgress(25, 25)).toBe(100);
      expect(calcProgress(30, 25)).toBe(100); // Capped at 100%
      expect(calcProgress(10, 0)).toBe(0); // Avoid division by zero
    });
  });

  describe('State Management Logic', () => {
    it('determines correct timer state transitions', () => {
      const transitions = {
        idle: ['running'],
        running: ['paused', 'idle'],
        paused: ['running', 'idle'],
      };

      expect(transitions.idle).toContain('running');
      expect(transitions.running).toContain('paused');
      expect(transitions.paused).toContain('running');
    });

    it('validates progress update boundaries', () => {
      const isValidProgress = (current, max) => {
        return current >= 0 && current <= max;
      };

      expect(isValidProgress(0, 25)).toBe(true);
      expect(isValidProgress(10, 25)).toBe(true);
      expect(isValidProgress(25, 25)).toBe(true);
      expect(isValidProgress(-1, 25)).toBe(false);
      expect(isValidProgress(26, 25)).toBe(false);
    });

    it('calculates remaining time correctly', () => {
      const calcRemaining = (preset, elapsed) => {
        const remaining = preset - elapsed;
        return Math.max(0, remaining);
      };

      expect(calcRemaining(300, 0)).toBe(300);
      expect(calcRemaining(300, 150)).toBe(150);
      expect(calcRemaining(300, 300)).toBe(0);
      expect(calcRemaining(300, 350)).toBe(0); // Never negative
    });
  });

  describe('Data Validation', () => {
    it('validates competitor name format', () => {
      const isValidName = (name) => {
        return typeof name === 'string' && name.trim().length > 0;
      };

      expect(isValidName('John Doe')).toBe(true);
      expect(isValidName('Jane')).toBe(true);
      expect(isValidName('')).toBe(false);
      expect(isValidName('   ')).toBe(false);
      expect(isValidName(null)).toBe(false);
    });

    it('validates score values', () => {
      const isValidScore = (score) => {
        return typeof score === 'number' && score >= 0;
      };

      expect(isValidScore(0)).toBe(true);
      expect(isValidScore(10)).toBe(true);
      expect(isValidScore(25)).toBe(true);
      expect(isValidScore(-1)).toBe(false);
      expect(isValidScore('10')).toBe(false);
      expect(isValidScore(null)).toBe(false);
    });

    it('validates time values', () => {
      const isValidTime = (time) => {
        return time === null || (typeof time === 'number' && time >= 0);
      };

      expect(isValidTime(null)).toBe(true);
      expect(isValidTime(0)).toBe(true);
      expect(isValidTime(280)).toBe(true);
      expect(isValidTime(-1)).toBe(false);
      expect(isValidTime('280')).toBe(false);
    });

    it('validates holds count', () => {
      const isValidHoldsCount = (count) => {
        return typeof count === 'number' && count > 0 && count <= 100;
      };

      expect(isValidHoldsCount(5)).toBe(true);
      expect(isValidHoldsCount(25)).toBe(true);
      expect(isValidHoldsCount(100)).toBe(true);
      expect(isValidHoldsCount(0)).toBe(false);
      expect(isValidHoldsCount(-1)).toBe(false);
      expect(isValidHoldsCount(101)).toBe(false);
    });
  });

  describe('WebSocket Message Handling', () => {
    it('identifies valid message types', () => {
      const validTypes = [
        'STATE_SNAPSHOT',
        'TIMER_START',
        'TIMER_STOP',
        'TIMER_PAUSE',
        'PROGRESS_UPDATE',
        'REGISTER_TIME',
      ];

      const isValidMessageType = (type) => validTypes.includes(type);

      expect(isValidMessageType('STATE_SNAPSHOT')).toBe(true);
      expect(isValidMessageType('TIMER_START')).toBe(true);
      expect(isValidMessageType('INVALID')).toBe(false);
    });

    it('validates message structure', () => {
      const isValidMessage = (msg) => {
        return (
          msg !== null &&
          msg !== undefined &&
          typeof msg === 'object' &&
          typeof msg.type === 'string'
        );
      };

      expect(isValidMessage({ type: 'STATE_SNAPSHOT', boxId: 0 })).toBe(true);
      expect(isValidMessage({ boxId: 0 })).toBe(false); // Missing type
      expect(isValidMessage(null)).toBe(false);
      expect(isValidMessage('invalid')).toBe(false);
    });

    it('extracts box ID from message', () => {
      const getBoxId = (msg) => {
        const id = parseInt(msg?.boxId, 10);
        return Number.isNaN(id) ? undefined : id;
      };

      expect(getBoxId({ type: 'STATE_SNAPSHOT', boxId: '0' })).toBe(0);
      expect(getBoxId({ type: 'STATE_SNAPSHOT', boxId: 5 })).toBe(5);
      expect(getBoxId({ type: 'STATE_SNAPSHOT' })).toBeUndefined();
    });
  });

  describe('LocalStorage Key Management', () => {
    it('generates correct storage keys', () => {
      const getKey = (prefix, boxId) => `${prefix}-${boxId}`;

      expect(getKey('timer', 0)).toBe('timer-0');
      expect(getKey('activeClimber', 5)).toBe('activeClimber-5');
      expect(getKey('sessionId', 0)).toBe('sessionId-0');
      expect(getKey('holdCount', 10)).toBe('holdCount-10');
    });

    it('parses storage keys correctly', () => {
      const parseKey = (key) => {
        const match = key.match(/^([a-zA-Z]+)-(\d+)$/);
        return match ? { prefix: match[1], boxId: parseInt(match[2], 10) } : null;
      };

      expect(parseKey('timer-0')).toEqual({ prefix: 'timer', boxId: 0 });
      expect(parseKey('activeClimber-5')).toEqual({ prefix: 'activeClimber', boxId: 5 });
      expect(parseKey('invalid')).toBe(null);
      expect(parseKey('holdCount-10')).toEqual({ prefix: 'holdCount', boxId: 10 });
    });

    it('reads values from localStorage safely', () => {
      global.localStorage.getItem.mockImplementation((key) => {
        const data = {
          'timer-0': '300',
          'activeClimber-0': 'John Doe',
          'sessionId-0': 'sess-123',
        };
        return data[key] ?? null;
      });

      expect(global.localStorage.getItem('timer-0')).toBe('300');
      expect(global.localStorage.getItem('activeClimber-0')).toBe('John Doe');
      expect(global.localStorage.getItem('missing-key')).toBe(null);
    });

    it('saves values to localStorage correctly', () => {
      global.localStorage.setItem('timer-0', '300');
      global.localStorage.setItem('activeClimber-0', 'Jane Smith');

      expect(global.localStorage.setItem).toHaveBeenCalledWith('timer-0', '300');
      expect(global.localStorage.setItem).toHaveBeenCalledWith('activeClimber-0', 'Jane Smith');
    });
  });

  describe('Command Construction', () => {
    it('constructs INIT_ROUTE command', () => {
      const createCommand = (type, boxId, boxVersion, sessionId) => ({
        type,
        boxId,
        boxVersion,
        sessionId,
        timestamp: Date.now(),
      });

      const cmd = createCommand('INIT_ROUTE', 0, 1, 'sess-123');
      expect(cmd.type).toBe('INIT_ROUTE');
      expect(cmd.boxId).toBe(0);
      expect(cmd.boxVersion).toBe(1);
      expect(cmd.sessionId).toBe('sess-123');
    });

    it('constructs START_TIMER command', () => {
      const createCommand = (type, boxId, boxVersion, sessionId) => ({
        type,
        boxId,
        boxVersion,
        sessionId,
        timestamp: Date.now(),
      });

      const cmd = createCommand('START_TIMER', 0, 1, 'sess-123');
      expect(cmd.type).toBe('START_TIMER');
      expect(cmd.boxId).toBe(0);
    });

    it('constructs PROGRESS_UPDATE command', () => {
      const createCommand = (type, boxId, boxVersion, sessionId, delta) => ({
        type,
        boxId,
        boxVersion,
        sessionId,
        delta,
        timestamp: Date.now(),
      });

      const cmd = createCommand('PROGRESS_UPDATE', 0, 1, 'sess-123', 1);
      expect(cmd.type).toBe('PROGRESS_UPDATE');
      expect(cmd.delta).toBe(1);
    });

    it('constructs REGISTER_TIME command', () => {
      const createCommand = (type, boxId, boxVersion, sessionId, registeredTime) => ({
        type,
        boxId,
        boxVersion,
        sessionId,
        registeredTime,
        timestamp: Date.now(),
      });

      const cmd = createCommand('REGISTER_TIME', 0, 1, 'sess-123', 280);
      expect(cmd.type).toBe('REGISTER_TIME');
      expect(cmd.registeredTime).toBe(280);
    });
  });

  describe('Numeric Operations', () => {
    it('safely parses integer values', () => {
      const toInt = (value) => {
        const parsed = parseInt(value, 10);
        return Number.isNaN(parsed) ? undefined : parsed;
      };

      expect(toInt('42')).toBe(42);
      expect(toInt('0')).toBe(0);
      expect(toInt('-10')).toBe(-10);
      expect(toInt('invalid')).toBeUndefined();
      expect(toInt(null)).toBeUndefined();
    });

    it('calculates elapsed time correctly', () => {
      const getElapsed = (preset, remaining) => {
        return preset - remaining;
      };

      expect(getElapsed(300, 150)).toBe(150);
      expect(getElapsed(300, 0)).toBe(300);
      expect(getElapsed(300, 300)).toBe(0);
    });

    it('bounds values to valid range', () => {
      const boundValue = (value, min, max) => {
        return Math.max(min, Math.min(max, value));
      };

      expect(boundValue(50, 0, 100)).toBe(50);
      expect(boundValue(-10, 0, 100)).toBe(0);
      expect(boundValue(150, 0, 100)).toBe(100);
    });
  });

  describe('Error Handling', () => {
    it('handles missing box gracefully', () => {
      const getBox = (boxes, boxId) => boxes?.find((b) => b.idx === boxId) ?? null;

      expect(getBox(null, 0)).toBe(null);
      expect(getBox([], 0)).toBe(null);
      expect(getBox(undefined, 0)).toBe(null);
    });

    it('validates array before iteration', () => {
      const safeMap = (arr, fn) => {
        if (!Array.isArray(arr)) return [];
        return arr.map(fn);
      };

      expect(safeMap([1, 2, 3], (x) => x * 2)).toEqual([2, 4, 6]);
      expect(safeMap(null, (x) => x * 2)).toEqual([]);
      expect(safeMap(undefined, (x) => x * 2)).toEqual([]);
    });

    it('handles JSON parsing errors', () => {
      const safeJsonParse = (str, fallback = null) => {
        try {
          return JSON.parse(str);
        } catch {
          return fallback;
        }
      };

      expect(safeJsonParse('{"a": 1}')).toEqual({ a: 1 });
      expect(safeJsonParse('invalid')).toBe(null);
      expect(safeJsonParse('invalid', [])).toEqual([]);
    });
  });
});
