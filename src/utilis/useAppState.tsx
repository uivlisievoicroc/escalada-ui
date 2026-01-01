import {
  useState,
  useEffect,
  useRef,
  useCallback,
  createContext,
  useContext,
  ReactNode,
  FC,
  PropsWithChildren,
  Dispatch,
  SetStateAction,
} from 'react';
import { useLocalStorage } from './useLocalStorage.ts';

/**
 * Type definitions for App State
 */

export interface BoxConfig {
  idx?: number;
  name?: string;
  timerPreset?: string;
  [key: string]: any;
}

export interface BoxState {
  timerState: 'idle' | 'running' | 'paused';
  registeredTime: number | null;
  holdCount: number;
  currentClimber: string;
  remaining: number | null;
  usedHalfHold: boolean;
  timerPreset: string;
}

export interface BoxStateUpdates {
  timerState?: 'idle' | 'running' | 'paused';
  registeredTime?: number | null;
  holdCount?: number;
  currentClimber?: string;
  remaining?: number | null;
  usedHalfHold?: boolean;
}

// State maps are sparse: keys exist only for active boxes
export type TimerStates = Partial<Record<number, 'idle' | 'running' | 'paused'>>;
export type NumericStates = Partial<Record<number, number>>;
export type StringStates = Partial<Record<number, string>>;
export type BooleanStates = Partial<Record<number, boolean>>;
// Allow nullable numeric states for values like registeredTime and remaining
export type NumericOrNullStates = Partial<Record<number, number | null>>;

export interface AppStateContextType {
  // Persistent state
  listboxes: BoxConfig[];
  setListboxes: Dispatch<SetStateAction<BoxConfig[]>>;
  climbingTime: string;
  setClimbingTime: Dispatch<SetStateAction<string>>;
  timeCriterionEnabled: boolean;
  setTimeCriterionEnabled: Dispatch<SetStateAction<boolean>>;

  // Runtime state
  timerStates: TimerStates;
  setTimerStates: Dispatch<SetStateAction<TimerStates>>;
  registeredTimes: NumericOrNullStates;
  setRegisteredTimes: Dispatch<SetStateAction<NumericOrNullStates>>;
  holdClicks: NumericStates;
  setHoldClicks: Dispatch<SetStateAction<NumericStates>>;
  currentClimbers: StringStates;
  setCurrentClimbers: Dispatch<SetStateAction<StringStates>>;
  controlTimers: NumericOrNullStates;
  setControlTimers: Dispatch<SetStateAction<NumericOrNullStates>>;
  usedHalfHold: BooleanStates;
  setUsedHalfHold: Dispatch<SetStateAction<BooleanStates>>;

  // Box operations
  getBoxState: (boxId: number) => BoxState;
  updateBoxState: (boxId: number, updates: BoxStateUpdates) => void;
  clearBoxState: (boxId: number) => void;
  getTimerPreset: (boxId: number) => string;
  setTimerPreset: (boxId: number, preset: string) => void;
  addBox: (boxConfig?: Partial<BoxConfig>) => number;
  removeBox: (boxId: number) => void;
  reorderBoxes: (newOrder: BoxConfig[]) => void;

  // Broadcasting
  broadcastUpdate: (type: string, payload: any) => void;
  broadcastCommand: (boxId: number, action: string) => void;
}

interface BroadcastChannelMessage {
  type?: string;
  boxId?: number;
  payload?: any;
  action?: string;
}

/**
 * Centralized App State Context
 * Consolidates localStorage, WebSocket, and BroadcastChannel messaging
 */
const AppStateContext = createContext<AppStateContextType | null>(null);

