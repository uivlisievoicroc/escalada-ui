import { useState, useEffect, useRef, useCallback, createContext, useContext } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { debugError } from './debug';

/**
 * Centralized App State Context
 * Consolidates localStorage, WebSocket, and BroadcastChannel messaging
 * Single source of truth for:
 * - listboxes configuration
 * - timer states per box
 * - registered times
 * - ranking data
 * - time criterion setting
 * - climbing time presets
 */

const AppStateContext = createContext(null);

export function AppStateProvider({ children }) {
  // ==================== PERSISTENT STATE (localStorage) ====================
  const [listboxes, setListboxes] = useLocalStorage('listboxes', []);
  const [climbingTime, setClimbingTime] = useLocalStorage('climbingTime', '05:00');
  const [timeCriterionEnabled, setTimeCriterionEnabled] = useLocalStorage(
    'timeCriterionEnabled',
    false,
  );

  // ==================== RUNTIME STATE (memory) ====================
  // Timer state per box: { [boxId]: "running" | "paused" | "idle" }
  const [timerStates, setTimerStates] = useState({});

  // Registered times per box: { [boxId]: <seconds> }
  const [registeredTimes, setRegisteredTimes] = useState({});

  // Hold clicks per box: { [boxId]: <number> }
  const [holdClicks, setHoldClicks] = useState({});

  // Current climbers per box: { [boxId]: "Name" }
  const [currentClimbers, setCurrentClimbers] = useState({});

  // Control timers per box: { [boxId]: <remaining_seconds> }
  const [controlTimers, setControlTimers] = useState({});

  // Half hold tracking: { [boxId]: <boolean> }
  const [usedHalfHold, setUsedHalfHold] = useState({});

  // ==================== BOX-SPECIFIC STATE ====================
  const getBoxState = useCallback(
    (boxId) => ({
      timerState: timerStates[boxId] || 'idle',
      registeredTime: registeredTimes[boxId] || null,
      holdCount: holdClicks[boxId] || 0,
      currentClimber: currentClimbers[boxId] || '',
      remaining: controlTimers[boxId] || null,
      usedHalfHold: usedHalfHold[boxId] || false,
      timerPreset: listboxes[boxId]?.timerPreset || climbingTime,
    }),
    [
      timerStates,
      registeredTimes,
      holdClicks,
      currentClimbers,
      controlTimers,
      usedHalfHold,
      listboxes,
      climbingTime,
    ],
  );

  // ==================== STATE UPDATERS ====================
  const updateBoxState = useCallback((boxId, updates) => {
    if (updates.timerState !== undefined) {
      setTimerStates((prev) => ({ ...prev, [boxId]: updates.timerState }));
    }
    if (updates.registeredTime !== undefined) {
      setRegisteredTimes((prev) => ({ ...prev, [boxId]: updates.registeredTime }));
    }
    if (updates.holdCount !== undefined) {
      setHoldClicks((prev) => ({ ...prev, [boxId]: updates.holdCount }));
    }
    if (updates.currentClimber !== undefined) {
      setCurrentClimbers((prev) => ({ ...prev, [boxId]: updates.currentClimber }));
    }
    if (updates.remaining !== undefined) {
      setControlTimers((prev) => ({ ...prev, [boxId]: updates.remaining }));
    }
    if (updates.usedHalfHold !== undefined) {
      setUsedHalfHold((prev) => ({ ...prev, [boxId]: updates.usedHalfHold }));
    }
  }, []);

  const clearBoxState = useCallback((boxId) => {
    setTimerStates((prev) => {
      const updated = { ...prev };
      delete updated[boxId];
      return updated;
    });
    setRegisteredTimes((prev) => {
      const updated = { ...prev };
      delete updated[boxId];
      return updated;
    });
    setHoldClicks((prev) => {
      const updated = { ...prev };
      delete updated[boxId];
      return updated;
    });
    setCurrentClimbers((prev) => {
      const updated = { ...prev };
      delete updated[boxId];
      return updated;
    });
    setControlTimers((prev) => {
      const updated = { ...prev };
      delete updated[boxId];
      return updated;
    });
    setUsedHalfHold((prev) => {
      const updated = { ...prev };
      delete updated[boxId];
      return updated;
    });
  }, []);

  // ==================== CONFIGURATION ====================
  const getTimerPreset = useCallback(
    (boxId) => {
      return listboxes[boxId]?.timerPreset || climbingTime;
    },
    [listboxes, climbingTime],
  );

  const setTimerPreset = useCallback((boxId, preset) => {
    setListboxes((prev) => {
      const updated = [...prev];
      if (updated[boxId]) {
        updated[boxId] = { ...updated[boxId], timerPreset: preset };
      }
      return updated;
    });
  }, []);

  // ==================== UTILITY FUNCTIONS ====================
  const addBox = useCallback(
    (boxConfig = {}) => {
      const newIdx = listboxes.length;
      const newBox = {
        idx: newIdx,
        name: boxConfig.name || `Box ${newIdx + 1}`,
        timerPreset: boxConfig.timerPreset || climbingTime,
        ...boxConfig,
      };
      setListboxes((prev) => [...prev, newBox]);
      return newIdx;
    },
    [listboxes.length, climbingTime],
  );

  const removeBox = useCallback((boxId) => {
    setListboxes((prev) => prev.filter((_, idx) => idx !== boxId));
    clearBoxState(boxId);
  }, []);

  const reorderBoxes = useCallback((newOrder) => {
    setListboxes(newOrder);
  }, []);

  // ==================== BROADCAST CHANNEL FOR CROSS-TAB SYNC ====================
  const bcRef = useRef(null);
  const bcCmdRef = useRef(null);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;

    // Channel for state broadcasts
    bcRef.current = new BroadcastChannel('escalada-state');
    bcRef.current.onmessage = (event) => {
      const { type, boxId, payload } = event.data;

      switch (type) {
        case 'UPDATE_BOX_STATE':
          updateBoxState(boxId, payload);
          break;
        case 'CLEAR_BOX_STATE':
          clearBoxState(boxId);
          break;
        case 'SET_TIME_CRITERION':
          setTimeCriterionEnabled(payload);
          break;
        case 'SET_CLIMBING_TIME':
          setClimbingTime(payload);
          break;
        default:
          break;
      }
    };

    // Channel for timer commands
    bcCmdRef.current = new BroadcastChannel('timer-cmd');
    bcCmdRef.current.onmessage = (event) => {
      const { boxId, action } = event.data;

      switch (action) {
        case 'START_TIMER':
          updateBoxState(boxId, { timerState: 'running' });
          break;
        case 'STOP_TIMER':
          updateBoxState(boxId, { timerState: 'paused' });
          break;
        case 'RESUME_TIMER':
          updateBoxState(boxId, { timerState: 'running' });
          break;
        default:
          break;
      }
    };

    return () => {
      bcRef.current?.close();
      bcCmdRef.current?.close();
    };
  }, [updateBoxState, clearBoxState]);

  // ==================== BROADCAST STATE UPDATES ====================
  const broadcastUpdate = useCallback((type, payload) => {
    if (bcRef.current && bcRef.current.name) {
      try {
        bcRef.current.postMessage({ type, payload });
      } catch (err) {
        debugError('Failed to broadcast state update:', err);
      }
    }
  }, []);

  const broadcastCommand = useCallback((boxId, action) => {
    if (bcCmdRef.current && bcCmdRef.current.name) {
      try {
        bcCmdRef.current.postMessage({ boxId, action });
      } catch (err) {
        debugError('Failed to broadcast command:', err);
      }
    }
  }, []);

  // ==================== CONTEXT VALUE ====================
  const value = {
    // Persistent state
    listboxes,
    setListboxes,
    climbingTime,
    setClimbingTime,
    timeCriterionEnabled,
    setTimeCriterionEnabled,

    // Runtime state
    timerStates,
    setTimerStates,
    registeredTimes,
    setRegisteredTimes,
    holdClicks,
    setHoldClicks,
    currentClimbers,
    setCurrentClimbers,
    controlTimers,
    setControlTimers,
    usedHalfHold,
    setUsedHalfHold,

    // Box operations
    getBoxState,
    updateBoxState,
    clearBoxState,
    getTimerPreset,
    setTimerPreset,
    addBox,
    removeBox,
    reorderBoxes,

    // Broadcasting
    broadcastUpdate,
    broadcastCommand,
  };

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

/**
 * Hook to use the centralized app state
 * @returns {Object} - The app state and updater functions
 */
export function useAppState() {
  const context = useContext(AppStateContext);

  if (!context) {
    throw new Error('useAppState must be used within AppStateProvider');
  }

  return context;
}

/**
 * Hook for box-specific state (less re-renders)
 * @param {number} boxId - The box ID
 * @returns {Object} - Box-specific state and updaters
 */
export function useBoxState(boxId) {
  const { getBoxState, updateBoxState, getTimerPreset, setTimerPreset } = useAppState();

  const boxState = getBoxState(boxId);

  return {
    ...boxState,
    update: (updates) => updateBoxState(boxId, updates),
    getTimerPreset: () => getTimerPreset(boxId),
    setTimerPreset: (preset) => setTimerPreset(boxId, preset),
  };
}

export default AppStateContext;
