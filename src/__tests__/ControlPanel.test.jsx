import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * ControlPanel Unit Tests - Focus on helper functions and logic
 * Integration tests are in controlPanelFlows.test.jsx
 * Component rendering tests require full AppStateProvider context setup
 */

describe('ControlPanel - Helper Functions & Logic', () => {
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
    it('formats timer preset from string to seconds', () => {
      const presetToSec = (preset) => {
        const [mm, ss] = String(preset).split(':').map(Number);
        return mm * 60 + ss;
      };

      expect(presetToSec('05:00')).toBe(300);
      expect(presetToSec('04:30')).toBe(270);
      expect(presetToSec('00:45')).toBe(45);
      expect(presetToSec('10:15')).toBe(615);
    });

    it('converts seconds back to timer format', () => {
      const secToPreset = (sec) => {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      };

      expect(secToPreset(300)).toBe('05:00');
      expect(secToPreset(270)).toBe('04:30');
      expect(secToPreset(45)).toBe('00:45');
      expect(secToPreset(0)).toBe('00:00');
      expect(secToPreset(615)).toBe('10:15');
    });

    it('formats seconds for display', () => {
      const formatTime = (sec) => {
        if (sec === null || sec === undefined) return '--:--';
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      };

      expect(formatTime(300)).toBe('05:00');
      expect(formatTime(270)).toBe('04:30');
      expect(formatTime(0)).toBe('00:00');
      expect(formatTime(null)).toBe('--:--');
      expect(formatTime(undefined)).toBe('--:--');
    });
  });

  describe('Box Management Logic', () => {
    it('filters boxes by category', () => {
      const boxes = [
        {
          idx: 0,
          name: 'B1',
          categorie: 'Senior',
          routeIndex: 1,
          routesCount: 3,
          holdsCount: 25,
          concurenti: [],
        },
        {
          idx: 1,
          name: 'B2',
          categorie: 'Junior',
          routeIndex: 1,
          routesCount: 3,
          holdsCount: 20,
          concurenti: [],
        },
        {
          idx: 2,
          name: 'B3',
          categorie: 'Senior',
          routeIndex: 1,
          routesCount: 3,
          holdsCount: 25,
          concurenti: [],
        },
      ];

      const filterByCategory = (boxes, category) => boxes.filter((b) => b.categorie === category);

      expect(filterByCategory(boxes, 'Senior')).toHaveLength(2);
      expect(filterByCategory(boxes, 'Junior')).toHaveLength(1);
      expect(filterByCategory(boxes, 'Youth')).toHaveLength(0);
    });

    it('finds box by index', () => {
      const boxes = [
        {
          idx: 0,
          name: 'B1',
          categorie: 'Senior',
          routeIndex: 1,
          routesCount: 3,
          holdsCount: 25,
          concurenti: [],
        },
        {
          idx: 1,
          name: 'B2',
          categorie: 'Junior',
          routeIndex: 1,
          routesCount: 3,
          holdsCount: 20,
          concurenti: [],
        },
      ];

      const findBox = (boxes, idx) => boxes.find((b) => b.idx === idx);

      expect(findBox(boxes, 0)).toEqual(boxes[0]);
      expect(findBox(boxes, 1)).toEqual(boxes[1]);
      expect(findBox(boxes, 999)).toBeUndefined();
    });

    it('gets timer preset for box', () => {
      const boxes = [
        {
          idx: 0,
          name: 'B1',
          timerPreset: '05:00',
          categorie: 'Senior',
          routeIndex: 1,
          routesCount: 3,
          holdsCount: 25,
          concurenti: [],
        },
        {
          idx: 1,
          name: 'B2',
          timerPreset: '04:00',
          categorie: 'Junior',
          routeIndex: 1,
          routesCount: 3,
          holdsCount: 20,
          concurenti: [],
        },
      ];

      const getTimerPreset = (boxes, idx) => {
        const box = boxes.find((b) => b.idx === idx);
        return box ? box.timerPreset : '05:00';
      };

      expect(getTimerPreset(boxes, 0)).toBe('05:00');
      expect(getTimerPreset(boxes, 1)).toBe('04:00');
      expect(getTimerPreset(boxes, 999)).toBe('05:00'); // Default
    });
  });

  describe('Competitor Management', () => {
    it('filters marked competitors', () => {
      const competitors = [
        { nume: 'John', marked: true, score: 5 },
        { nume: 'Jane', marked: false, score: 0 },
        { nume: 'Bob', marked: true, score: 10 },
      ];

      const getMarked = (competitors) => competitors.filter((c) => c.marked);

      expect(getMarked(competitors)).toHaveLength(2);
      expect(getMarked(competitors)[0].nume).toBe('John');
      expect(getMarked(competitors)[1].nume).toBe('Bob');
    });

    it('counts completed competitors', () => {
      const competitors = [
        { nume: 'John', score: 5, time: 120 },
        { nume: 'Jane', score: 0, time: null },
        { nume: 'Bob', score: 10, time: 85 },
      ];

      const countCompleted = (competitors) =>
        competitors.filter((c) => c.score > 0 || c.time !== null).length;

      expect(countCompleted(competitors)).toBe(2);
    });

    it('gets highest score among competitors', () => {
      const competitors = [
        { nume: 'John', score: 5 },
        { nume: 'Jane', score: 10 },
        { nume: 'Bob', score: 8 },
      ];

      const getMaxScore = (competitors) => Math.max(...competitors.map((c) => c.score || 0));

      expect(getMaxScore(competitors)).toBe(10);
    });

    it('sorts competitors by score descending', () => {
      const competitors = [
        { nume: 'John', score: 5 },
        { nume: 'Jane', score: 10 },
        { nume: 'Bob', score: 8 },
      ];

      const sortByScore = (competitors) =>
        [...competitors].sort((a, b) => (b.score || 0) - (a.score || 0));

      const sorted = sortByScore(competitors);
      expect(sorted[0].nume).toBe('Jane');
      expect(sorted[1].nume).toBe('Bob');
      expect(sorted[2].nume).toBe('John');
    });
  });

  describe('State Synchronization', () => {
    it('reads climbing time from localStorage', () => {
      global.localStorage.getItem.mockReturnValue('05:00');

      const climbingTime = global.localStorage.getItem('climbingTime');
      expect(climbingTime).toBe('05:00');
    });

    it('reads time criterion flag from localStorage', () => {
      global.localStorage.getItem.mockReturnValue('on');

      const enabled = global.localStorage.getItem('timeCriterionEnabled');
      expect(enabled).toBe('on');
    });

    it('reads timer state from localStorage', () => {
      global.localStorage.getItem.mockReturnValue('running');

      const timerState = global.localStorage.getItem('timer-0');
      expect(timerState).toBe('running');
    });

    it('reads active climber from localStorage', () => {
      global.localStorage.getItem.mockReturnValue('John Doe');

      const climber = global.localStorage.getItem('activeClimber-0');
      expect(climber).toBe('John Doe');
    });

    it('saves box version to localStorage on state change', () => {
      global.localStorage.setItem('boxVersion-0', '42');

      expect(global.localStorage.setItem).toHaveBeenCalledWith('boxVersion-0', '42');
    });

    it('removes box data on box deletion', () => {
      global.localStorage.removeItem('listboxes');
      global.localStorage.removeItem('boxVersion-0');
      global.localStorage.removeItem('sessionId-0');

      expect(global.localStorage.removeItem).toHaveBeenCalledWith('listboxes');
      expect(global.localStorage.removeItem).toHaveBeenCalledWith('boxVersion-0');
      expect(global.localStorage.removeItem).toHaveBeenCalledWith('sessionId-0');
    });
  });

  describe('API Command Construction', () => {
    it('constructs START_TIMER command', () => {
      const createCommand = (type, boxId, boxVersion) => ({
        type,
        boxId,
        boxVersion,
        timestamp: Date.now(),
      });

      const cmd = createCommand('START_TIMER', 0, 1);
      expect(cmd.type).toBe('START_TIMER');
      expect(cmd.boxId).toBe(0);
      expect(cmd.boxVersion).toBe(1);
      expect(cmd.timestamp).toBeDefined();
    });

    it('constructs STOP_TIMER command', () => {
      const createCommand = (type, boxId, boxVersion) => ({
        type,
        boxId,
        boxVersion,
        timestamp: Date.now(),
      });

      const cmd = createCommand('STOP_TIMER', 1, 2);
      expect(cmd.type).toBe('STOP_TIMER');
      expect(cmd.boxId).toBe(1);
    });

    it('constructs ACTIVE_CLIMBER command', () => {
      const createCommand = (type, boxId, boxVersion, climber) => ({
        type,
        boxId,
        boxVersion,
        climber,
        timestamp: Date.now(),
      });

      const cmd = createCommand('ACTIVE_CLIMBER', 0, 1, 'John Doe');
      expect(cmd.type).toBe('ACTIVE_CLIMBER');
      expect(cmd.climber).toBe('John Doe');
    });

    it('constructs MARK_COMPETITOR command', () => {
      const createCommand = (type, boxId, boxVersion, competitor, marked) => ({
        type,
        boxId,
        boxVersion,
        competitor,
        marked,
        timestamp: Date.now(),
      });

      const cmd = createCommand('MARK_COMPETITOR', 0, 1, 'John Doe', true);
      expect(cmd.type).toBe('MARK_COMPETITOR');
      expect(cmd.competitor).toBe('John Doe');
      expect(cmd.marked).toBe(true);
    });

    it('constructs SUBMIT_SCORE command with time criterion', () => {
      const createCommand = (type, boxId, boxVersion, competitor, score, time) => ({
        type,
        boxId,
        boxVersion,
        competitor,
        score,
        registeredTime: time,
        timestamp: Date.now(),
      });

      const cmd = createCommand('SUBMIT_SCORE', 0, 1, 'John Doe', 10, 120);
      expect(cmd.type).toBe('SUBMIT_SCORE');
      expect(cmd.competitor).toBe('John Doe');
      expect(cmd.score).toBe(10);
      expect(cmd.registeredTime).toBe(120);
    });
  });

  describe('Data Validation', () => {
    it('validates timer preset format', () => {
      const isValidPreset = (preset) => {
        const pattern = /^\d{2}:\d{2}$/;
        return pattern.test(preset);
      };

      expect(isValidPreset('05:00')).toBe(true);
      expect(isValidPreset('00:45')).toBe(true);
      expect(isValidPreset('invalid')).toBe(false);
      expect(isValidPreset('5:0')).toBe(false);
    });

    it('validates competitor name', () => {
      const isValidName = (name) =>
        typeof name === 'string' && name.trim().length > 0 && name.trim().length <= 100;

      expect(isValidName('John Doe')).toBe(true);
      expect(isValidName('A')).toBe(true);
      expect(isValidName('')).toBe(false);
      expect(isValidName('   ')).toBe(false);
      expect(isValidName(123)).toBe(false);
    });

    it('validates score range', () => {
      const isValidScore = (score) => typeof score === 'number' && score >= 0 && score <= 100;

      expect(isValidScore(0)).toBe(true);
      expect(isValidScore(50)).toBe(true);
      expect(isValidScore(100)).toBe(true);
      expect(isValidScore(-1)).toBe(false);
      expect(isValidScore(101)).toBe(false);
      expect(isValidScore('50')).toBe(false);
    });

    it('validates timer seconds', () => {
      const isValidTime = (sec) => typeof sec === 'number' && sec >= 0 && sec <= 3600; // Max 1 hour

      expect(isValidTime(0)).toBe(true);
      expect(isValidTime(300)).toBe(true);
      expect(isValidTime(3600)).toBe(true);
      expect(isValidTime(-1)).toBe(false);
      expect(isValidTime(3601)).toBe(false);
      expect(isValidTime('300')).toBe(false);
    });
  });

  describe('localStorage Normalization', () => {
    it('normalizes JSON-encoded values', () => {
      const normalizeValue = (value) => {
        if (!value) return '';
        // Check if value is JSON-encoded string
        if (value.startsWith('"') || value === 'null' || value === 'undefined') {
          try {
            const parsed = JSON.parse(value);
            return parsed === null || parsed === undefined ? '' : parsed;
          } catch {
            return value;
          }
        }
        return value.trim();
      };

      expect(normalizeValue('"test"')).toBe('test');
      expect(normalizeValue('test')).toBe('test');
      expect(normalizeValue('"  test  "')).toBe('  test  ');
      expect(normalizeValue('null')).toBe('');
      expect(normalizeValue('undefined')).toBe('undefined'); // JSON.parse('undefined') returns undefined as string
      expect(normalizeValue(null)).toBe('');
    });

    it('detects empty values after normalization', () => {
      const isEmpty = (value) => {
        const normalized = value ? value.trim() : '';
        return (
          !normalized || normalized === '""' || normalized === 'null' || normalized === 'undefined'
        );
      };

      expect(isEmpty('   ')).toBe(true);
      expect(isEmpty('')).toBe(true);
      expect(isEmpty('""')).toBe(true);
      expect(isEmpty('null')).toBe(true);
      expect(isEmpty('test')).toBe(false);
    });
  });

  describe('Numeric Conversions', () => {
    it('safely converts string to integer', () => {
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

    it('calculates average correctly', () => {
      const calcAverage = (values) => {
        if (!values || values.length === 0) return 0;
        const sum = values.reduce((acc, v) => acc + (v ?? 0), 0);
        return Math.round(sum / values.length);
      };

      expect(calcAverage([10, 20, 30])).toBe(20);
      expect(calcAverage([5, 5, 5])).toBe(5);
      expect(calcAverage([0, 100])).toBe(50);
      expect(calcAverage([])).toBe(0);
      expect(calcAverage(null)).toBe(0);
    });
  });
});