export const AppStateProvider: FC<PropsWithChildren> = ({ children }) => {
  // ==================== PERSISTENT STATE (localStorage) ====================
  const [listboxes, setListboxes] = useLocalStorage<BoxConfig[]>('listboxes', []);
  const [climbingTime, setClimbingTime] = useLocalStorage<string>('climbingTime', '05:00');
  const [timeCriterionEnabled, setTimeCriterionEnabled] = useLocalStorage<boolean>(
    'timeCriterionEnabled',
    false,
  );

  // ==================== RUNTIME STATE (memory) ====================
  const [timerStates, setTimerStates] = useState<TimerStates>({});
  const [registeredTimes, setRegisteredTimes] = useState<NumericOrNullStates>({});
  const [holdClicks, setHoldClicks] = useState<NumericStates>({});
  const [currentClimbers, setCurrentClimbers] = useState<StringStates>({});
  const [controlTimers, setControlTimers] = useState<NumericOrNullStates>({});
  const [usedHalfHold, setUsedHalfHold] = useState<BooleanStates>({});

  // ==================== BOX-SPECIFIC STATE ====================
  const getBoxState = useCallback(
    (boxId: number): BoxState => ({
      timerState: (timerStates[boxId] as 'idle' | 'running' | 'paused') || 'idle',
      registeredTime: registeredTimes[boxId] ?? null,
      holdCount: holdClicks[boxId] ?? 0,
      currentClimber: currentClimbers[boxId] || '',
      remaining: controlTimers[boxId] ?? null,
      usedHalfHold: usedHalfHold[boxId] ?? false,
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
  const updateBoxState = useCallback((boxId: number, updates: BoxStateUpdates) => {
    if (updates.timerState !== undefined) {
      const nextTimerState = updates.timerState as 'idle' | 'running' | 'paused';
      setTimerStates((prev) => ({ ...prev, [boxId]: nextTimerState }));
    }
    if (updates.registeredTime !== undefined) {
      const nextRegisteredTime = updates.registeredTime as number | null;
      setRegisteredTimes((prev) => ({ ...prev, [boxId]: nextRegisteredTime }));
    }
    if (updates.holdCount !== undefined) {
      setHoldClicks((prev) => ({ ...prev, [boxId]: updates.holdCount }));
    }
    if (updates.currentClimber !== undefined) {
      setCurrentClimbers((prev) => ({ ...prev, [boxId]: updates.currentClimber }));
    }
    if (updates.remaining !== undefined) {
      const nextRemaining = updates.remaining as number | null;
      setControlTimers((prev) => ({ ...prev, [boxId]: nextRemaining }));
    }
    if (updates.usedHalfHold !== undefined) {
      setUsedHalfHold((prev) => ({ ...prev, [boxId]: updates.usedHalfHold }));
    }
  }, []);

  const clearBoxState = useCallback((boxId: number) => {
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
    (boxId: number) => {
      return listboxes[boxId]?.timerPreset || climbingTime;
    },
    [listboxes, climbingTime],
  );

  const setTimerPreset = useCallback((boxId: number, preset: string) => {
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
    (boxConfig: Partial<BoxConfig> = {}): number => {
      const newIdx = listboxes.length;
      const newBox: BoxConfig = {
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

  // helper to shift all per-box state maps after a deletion
  const reindexStateMap = useCallback(<T,>(map: Record<number, T>, removedId: number) => {
    const next: Record<number, T> = {};
    Object.entries(map).forEach(([key, value]) => {
      const idx = Number(key);
      if (Number.isNaN(idx) || idx === removedId) return;
      next[idx > removedId ? idx - 1 : idx] = value;
    });
    return next;
  }, []);

  const removeBox = useCallback(
    (boxId: number) => {
      setListboxes((prev) => prev.filter((_, idx) => idx !== boxId));
      setTimerStates((prev) => reindexStateMap(prev, boxId));
      setRegisteredTimes((prev) => reindexStateMap(prev, boxId));
      setHoldClicks((prev) => reindexStateMap(prev, boxId));
      setCurrentClimbers((prev) => reindexStateMap(prev, boxId));
      setControlTimers((prev) => reindexStateMap(prev, boxId));
      setUsedHalfHold((prev) => reindexStateMap(prev, boxId));
    },
    [reindexStateMap],
  );

  const reorderBoxes = useCallback((newOrder: BoxConfig[]) => {
    setListboxes(newOrder);
  }, []);

  // ==================== BROADCAST CHANNEL FOR CROSS-TAB SYNC ====================
  const bcRef = useRef<BroadcastChannel | null>(null);
  const bcCmdRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;

    // Channel for state broadcasts
    bcRef.current = new BroadcastChannel('escalada-state');
    bcRef.current.onmessage = (event: MessageEvent<BroadcastChannelMessage>) => {
      const { type, boxId, payload } = event.data;

      switch (type) {
        case 'UPDATE_BOX_STATE':
          if (boxId !== undefined) {
            updateBoxState(boxId, payload);
          }
          break;
        case 'CLEAR_BOX_STATE':
          if (boxId !== undefined) {
            clearBoxState(boxId);
          }
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
    bcCmdRef.current.onmessage = (event: MessageEvent<BroadcastChannelMessage>) => {
      const { boxId, action } = event.data;

      switch (action) {
        case 'START_TIMER':
          if (boxId !== undefined) {
            updateBoxState(boxId, { timerState: 'running' });
          }
          break;
        case 'STOP_TIMER':
          if (boxId !== undefined) {
            updateBoxState(boxId, { timerState: 'paused' });
          }
          break;
        case 'RESUME_TIMER':
          if (boxId !== undefined) {
            updateBoxState(boxId, { timerState: 'running' });
          }
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
  const broadcastUpdate = useCallback((type: string, payload: any) => {
    if (bcRef.current && bcRef.current.name) {
      try {
        bcRef.current.postMessage({ type, payload });
      } catch (err) {
        console.error('Failed to broadcast state update:', err);
      }
    }
  }, []);

  const broadcastCommand = useCallback((boxId: number, action: string) => {
    if (bcCmdRef.current && bcCmdRef.current.name) {
      try {
        bcCmdRef.current.postMessage({ boxId, action });
      } catch (err) {
        console.error('Failed to broadcast command:', err);
      }
    }
  }, []);

  // ==================== CONTEXT VALUE ====================
  const value: AppStateContextType = {
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
};

/**
 * Hook to use the centralized app state
 * @returns The app state and updater functions
 */
export function useAppState(): AppStateContextType {
  const context = useContext(AppStateContext);

  if (!context) {
    throw new Error('useAppState must be used within AppStateProvider');
  }

  return context;
}

/**
 * Hook for box-specific state (optimized for less re-renders)
 * @param boxId - The box ID
 * @returns Box-specific state and updaters
 */
export interface UseBoxStateReturn extends BoxState {
  update: (updates: BoxStateUpdates) => void;
  getTimerPreset: () => string;
  setTimerPreset: (preset: string) => void;
}

export function useBoxState(boxId: number): UseBoxStateReturn {
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
