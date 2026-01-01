import QRCode from 'react-qr-code';
import React, { useState, useEffect, useRef, Suspense, lazy, FC } from 'react';
import { debugLog, debugWarn, debugError } from '../utilis/debug';
import { safeSetItem, safeGetItem, safeRemoveItem, storageKey } from '../utilis/storage';
import { sanitizeBoxName, sanitizeCompetitorName } from '../utilis/sanitize';
import type { Box, Competitor, WebSocketMessage, TimerState, LoadingBoxes } from '../types';
import ModalUpload from './ModalUpload';
import ModalTimer from './ModalTimer';
import {
  startTimer,
  stopTimer,
  resumeTimer,
  updateProgress,
  requestActiveCompetitor,
  submitScore,
  initRoute,
  registerTime,
  getSessionId,
  setSessionId,
  resetBox,
} from '../utilis/contestActions';
import ModalModifyScore from './ModalModifyScore';
import getWinners from '../utilis/getWinners';
import useWebSocketWithHeartbeat from '../utilis/useWebSocketWithHeartbeat';
import { normalizeStorageValue } from '../utilis/normalizeStorageValue';
import { getStoredToken } from '../utilis/auth';

// Map boxId -> reference to the opened contest tab
const openTabs: { [boxId: number]: Window | null } = {};

// Get API constants at runtime
const getApiConfig = () => {
  const protocol = window.location.protocol === 'https:' ? 'https' : 'http';
  const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const hostname = window.location.hostname;
  return {
    API_CP: `${protocol}://${hostname}:8000/api/cmd`,
    WS_PROTOCOL_CP: wsProtocol,
  };
};

// Robustly read climbingTime from localStorage, handling JSON-quoted values
const readClimbingTime = (): string => {
  const raw = safeGetItem('climbingTime');
  if (!raw) return '05:00';
  try {
    const v = JSON.parse(raw);
    if (typeof v === 'string') return v;
  } catch (err) {
    debugLog('[readClimbingTime] Failed to parse JSON, using fallback regex:', err);
  }
  const m = raw.match(/^"?(\d{1,2}):(\d{2})"?$/);
  if (m) {
    const mm = m[1].padStart(2, '0');
    const ss = m[2];
    return `${mm}:${ss}`;
  }
  return raw;
};

// Read timeCriterion flag supporting both "on"/"off" and JSON booleans
const readTimeCriterionEnabled = (): boolean => {
  const raw = safeGetItem('timeCriterionEnabled');
  if (raw === 'on') return true;
  if (raw === 'off') return false;
  if (!raw) return false;
  try {
    return !!JSON.parse(raw);
  } catch {
    return false;
  }
};

const isTabAlive = (t: Window | null): boolean => {
  try {
    return t !== null && !t.closed;
  } catch {
    return false;
  }
};
const ModalScore = lazy(() => import('./ModalScore'));
const ControlPanel: FC = () => {
  // Ignoră WS close noise la demontare (attach once, with cleanup)
  useEffect(() => {
    const handler = (e: ErrorEvent): void => {
      if (e.message?.includes('WebSocket') && e.message?.includes('closed')) {
        e.preventDefault();
      }
    };
    window.addEventListener('error', handler);
    return () => window.removeEventListener('error', handler);
  }, []);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [showTimerModal, setShowTimerModal] = useState<boolean>(false);
  const [controlTimers, setControlTimers] = useState<{ [boxId: number]: number }>({});
  const loadListboxes = (): Box[] => {
    const saved = safeGetItem('listboxes');
    const globalPreset = readClimbingTime();
    if (!saved) return [];
    try {
      return JSON.parse(saved).map((lb) => ({
        ...lb,
        timerPreset: lb.timerPreset || globalPreset,
      }));
    } catch {
      return [];
    }
  };
  const [listboxes, setListboxes] = useState<Box[]>(loadListboxes);
  const [climbingTime, setClimbingTime] = useState<string>(readClimbingTime);
  const [timeCriterionEnabled, setTimeCriterionEnabled] =
    useState<boolean>(readTimeCriterionEnabled);
  const [timerStates, setTimerStates] = useState<{ [boxId: number]: TimerState }>({});
  const [activeBoxId, setActiveBoxId] = useState<number | null>(null);
  const [activeCompetitor, setActiveCompetitor] = useState<string>('');
  const [showScoreModal, setShowScoreModal] = useState<boolean>(false);
  const [showModifyModal, setShowModifyModal] = useState<boolean>(false);
  const [editList, setEditList] = useState<Competitor[]>([]);
  const [editScores, setEditScores] = useState<{ [name: string]: number[] }>({});
  const [editTimes, setEditTimes] = useState<{ [name: string]: (number | undefined)[] }>({});
  const [currentClimbers, setCurrentClimbers] = useState<{ [boxId: number]: string }>({});
  const [holdClicks, setHoldClicks] = useState<{ [boxId: number]: number }>({});
  const [usedHalfHold, setUsedHalfHold] = useState<{ [boxId: number]: boolean }>({});
  const [registeredTimes, setRegisteredTimes] = useState<{ [boxId: number]: number }>({});
  const registeredTimesRef = useRef<{ [boxId: number]: number }>(registeredTimes);
  useEffect(() => {
    registeredTimesRef.current = registeredTimes;
  }, [registeredTimes]);
  const [rankingStatus, setRankingStatus] = useState<{ [boxId: number]: string }>({});
  const [loadingBoxes, setLoadingBoxes] = useState<LoadingBoxes>(new Set()); // TASK 3.1: Track loading operations

  // Refs pentru a păstra ultima versiune a stărilor
  const listboxesRef = useRef<Box[]>(listboxes);
  const currentClimbersRef = useRef<{ [boxId: number]: string }>(currentClimbers);
  const timerStatesRef = useRef<{ [boxId: number]: TimerState }>(timerStates);
  const holdClicksRef = useRef<{ [boxId: number]: number }>(holdClicks);

  // Menține ref-urile actualizate la fiecare schimbare de stare
  useEffect(() => {
    listboxesRef.current = listboxes;
  }, [listboxes]);

  useEffect(() => {
    currentClimbersRef.current = currentClimbers;
  }, [currentClimbers]);

  useEffect(() => {
    timerStatesRef.current = timerStates;
  }, [timerStates]);

  useEffect(() => {
    holdClicksRef.current = holdClicks;
  }, [holdClicks]);

  // WebSocket: subscribe to each box channel and mirror updates from JudgePage
  const wsRefs = useRef<{ [boxId: number]: WebSocket }>({});
  const disconnectFnsRef = useRef<{ [boxId: number]: () => void }>({}); // TASK 2.4: Store disconnect functions for cleanup
  const syncTimeCriterion = (enabled: boolean): void => {
    setTimeCriterionEnabled(enabled);
    safeSetItem('timeCriterionEnabled', enabled ? 'on' : 'off');
  };
  const propagateTimeCriterion = async (enabled: boolean): Promise<void> => {
    syncTimeCriterion(enabled);
    try {
      const config = getApiConfig();
      await fetch(config.API_CP, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boxId: -1,
          type: 'SET_TIME_CRITERION',
          timeCriterionEnabled: enabled,
        }),
      });
    } catch (err) {
      debugError('Failed to propagate time criterion toggle', err);
    }
  };
  const handleToggleTimeCriterion = () => {
    propagateTimeCriterion(!timeCriterionEnabled);
  };
  // Align backend/global flag with the locally remembered toggle on first load
  useEffect(() => {
    propagateTimeCriterion(timeCriterionEnabled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ensure we always have a fresh sessionId per box (needed for state isolation)
  useEffect(() => {
    const config = getApiConfig();
    listboxes.forEach((_, idx) => {
      (async () => {
        try {
          const res = await fetch(`${config.API_CP.replace('/cmd', '')}/state/${idx}`);
          if (res.ok) {
            const st = await res.json();
            if (st?.sessionId) {
              setSessionId(idx, st.sessionId);
            }
          }
        } catch (err) {
          debugError(`Failed to prefetch state/session for box ${idx}`, err);
        }
      })();
    });
  }, [listboxes]);
  useEffect(() => {
    listboxes.forEach((lb, idx) => {
      // Only create new WebSocket if we don't have one for this idx
      if (!wsRefs.current[idx]) {
        const handleMessage = (msg: WebSocketMessage): void => {
          if (msg.type === 'TIME_CRITERION') {
            syncTimeCriterion(!!msg.timeCriterionEnabled);
            return;
          }
          debugLog('📥 WS mesaj primit în ControlPanel:', msg);
          if (+msg.boxId !== idx) return;

          switch (msg.type) {
            case 'START_TIMER':
              setTimerStates((prev) => ({ ...prev, [idx]: 'running' }));
              break;
            case 'STOP_TIMER':
              setTimerStates((prev) => ({ ...prev, [idx]: 'paused' }));
              break;
            case 'RESUME_TIMER':
              setTimerStates((prev) => ({ ...prev, [idx]: 'running' }));
              break;
            case 'TIMER_SYNC':
              if (typeof msg.remaining === 'number') {
                setControlTimers((prev) => ({ ...prev, [idx]: msg.remaining }));
              }
              break;
            case 'PROGRESS_UPDATE':
              setHoldClicks((prev) => {
                const curr = prev[idx] || 0;
                const next =
                  msg.delta === 1 ? Math.floor(curr) + 1 : Number((curr + msg.delta).toFixed(1));
                return { ...prev, [idx]: next };
              });
              setUsedHalfHold((prev) => ({ ...prev, [idx]: msg.delta === 0.1 }));
              break;
            case 'SUBMIT_SCORE':
              persistRankingEntry(idx, msg.competitor, msg.score, msg.registeredTime);
              setHoldClicks((prev) => ({ ...prev, [idx]: 0 }));
              setUsedHalfHold((prev) => ({ ...prev, [idx]: false }));
              setTimerStates((prev) => ({ ...prev, [idx]: 'idle' }));
              clearRegisteredTime(idx);
              break;
            case 'REGISTER_TIME':
              if (typeof msg.registeredTime === 'number') {
                setRegisteredTimes((prev) => ({ ...prev, [idx]: msg.registeredTime }));
              }
              break;
            case 'REQUEST_STATE':
              {
                const box = listboxesRef.current[idx] || {};
                (async () => {
                  const snapshot = {
                    boxId: idx,
                    type: 'STATE_SNAPSHOT',
                    initiated: !!box.initiated,
                    holdsCount: box.holdsCount ?? 0,
                    currentClimber: currentClimbersRef.current[idx] ?? '',
                    started: timerStatesRef.current[idx] === 'running',
                    timerState: timerStatesRef.current[idx] || 'idle',
                    holdCount: holdClicksRef.current[idx] ?? 0,
                    registeredTime: registeredTimesRef.current[idx],
                    timerPreset: getTimerPreset(idx),
                    timerPresetSec: defaultTimerSec(idx),
                  };
                  const ws = wsRefs.current[idx];
                  if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify(snapshot));
                  }
                })();
              }
              break;
            case 'STATE_SNAPSHOT':
              if (msg.sessionId) {
                setSessionId(idx, msg.sessionId);
              }
              // Ignore stale snapshot values for non‑initiated boxes
              setTimerStates((prev) => ({
                ...prev,
                [idx]: listboxesRef.current[idx]?.initiated
                  ? msg.timerState || (msg.started ? 'running' : 'idle')
                  : 'idle',
              }));
              if (typeof msg.holdCount === 'number') {
                setHoldClicks((prev) => ({
                  ...prev,
                  [idx]: listboxesRef.current[idx]?.initiated ? msg.holdCount : 0,
                }));
              } else {
                // Ensure zero for non‑initiated boxes even if holdCount missing
                if (!listboxesRef.current[idx]?.initiated) {
                  setHoldClicks((prev) => ({ ...prev, [idx]: 0 }));
                }
              }
              if (typeof msg.currentClimber === 'string') {
                setCurrentClimbers((prev) => ({ ...prev, [idx]: msg.currentClimber }));
              }
              if (typeof msg.registeredTime === 'number') {
                setRegisteredTimes((prev) => ({ ...prev, [idx]: msg.registeredTime }));
              }
              if (typeof msg.remaining === 'number') {
                setControlTimers((prev) => ({ ...prev, [idx]: msg.remaining }));
              }
              if (typeof msg.timeCriterionEnabled === 'boolean') {
                syncTimeCriterion(msg.timeCriterionEnabled);
              }
              break;
            default:
              break;
          }
        };

        // Create WebSocket connection with heartbeat using a custom implementation
        // that manually manages the connection to fit our multi-box pattern
        const config = getApiConfig();
        const token = getStoredToken();
        if (!token) {
          debugWarn(`Skipping WS connect for box ${idx}: no auth token`);
          return;
        }
        const url = `${config.WS_PROTOCOL_CP}://${window.location.hostname}:8000/api/ws/${idx}?token=${encodeURIComponent(
          token,
        )}`;
        const ws = new WebSocket(url);
        let heartbeatInterval = null;
        let lastPong = Date.now();

        ws.onopen = () => {
          debugLog(`✅ WebSocket connected for box ${idx}`);
          lastPong = Date.now();

          // Start heartbeat monitoring
          heartbeatInterval = setInterval(() => {
            const now = Date.now();
            const timeSinceLastPong = now - lastPong;

            // If no PONG received for 60 seconds, reconnect
            if (timeSinceLastPong > 60000) {
              debugWarn(`⚠️ Heartbeat timeout for box ${idx}, closing connection...`);
              ws.close();
              return;
            }

            // Send PONG to keep connection alive (server sends PING)
            if (ws.readyState === WebSocket.OPEN) {
              try {
                ws.send(JSON.stringify({ type: 'PONG', timestamp: now }));
              } catch (err) {
                debugError(`Failed to send PONG for box ${idx}:`, err);
              }
            }
          }, 30000); // Every 30 seconds
        };

        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data);

            // Handle PING from server
            if (msg.type === 'PING') {
              lastPong = Date.now();
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'PONG', timestamp: msg.timestamp }));
              }
              return;
            }

            handleMessage(msg);
          } catch (err) {
            debugError(`Error parsing WebSocket message for box ${idx}:`, err);
          }
        };

        ws.onerror = (err) => {
          debugError(`❌ WebSocket error for box ${idx}:`, err);
        };

        ws.onclose = () => {
          debugLog(`🔌 WebSocket closed for box ${idx}`);
          if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
          }
          delete wsRefs.current[idx];

          // Auto-reconnect after 2 seconds if this box still exists
          setTimeout(() => {
            const stillExists = listboxes.some((_, i) => i === idx);
            if (stillExists && !wsRefs.current[idx]) {
              debugLog(`🔄 Auto-reconnecting WebSocket for box ${idx}...`);
              // Trigger re-render to recreate connection
              setListboxes((prev) => [...prev]);
            }
          }, 2000);
        };

        wsRefs.current[idx] = ws;
        disconnectFnsRef.current[idx] = () => {
          if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
          }
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.close();
          }
        };
      }
    });

    // Cleanup: close WebSockets that are no longer in the list (box deletions)
    return () => {
      const currentIndices = new Set(listboxes.map((_, idx) => idx));
      Object.keys(wsRefs.current).forEach((idx) => {
        if (!currentIndices.has(parseInt(idx))) {
          if (disconnectFnsRef.current[idx]) {
            disconnectFnsRef.current[idx]();
          }
          const ws = wsRefs.current[idx];
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.close();
          }
          delete wsRefs.current[idx];
          delete disconnectFnsRef.current[idx];
        }
      });
    };
  }, [listboxes]);

  // TASK 2.4: Cleanup ALL WebSockets on component unmount (memory leak fix)
  useEffect(() => {
    return () => {
      debugLog('[ControlPanel] Unmounting - closing all WebSocket connections');

      // Close ALL WebSockets when component unmounts
      Object.keys(wsRefs.current).forEach((idx) => {
        if (disconnectFnsRef.current[idx]) {
          disconnectFnsRef.current[idx]();
        }
        const ws = wsRefs.current[idx];
        if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
          try {
            ws.close(1000, 'ControlPanel unmounting');
          } catch (err) {
            debugError(`Error closing WebSocket for box ${idx}:`, err);
          }
        }
      });

      // Clear all refs to prevent memory leaks
      wsRefs.current = {};
      disconnectFnsRef.current = {};
    };
  }, []); // Empty dependency array - only run on mount/unmount

  // Ascultă sincronizarea timerelor via localStorage (evenimentul 'storage')
  useEffect(() => {
    // BroadcastChannel pentru comenzi timer (START/STOP/RESUME) din alte ferestre
    let bcCmd;
    const handleTimerCmd = (cmd) => {
      if (!cmd || typeof cmd.boxId !== 'number') return;
      if (cmd.type === 'START_TIMER')
        setTimerStates((prev) => ({ ...prev, [cmd.boxId]: 'running' }));
      if (cmd.type === 'STOP_TIMER') setTimerStates((prev) => ({ ...prev, [cmd.boxId]: 'paused' }));
      if (cmd.type === 'RESUME_TIMER')
        setTimerStates((prev) => ({ ...prev, [cmd.boxId]: 'running' }));
    };
    if ('BroadcastChannel' in window) {
      bcCmd = new BroadcastChannel('timer-cmd');
      bcCmd.onmessage = (ev) => handleTimerCmd(ev.data);
    }
    const onStorageCmd = (e) => {
      if (!e.key || !e.newValue) return;
      if (!(e.key === storageKey('timer-cmd') || e.key === 'timer-cmd')) return;
      try {
        const cmd = JSON.parse(e.newValue);
        handleTimerCmd(cmd);
      } catch (err) {
        debugError('Failed to parse timer-cmd from storage', err);
      }
    };
    window.addEventListener('storage', onStorageCmd);
    // BroadcastChannel (preferat)
    let bc;
    if ('BroadcastChannel' in window) {
      bc = new BroadcastChannel('escalada-timer');
      bc.onmessage = (ev) => {
        const { boxId, remaining } = ev.data || {};
        if (typeof boxId === 'number' && typeof remaining === 'number') {
          setControlTimers((prev) => ({ ...prev, [boxId]: remaining }));
          if (remaining <= 0) {
            setTimerStates((prev) => ({ ...prev, [boxId]: 'idle' }));
          }
        }
      };
    }
    const onStorageTimer = (e) => {
      if (!e.key || !e.newValue) return;
      const nsPrefix = storageKey('timer-sync-');
      if (!(e.key.startsWith(nsPrefix) || e.key.startsWith('timer-sync-'))) return;
      try {
        const { boxId, remaining } = JSON.parse(e.newValue);
        if (typeof boxId === 'number' && typeof remaining === 'number') {
          setControlTimers((prev) => ({ ...prev, [boxId]: remaining }));
          if (remaining <= 0) {
            setTimerStates((prev) => ({ ...prev, [boxId]: 'idle' }));
          }
        }
      } catch (err) {
        debugError('Failed to parse timer-sync', err);
      }
    };
    window.addEventListener('storage', onStorageTimer);
    return () => {
      window.removeEventListener('storage', onStorageTimer);
      window.removeEventListener('storage', onStorageCmd);
      if (bcCmd) bcCmd.close();
      if (bc) bc.close();
    };
  }, []);

  // Format seconds into "mm:ss"
  const formatTime = (sec: number | null | undefined): string => {
    const m = Math.floor(sec / 60)
      .toString()
      .padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const getTimerPreset = (idx: number): string => {
    const stored = safeGetItem(`climbingTime-${idx}`);
    const lb = listboxesRef.current[idx] || listboxes[idx];
    const fallback = readClimbingTime() || climbingTime || '05:00';
    return stored || (lb && lb.timerPreset) || fallback;
  };

  // convert preset MM:SS în secunde pentru un box
  const defaultTimerSec = (idx) => {
    const t = getTimerPreset(idx);
    if (!/^\d{1,2}:\d{2}$/.test(t)) return 300;
    const [m, s] = t.split(':').map(Number);
    const mm = Number.isFinite(m) ? m : 5;
    const ss = Number.isFinite(s) ? s : 0;
    return mm * 60 + ss;
  };

  const readCurrentTimerSec = (idx) => {
    if (typeof controlTimers[idx] === 'number') return controlTimers[idx];
    const raw = safeGetItem(`timer-${idx}`);
    const parsed = parseInt(raw, 10);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const clearRegisteredTime = (idx) => {
    setRegisteredTimes((prev) => {
      const { [idx]: _, ...rest } = prev;
      return rest;
    });
    try {
      safeRemoveItem(`registeredTime-${idx}`);
    } catch (err) {
      debugError('Failed to clear registered time', err);
    }
  };

  const handleRegisterTime = (idx) => {
    if (!timeCriterionEnabled) return;
    const current = readCurrentTimerSec(idx);
    if (current == null) {
      alert('Nu există un timp de înregistrat pentru acest box.');
      return;
    }
    const total = defaultTimerSec(idx);
    const elapsed = Math.max(0, total - current);
    setRegisteredTimes((prev) => ({ ...prev, [idx]: elapsed }));
    safeSetItem(`registeredTime-${idx}`, elapsed.toString());
    registerTime(idx, elapsed);
  };

  useEffect(() => {
    // Inițializare timere din localStorage la încărcare pagină
    const initial = {};
    listboxes.forEach((_, idx) => {
      const v = safeGetItem(`timer-${idx}`);
      if (v != null) initial[idx] = parseInt(v);
    });
    setControlTimers(initial);

    // Ascultă evenimentul 'storage' pentru sincronizare
    const handleStorage = (e) => {
      if (!e.key) return;
      const nsPrefix = storageKey('timer-');
      if (e.key.startsWith(nsPrefix) || e.key.startsWith('timer-')) {
        const parts = e.key.replace(nsPrefix, 'timer-').split('-');
        const boxId = parseInt(parts[1]);
        const remaining = parseInt(e.newValue);
        setControlTimers((prev) => ({
          ...prev,
          [boxId]: remaining,
        }));
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [listboxes]);

  useEffect(() => {
    const initial = {};
    listboxes.forEach((_, idx) => {
      const raw = safeGetItem(`registeredTime-${idx}`);
      const parsed = parseInt(raw, 10);
      if (!Number.isNaN(parsed)) {
        initial[idx] = parsed;
      }
    });
    setRegisteredTimes(initial);

    const onStorageRegistered = (e) => {
      if (!e.key) return;
      const nsPrefix = storageKey('registeredTime-');
      if (!(e.key.startsWith(nsPrefix) || e.key.startsWith('registeredTime-'))) return;
      const idx = Number(e.key.split('-')[1]);
      const parsed = parseInt(e.newValue, 10);
      setRegisteredTimes((prev) => {
        if (Number.isNaN(parsed)) {
          const { [idx]: _, ...rest } = prev;
          return rest;
        }
        return { ...prev, [idx]: parsed };
      });
    };
    window.addEventListener('storage', onStorageRegistered);
    return () => window.removeEventListener('storage', onStorageRegistered);
  }, [listboxes]);

  useEffect(() => {
    const handleStorageClimber = (e) => {
      if (!e.key) return;
      const nsPrefix = storageKey('currentClimber-');
      if (!(e.key.startsWith(nsPrefix) || e.key.startsWith('currentClimber-'))) return;
      const idx = Number(e.key.split('-')[1]);
      const competitorName = normalizeStorageValue(e.newValue);

      if (!competitorName) {
        return; // ignore empty/invalid values
      }

      setCurrentClimbers((prev) => ({
        ...prev,
        [idx]: competitorName,
      }));

      const config = getApiConfig();
      fetch(config.API_CP, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boxId: idx,
          type: 'ACTIVE_CLIMBER',
          competitor: competitorName,
          sessionId: getSessionId(idx),
        }),
      }).catch((err) => debugError('ACTIVE_CLIMBER failed', err));
    };

    window.addEventListener('storage', handleStorageClimber);
    return () => window.removeEventListener('storage', handleStorageClimber);
  }, []);

  useEffect(() => {
    safeSetItem('listboxes', JSON.stringify(listboxes));
  }, [listboxes]);

  useEffect(() => {
    safeSetItem('timeCriterionEnabled', timeCriterionEnabled ? 'on' : 'off');
  }, [timeCriterionEnabled]);

  useEffect(() => {
    if (timeCriterionEnabled) return;
    setRegisteredTimes({});
    listboxes.forEach((_, idx) => {
      try {
        safeRemoveItem(`registeredTime-${idx}`);
      } catch (err) {
        debugError('Failed to clear registered times on toggle off', err);
      }
    });
  }, [timeCriterionEnabled, listboxes]);

  useEffect(() => {
    const onListboxChange = (e) => {
      if (e.key === storageKey('listboxes') || e.key === 'listboxes') {
        try {
          const updated = JSON.parse(e.newValue || '[]');
          setListboxes(updated);
        } catch (err) {
          debugError('Failed to parse listboxes from storage', err);
        }
      }
    };
    window.addEventListener('storage', onListboxChange);
    return () => window.removeEventListener('storage', onListboxChange);
  }, []);

  useEffect(() => {
    const onStorageToggle = (e) => {
      if (e.key === storageKey('timeCriterionEnabled') || e.key === 'timeCriterionEnabled') {
        setTimeCriterionEnabled(e.newValue === 'on');
      }
    };
    window.addEventListener('storage', onStorageToggle);
    return () => window.removeEventListener('storage', onStorageToggle);
  }, []);

  useEffect(() => {
    const handleMessage = (e) => {
      if (e.key === storageKey('climb_response') || e.key === 'climb_response') {
        try {
          const parsed = JSON.parse(e.newValue);
          if (parsed.type === 'RESPONSE_ACTIVE_COMPETITOR' && parsed.boxId === activeBoxId) {
            setActiveCompetitor(parsed.competitor);
            setShowScoreModal(true);
          }
        } catch (error) {
          debugError('Eroare la parsarea datelor:', error);
        }
      }
    };
    window.addEventListener('storage', handleMessage);
    return () => window.removeEventListener('storage', handleMessage);
  }, [activeBoxId]);

  const handleUpload = (data) => {
    const { categorie, concurenti, routesCount, holdsCounts } = data;
    const routesCountNum =
      Number(routesCount) || (Array.isArray(holdsCounts) ? holdsCounts.length : 0);
    const holdsCountsNum = Array.isArray(holdsCounts) ? holdsCounts.map((h) => Number(h)) : [];
    const timerPreset = climbingTime || safeGetItem('climbingTime') || '05:00';
    const newIdx = listboxes.length;
    setListboxes((prev) => {
      const next = [
        ...prev,
        {
          categorie,
          concurenti,
          holdsCounts: holdsCountsNum,
          routesCount: routesCountNum,
          routeIndex: 1,
          holdsCount: holdsCountsNum[0] ?? 0,
          initiated: false,
          timerPreset,
        },
      ];
      try {
        safeSetItem('listboxes', JSON.stringify(next));
      } catch (err) {
        debugError('Failed to persist listboxes to localStorage', err);
      }
      return next;
    });
    safeSetItem(`climbingTime-${newIdx}`, timerPreset);
    // initialize counters for the new box
    setHoldClicks((prev) => ({ ...prev, [newIdx]: 0 }));
    setUsedHalfHold((prev) => ({ ...prev, [newIdx]: false }));
    setTimerStates((prev) => ({ ...prev, [newIdx]: 'idle' }));
    // close modal if open
    setShowModal(false);
  };

  const handleDelete = async (index) => {
    // Reset backend state to avoid stale snapshots
    try {
      await resetBox(index);
    } catch (err) {
      debugError(`RESET_BOX failed for box ${index}`, err);
    }
    // ==================== FIX 2: EXPLICIT WS CLOSE ====================
    // Close WebSocket BEFORE deleting from state to prevent ghost WS
    const ws = wsRefs.current[index];
    if (ws && ws.readyState === WebSocket.OPEN) {
      debugLog(`Closing WebSocket for deleted box ${index}`);
      ws.close(1000, 'Box deleted');
    }
    delete wsRefs.current[index];

    // Optional: clean up tab reference when deleted
    if (openTabs[index] && !openTabs[index].closed) {
      openTabs[index].close();
    }
    delete openTabs[index];

    // ==================== FIX 2: CLEAR SESSION ID ====================
    // Remove session ID and box version to invalidate old Judge tabs
    try {
      safeRemoveItem(`sessionId-${index}`);
      safeRemoveItem(`boxVersion-${index}`);
    } catch (err) {
      debugError('Failed to clear session/version on delete', err);
    }

    setListboxes((prev) => {
      const filtered = prev.filter((_, i) => i !== index);

      // ==================== FIX 1: REINDEX BOXVERSION ====================
      // After delete, renumber localStorage keys for all remaining boxes
      // Map old indices to new indices after filter
      const indexMap = {};
      let newIdx = 0;
      prev.forEach((_, oldIdx) => {
        if (oldIdx !== index) {
          indexMap[oldIdx] = newIdx++;
        }
      });
      // Renumber localStorage keys
      Object.entries(indexMap).forEach(([oldIdx, newIdx]) => {
        const oldIdxNum = Number(oldIdx);
        if (oldIdxNum !== newIdx) {
          // Move boxVersion from old index to new index
          const oldVersionKey = `boxVersion-${oldIdxNum}`;
          const newVersionKey = `boxVersion-${newIdx}`;
          const version = safeGetItem(oldVersionKey);
          if (version) {
            safeSetItem(newVersionKey, version);
            safeRemoveItem(oldVersionKey);
          }
          // Move sessionId from old index to new index
          const oldSessionKey = `sessionId-${oldIdxNum}`;
          const newSessionKey = `sessionId-${newIdx}`;
          const sessionId = safeGetItem(oldSessionKey);
          if (sessionId) {
            safeSetItem(newSessionKey, sessionId);
            safeRemoveItem(oldSessionKey);
          }
          // Move other per-box localStorage keys
          ['timer', 'registeredTime', 'climbingTime', 'ranking', 'rankingTimes'].forEach((key) => {
            const oldKey = `${key}-${oldIdxNum}`;
            const newKey = `${key}-${newIdx}`;
            const value = safeGetItem(oldKey);
            if (value) {
              safeSetItem(newKey, value);
              safeRemoveItem(oldKey);
            }
          });
        }
      });

      return filtered;
    });
    // remove counters for deleted box
    setHoldClicks((prev) => {
      const { [index]: _, ...rest } = prev;
      return rest;
    });
    setUsedHalfHold((prev) => {
      const { [index]: _, ...rest } = prev;
      return rest;
    });
    setTimerStates((prev) => {
      const { [index]: _, ...rest } = prev;
      return rest;
    });
    // remove current climber for deleted box
    setCurrentClimbers((prev) => {
      const { [index]: _, ...rest } = prev;
      return rest;
    });
    clearRegisteredTime(index);
    try {
      safeRemoveItem(`ranking-${index}`);
      safeRemoveItem(`rankingTimes-${index}`);
    } catch (err) {
      debugError('Failed to clear cached rankings on delete', err);
    }
  };

  // Reset listbox to its initial state
  const handleReset = async (index) => {
    // NEW: Bounds check for box index
    if (index < 0 || index >= listboxes.length) {
      debugError(`Invalid box index: ${index}`);
      alert(`Invalid box index: ${index}`);
      return;
    }

    const boxToReset = listboxes[index];

    // ==================== FIX 3: GUARD HOLDSCOUNT ARRAY ====================
    // Validate that holdsCounts exists and has at least one element before reset
    if (
      !boxToReset ||
      !Array.isArray(boxToReset.holdsCounts) ||
      boxToReset.holdsCounts.length === 0
    ) {
      debugError(`Cannot reset box ${index}: missing or empty holdsCounts array`, boxToReset);
      return;
    }
    // Reset backend state and regenerate sessionId
    try {
      await resetBox(index);
    } catch (err) {
      debugError(`RESET_BOX failed for box ${index}`, err);
    }

    setListboxes((prev) =>
      prev
        .map((lb, i) => {
          if (i !== index) return lb;
          return {
            ...lb,
            initiated: false,
            routeIndex: 1,
            holdsCount: lb.holdsCounts[0],
            concurenti: lb.concurenti.map((c) => ({ ...c, marked: false })),
          };
        })
        // caz special: dacă există un listbox “următor” în aceeași categorie, îl eliminăm
        .filter((lb, i) => i === index || lb.categorie !== listboxes[index].categorie),
    );
    // închide tab-ul dacă era deschis
    const tab = openTabs[index];
    if (tab && !tab.closed) tab.close();
    delete openTabs[index];
    // reset local state for holds and timer
    setHoldClicks((prev) => ({ ...prev, [index]: 0 }));
    setUsedHalfHold((prev) => ({ ...prev, [index]: false }));
    setTimerStates((prev) => ({ ...prev, [index]: 'idle' }));
    clearRegisteredTime(index);
    // reset current climber highlight
    setCurrentClimbers((prev) => ({ ...prev, [index]: '' }));
  };

  const handleInitiate = (index) => {
    // 1. Marchează listbox‑ul ca inițiat
    setListboxes((prev) => prev.map((lb, i) => (i === index ? { ...lb, initiated: true } : lb)));
    setTimerStates((prev) => ({ ...prev, [index]: 'idle' }));
    clearRegisteredTime(index);
    // 2. Dacă tab‑ul nu există sau s‑a închis → deschide
    let tab = openTabs[index];
    if (!isTabAlive(tab)) {
      const url = `${window.location.origin}/#/contest/${index}`;
      tab = window.open(url, '_blank');
      if (tab) openTabs[index] = tab;
    } else {
      // tab există: adu‑l în față
      tab.focus();
    }

    // 3. Trimite mesaj de (re)inițiere pentru traseul curent prin HTTP+WS
    if (tab && !tab.closed) {
      const lb = listboxes[index];
      const preset = getTimerPreset(index);
      safeSetItem(`climbingTime-${index}`, preset);
      // send INIT_ROUTE via HTTP+WS
      initRoute(index, lb.routeIndex, lb.holdsCount, lb.concurenti, preset);
    }
  };

  // Advance to the next route on demand
  const handleNextRoute = (index) => {
    // NEW: Bounds check for box index
    if (index < 0 || index >= listboxes.length) {
      debugError(`Invalid box index: ${index}`);
      alert(`Invalid box index: ${index}`);
      return;
    }

    const currentBox = listboxes[index];
    const next = currentBox.routeIndex + 1;
    if (next > currentBox.routesCount) {
      debugWarn(
        `Cannot advance to next route: route ${next} exceeds routesCount ${currentBox.routesCount}`,
      );
      alert('Already on the last route');
      return;
    }

    setListboxes((prev) =>
      prev.map((lb, i) => {
        if (i !== index) return lb;
        const nextRoute = lb.routeIndex + 1;
        if (nextRoute > lb.routesCount) return lb; // nu depășește
        return {
          ...lb,
          routeIndex: nextRoute,
          holdsCount: lb.holdsCounts[nextRoute - 1],
          initiated: false,
          concurenti: lb.concurenti.map((c) => ({ ...c, marked: false })),
        };
      }),
    );
    // resetează contorul local de holds
    setHoldClicks((prev) => ({ ...prev, [index]: 0 }));
    // reset timer button
    setTimerStates((prev) => ({ ...prev, [index]: 'idle' }));
    clearRegisteredTime(index);
    try {
      safeRemoveItem(`ranking-${index}`);
      safeRemoveItem(`rankingTimes-${index}`);
    } catch (err) {
      debugError('Failed to clear cached rankings on reset', err);
    }
    // Send INIT_ROUTE for the next route
    const updatedBox = listboxes[index];
    const nextRouteIndex = updatedBox.routeIndex + 1;
    if (nextRouteIndex <= updatedBox.routesCount) {
      const nextHoldsCount = updatedBox.holdsCounts[nextRouteIndex - 1];
      const nextCompetitors = updatedBox.concurenti.map((c) => ({ ...c, marked: false }));
      initRoute(index, nextRouteIndex, nextHoldsCount, nextCompetitors, getTimerPreset(index));
    }
  };
  // --- handlere globale pentru butoane optimiste ------------------
  const handleClickStart = async (boxIdx) => {
    setLoadingBoxes((prev) => new Set(prev).add(boxIdx)); // TASK 3.1: Set loading
    setTimerStates((prev) => ({ ...prev, [boxIdx]: 'running' }));
    clearRegisteredTime(boxIdx);
    try {
      await startTimer(boxIdx);
    } catch (err) {
      debugError('START_TIMER failed:', err);
      setTimerStates((prev) => ({ ...prev, [boxIdx]: 'idle' }));
    } finally {
      setLoadingBoxes((prev) => {
        const next = new Set(prev);
        next.delete(boxIdx);
        return next;
      }); // TASK 3.1: Clear loading
    }
  };

  const handleClickStop = async (boxIdx) => {
    setLoadingBoxes((prev) => new Set(prev).add(boxIdx)); // TASK 3.1: Set loading
    setTimerStates((prev) => ({ ...prev, [boxIdx]: 'paused' }));
    try {
      await stopTimer(boxIdx);
    } catch (err) {
      debugError('STOP_TIMER failed:', err);
      setTimerStates((prev) => ({ ...prev, [boxIdx]: 'running' }));
    } finally {
      setLoadingBoxes((prev) => {
        const next = new Set(prev);
        next.delete(boxIdx);
        return next;
      }); // TASK 3.1: Clear loading
    }
  };

  const handleClickResume = async (boxIdx) => {
    setLoadingBoxes((prev) => new Set(prev).add(boxIdx)); // TASK 3.1: Set loading
    setTimerStates((prev) => ({ ...prev, [boxIdx]: 'running' }));
    clearRegisteredTime(boxIdx);
    try {
      await resumeTimer(boxIdx);
    } catch (err) {
      debugError('RESUME_TIMER failed:', err);
      setTimerStates((prev) => ({ ...prev, [boxIdx]: 'paused' }));
    } finally {
      setLoadingBoxes((prev) => {
        const next = new Set(prev);
        next.delete(boxIdx);
        return next;
      }); // TASK 3.1: Clear loading
    }
  };

  const handleClickHold = async (boxIdx) => {
    setLoadingBoxes((prev) => new Set(prev).add(boxIdx)); // TASK 3.1: Set loading
    try {
      const box = listboxesRef.current[boxIdx] || listboxes[boxIdx];
      const max = Number(box?.holdsCount ?? 0);
      const current = Number(holdClicksRef.current[boxIdx] ?? holdClicks[boxIdx] ?? 0);
      if (max > 0 && current >= max) {
        return;
      }
      await updateProgress(boxIdx, 1);
    } catch (err) {
      debugError('PROGRESS_UPDATE failed:', err);
    } finally {
      setLoadingBoxes((prev) => {
        const next = new Set(prev);
        next.delete(boxIdx);
        return next;
      }); // TASK 3.1: Clear loading
    }
  };

  const handleHalfHoldClick = async (boxIdx) => {
    setLoadingBoxes((prev) => new Set(prev).add(boxIdx)); // TASK 3.1: Set loading
    try {
      const box = listboxesRef.current[boxIdx] || listboxes[boxIdx];
      const max = Number(box?.holdsCount ?? 0);
      const current = Number(holdClicksRef.current[boxIdx] ?? holdClicks[boxIdx] ?? 0);
      if (max > 0 && current >= max) {
        return;
      }
      await updateProgress(boxIdx, 0.1);
    } catch (err) {
      debugError('PROGRESS_UPDATE 0.1 failed:', err);
    } finally {
      setLoadingBoxes((prev) => {
        const next = new Set(prev);
        next.delete(boxIdx);
        return next;
      }); // TASK 3.1: Clear loading
    }
  };

  const persistRankingEntry = (boxIdx, competitor, score, registeredTime) => {
    if (!competitor) return;
    const box = listboxesRef.current[boxIdx] || listboxes[boxIdx];
    const routeIdx = (box?.routeIndex || 1) - 1;
    const timeVal =
      typeof registeredTime === 'string' ? parseFloat(registeredTime) : registeredTime;
    try {
      const rawScores = safeGetItem(`ranking-${boxIdx}`);
      const rawTimes = safeGetItem(`rankingTimes-${boxIdx}`);
      const scores = rawScores ? JSON.parse(rawScores) : {};
      const times = rawTimes ? JSON.parse(rawTimes) : {};
      if (!scores[competitor]) scores[competitor] = [];
      if (!times[competitor]) times[competitor] = [];
      scores[competitor][routeIdx] = score;
      if (typeof timeVal === 'number' && !Number.isNaN(timeVal)) {
        times[competitor][routeIdx] = timeVal;
      }
      safeSetItem(`ranking-${boxIdx}`, JSON.stringify(scores));
      safeSetItem(`rankingTimes-${boxIdx}`, JSON.stringify(times));
    } catch (err) {
      debugError('Failed to persist ranking entry', err);
    }
  };

  const handleScoreSubmit = async (score, boxIdx) => {
    setLoadingBoxes((prev) => new Set(prev).add(boxIdx)); // TASK 3.1: Set loading
    const registeredTime = (() => {
      if (!timeCriterionEnabled) return undefined;
      const fromState = registeredTimes[boxIdx];
      if (typeof fromState === 'number') return fromState;
      const raw = safeGetItem(`registeredTime-${boxIdx}`);
      const parsed = parseInt(raw, 10);
      if (!Number.isNaN(parsed)) return parsed;
      // Fallback: calculează automat pe baza timerului curent
      const current = readCurrentTimerSec(boxIdx);
      if (typeof current === 'number') {
        const total = defaultTimerSec(boxIdx);
        const elapsed = Math.max(0, total - current);
        // salvează pentru consistență locală
        safeSetItem(`registeredTime-${boxIdx}`, elapsed.toString());
        setRegisteredTimes((prev) => ({ ...prev, [boxIdx]: elapsed }));
        return elapsed;
      }
      return undefined;
    })();
    persistRankingEntry(boxIdx, activeCompetitor, score, registeredTime);
    try {
      await submitScore(boxIdx, score, activeCompetitor, registeredTime);
      // Reset UI state for this box
      setHoldClicks((prev) => ({ ...prev, [boxIdx]: 0 }));
      setUsedHalfHold((prev) => ({ ...prev, [boxIdx]: false }));
      setTimerStates((prev) => ({ ...prev, [boxIdx]: 'idle' }));
      setShowScoreModal(false);
      setActiveBoxId(null);
      clearRegisteredTime(boxIdx);
    } finally {
      setLoadingBoxes((prev) => {
        const next = new Set(prev);
        next.delete(boxIdx);
        return next;
      }); // TASK 3.1: Clear loading
    }
  };

  const buildEditLists = (boxIdx) => {
    const comp = [];
    const scores = {};
    const times = {};
    const box = listboxes[boxIdx];
    const routeIdx = (box?.routeIndex || 1) - 1;
    let cachedScores = {};
    let cachedTimes = {};
    try {
      cachedScores = JSON.parse(safeGetItem(`ranking-${boxIdx}`) || '{}');
      cachedTimes = JSON.parse(safeGetItem(`rankingTimes-${boxIdx}`) || '{}');
    } catch (err) {
      debugError('Failed to read cached rankings', err);
    }
    if (box && box.concurenti) {
      box.concurenti.forEach((c) => {
        if (c.marked) comp.push(c.nume);
        const arrScore = cachedScores[c.nume];
        if (Array.isArray(arrScore) && arrScore.length > routeIdx) {
          scores[c.nume] = arrScore[routeIdx];
        }
        const arrTime = cachedTimes[c.nume];
        if (Array.isArray(arrTime) && arrTime.length > routeIdx) {
          times[c.nume] = arrTime[routeIdx];
        }
      });
    }
    return { comp, scores, times };
  };
  const showRankingStatus = (boxIdx, message, type = 'info') => {
    setRankingStatus((prev) => ({ ...prev, [boxIdx]: { message, type } }));
    setTimeout(() => {
      setRankingStatus((prev) => {
        if (prev[boxIdx]?.message !== message) return prev;
        const { [boxIdx]: _, ...rest } = prev;
        return rest;
      });
    }, 3000);
  };
  const handleGenerateRankings = async (boxIdx) => {
    const box = listboxesRef.current[boxIdx] || listboxes[boxIdx];
    if (!box) return;
    let ranking = {};
    let rankingTimes = {};
    try {
      ranking = JSON.parse(safeGetItem(`ranking-${boxIdx}`) || '{}');
      rankingTimes = JSON.parse(safeGetItem(`rankingTimes-${boxIdx}`) || '{}');
    } catch (err) {
      debugError('Failed to read cached rankings for export', err);
    }
    const clubMap = {};
    (box.concurenti || []).forEach((c) => {
      clubMap[c.nume] = c.club;
    });
    try {
      const config = getApiConfig();
      const res = await fetch(`${config.API_CP.replace('/cmd', '')}/save_ranking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categorie: box.categorie,
          route_count: box.routesCount,
          scores: ranking,
          clubs: clubMap,
          times: rankingTimes,
          use_time_tiebreak: timeCriterionEnabled,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showRankingStatus(boxIdx, 'Clasament generat');
    } catch (err) {
      debugError('Eroare la generarea clasamentului:', err);
      showRankingStatus(boxIdx, 'Eroare la generare', 'error');
    }
  };
  const handleCeremony = (category) => {
    // Open the ceremony window immediately on click
    const win = window.open('/ceremony.html', '_blank', 'width=1920,height=1080');
    if (!win) {
      alert('Browserul a blocat fereastra – activează pop-up-uri pentru acest site.');
      return;
    }

    // Fetch podium from backend
    getWinners(category)
      .then((winners) => {
        win.ceremonyWinners = winners;
      })
      .catch((err) => {
        debugError('Error fetching podium:', err);
        alert('Nu am putut obține podium-ul de la server.');
        win.close();
      });
  };

  return (
    <div className="p-6">
      <div className="w-full max-w-md mx-auto">
        <h1 className="text-3xl font-bold text-center mb-6">Control Panel</h1>
        <div className="flex gap-2 justify-center mb-4">
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            onClick={() => setShowModal(true)}
          >
            Open Listbox
          </button>
          <button
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
            onClick={() => setShowTimerModal(true)}
          >
            Set Timer
          </button>
        </div>

        <ModalUpload
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          onUpload={handleUpload}
        />
        <ModalTimer
          isOpen={showTimerModal}
          onClose={() => setShowTimerModal(false)}
          onSet={(time) => {
            safeSetItem('climbingTime', time);
            setClimbingTime(time);
          }}
          timeCriterionEnabled={timeCriterionEnabled}
          onToggleTimeCriterion={handleToggleTimeCriterion}
        />
      </div>

      <div className="mt-6 flex flex-nowrap gap-4 overflow-x-auto">
        {listboxes.map((lb, idx) => {
          const judgeUrl = `${window.location.origin}/#/judge/${idx}`;
          const timerState = timerStates[idx] || 'idle';
          const isRunning = timerState === 'running';
          const isPaused = timerState === 'paused';
          return (
            <details
              key={idx}
              open
              className="relative border border-gray-300 rounded bg-white shadow w-64"
            >
              <summary className="flex justify-between items-center text-lg font-semibold cursor-pointer p-2 bg-gray-100">
                <span>
                  {sanitizeBoxName(lb.categorie)} – Traseu {lb.routeIndex}/{lb.routesCount}
                </span>
                <div className="px-2 py-1 text-right text-sm text-gray-600">
                  {typeof controlTimers[idx] === 'number'
                    ? formatTime(controlTimers[idx])
                    : formatTime(defaultTimerSec(idx))}
                </div>
              </summary>

              <ul className="list-disc pl-5 p-2 bg-blue-900 text-white rounded">
                {lb.concurenti.map((c, i) => {
                  const isClimbing = currentClimbers[idx] === c.nume;
                  return (
                    <li
                      key={i}
                      className={`${
                        c.marked ? 'marked-red ' : ''
                      }${isClimbing ? 'bg-yellow-500 text-white animate-pulse ' : ''}py-1 px-2 rounded`}
                    >
                      {sanitizeCompetitorName(c.nume)} – {sanitizeBoxName(c.club)}
                    </li>
                  );
                })}
              </ul>

              <div className="mt-2 flex flex-col gap-2">
                {!lb.initiated && (
                  <button
                    className={`px-3 py-1 bg-green-600 text-white rounded disabled:opacity-50 ${loadingBoxes.has(idx) ? 'btn-loading' : ''}`}
                    onClick={() => handleInitiate(idx)}
                    disabled={lb.initiated || loadingBoxes.has(idx)}
                  >
                    {loadingBoxes.has(idx) ? (
                      <>
                        <span className="spinner-border spinner-border-sm inline-block mr-2" />
                        Initiating...
                      </>
                    ) : (
                      'Initiate Contest'
                    )}
                  </button>
                )}

                {!isRunning && !isPaused && (
                  <button
                    className={`px-3 py-1 bg-blue-600 text-white rounded disabled:opacity-50 ${loadingBoxes.has(idx) ? 'btn-loading' : ''}`}
                    onClick={() => handleClickStart(idx)}
                    disabled={!lb.initiated || loadingBoxes.has(idx)}
                  >
                    {loadingBoxes.has(idx) ? (
                      <>
                        <span className="spinner-border spinner-border-sm inline-block mr-2" />
                        Starting...
                      </>
                    ) : (
                      'Start Time'
                    )}
                  </button>
                )}

                {isRunning && (
                  <button
                    className={`px-3 py-1 bg-red-600 text-white rounded disabled:opacity-50 ${loadingBoxes.has(idx) ? 'btn-loading' : ''}`}
                    onClick={() => handleClickStop(idx)}
                    disabled={!lb.initiated || loadingBoxes.has(idx)}
                  >
                    {loadingBoxes.has(idx) ? (
                      <>
                        <span className="spinner-border spinner-border-sm inline-block mr-2" />
                        Stopping...
                      </>
                    ) : (
                      'Stop Time'
                    )}
                  </button>
                )}

                {isPaused && (
                  <div className="flex gap-2">
                    <button
                      className={`px-3 py-1 bg-blue-600 text-white rounded disabled:opacity-50 ${loadingBoxes.has(idx) ? 'btn-loading' : ''}`}
                      onClick={() => handleClickResume(idx)}
                      disabled={!lb.initiated || loadingBoxes.has(idx)}
                    >
                      {loadingBoxes.has(idx) ? (
                        <>
                          <span className="spinner-border spinner-border-sm inline-block mr-2" />
                          Resuming...
                        </>
                      ) : (
                        'Resume Time'
                      )}
                    </button>
                    <button
                      className={`px-3 py-1 bg-gray-500 text-white rounded disabled:opacity-50 ${loadingBoxes.has(idx) ? 'btn-loading' : ''}`}
                      onClick={() => handleRegisterTime(idx)}
                      disabled={!lb.initiated || !timeCriterionEnabled || loadingBoxes.has(idx)}
                    >
                      {loadingBoxes.has(idx) ? (
                        <>
                          <span className="spinner-border spinner-border-sm inline-block mr-2" />
                          Registering...
                        </>
                      ) : (
                        'Register Time'
                      )}
                    </button>
                  </div>
                )}

                {isPaused && timeCriterionEnabled && registeredTimes[idx] !== undefined && (
                  <div className="text-xs text-gray-700 px-1">
                    Registered: {formatTime(registeredTimes[idx])}
                  </div>
                )}

                <div className="flex flex-col items-center gap-1">
                  <div className="flex gap-1">
                    <button
                      className="px-12 py-3 bg-purple-600 text-white rounded hover:bg-purple-700 active:scale-95 transition flex flex-col items-center disabled:opacity-50"
                      onClick={() => handleClickHold(idx)}
                      disabled={
                        !lb.initiated ||
                        !isRunning ||
                        (Number(lb.holdsCount ?? 0) > 0 &&
                          Number(holdClicks[idx] ?? 0) >= Number(lb.holdsCount ?? 0))
                      }
                      title={
                        Number(lb.holdsCount ?? 0) > 0 &&
                        Number(holdClicks[idx] ?? 0) >= Number(lb.holdsCount ?? 0)
                          ? 'Top reached! Climber cannot climb over the top :)'
                          : 'Add 1 hold'
                      }
                    >
                      <div className="flex flex-col items-center">
                        <span className="text-xs font-medium">{currentClimbers[idx] || ''}</span>
                        <span>+1 Hold</span>
                        <span className="text-sm">
                          Score {holdClicks[idx] || 0} → {lb.holdsCount}
                        </span>
                      </div>
                    </button>
                    <button
                      className="px-4 py-3 bg-purple-600 text-white rounded hover:bg-purple-700 active:scale-95 transition disabled:opacity-50"
                      onClick={() => handleHalfHoldClick(idx)}
                      disabled={
                        !lb.initiated ||
                        !isRunning ||
                        usedHalfHold[idx] ||
                        (Number(lb.holdsCount ?? 0) > 0 &&
                          Number(holdClicks[idx] ?? 0) >= Number(lb.holdsCount ?? 0))
                      }
                      title={
                        Number(lb.holdsCount ?? 0) > 0 &&
                        Number(holdClicks[idx] ?? 0) >= Number(lb.holdsCount ?? 0)
                          ? 'Top reached! Climber cannot climb over the top :)'
                          : 'Add 0.1 hold'
                      }
                    >
                      + .1
                    </button>
                  </div>
                </div>

                <button
                  className="px-3 py-1 bg-yellow-500 text-white rounded disabled:opacity-50"
                  onClick={() => {
                    setActiveBoxId(idx);
                    requestActiveCompetitor(idx);
                  }}
                  disabled={!lb.initiated || !currentClimbers[idx]}
                >
                  Insert Score
                </button>

                <Suspense fallback={null}>
                  <ModalScore
                    isOpen={showScoreModal && activeBoxId === idx}
                    competitor={activeCompetitor}
                    initialScore={holdClicks[idx] || 0}
                    maxScore={lb.holdsCount}
                    registeredTime={timeCriterionEnabled ? registeredTimes[idx] : undefined}
                    onClose={() => setShowScoreModal(false)}
                    onSubmit={(score) => handleScoreSubmit(score, idx)}
                  />
                </Suspense>

                <button
                  className="px-3 py-1 bg-green-600 text-white rounded mt-2 disabled:opacity-50"
                  onClick={() => {
                    const { comp, scores, times } = buildEditLists(idx);
                    setEditList(comp);
                    setEditScores(scores);
                    setEditTimes(times);
                    setShowModifyModal(true);
                  }}
                  disabled={lb.concurenti.filter((c) => c.marked).length === 0}
                >
                  Modify score
                </button>

                <ModalModifyScore
                  isOpen={showModifyModal && editList.length > 0}
                  competitors={editList}
                  scores={editScores}
                  times={editTimes}
                  onClose={() => setShowModifyModal(false)}
                  onSubmit={(name, newScore, newTime) => {
                    persistRankingEntry(idx, name, newScore, newTime);
                    submitScore(idx, newScore, name, newTime);
                    setShowModifyModal(false);
                  }}
                />

                <button
                  className="px-3 py-1 bg-green-600 text-white rounded disabled:opacity-50"
                  onClick={() => handleNextRoute(idx)}
                  disabled={!lb.concurenti.every((c) => c.marked)}
                >
                  Next Route
                </button>

                <button
                  className="px-3 py-1 bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50"
                  onClick={() => {
                    const url = `${window.location.origin}/#/judge/${idx}`;
                    window.open(url, '_blank');
                  }}
                  disabled={!lb.initiated}
                >
                  Open Judge View
                </button>

                <div className="mt-2 flex flex-col items-center">
                  <span className="text-sm">Judge link</span>
                  <QRCode value={judgeUrl} size={96} />
                </div>

                <div className="flex gap-2">
                  <button
                    className="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600"
                    onClick={() => handleReset(idx)}
                  >
                    Reset Listbox
                  </button>
                  <button
                    className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                    onClick={() => handleDelete(idx)}
                  >
                    Delete Listbox
                  </button>
                </div>

                <button
                  className="mt-2 px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                  onClick={() => handleGenerateRankings(idx)}
                >
                  Generate Rankings
                </button>

                {rankingStatus[idx]?.message && (
                  <div
                    className={`text-sm mt-1 px-2 py-1 rounded ${
                      rankingStatus[idx].type === 'error'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-green-100 text-green-700'
                    }`}
                  >
                    {rankingStatus[idx].message}
                  </div>
                )}

                <button
                  className="mt-2 px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                  onClick={() => handleCeremony(sanitizeBoxName(lb.categorie))}
                >
                  Award Ceremony
                </button>
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
};

export default ControlPanel;
