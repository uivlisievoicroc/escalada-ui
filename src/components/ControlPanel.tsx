import QRCode from 'react-qr-code';
import React, { useState, useEffect, useRef, Suspense, lazy, FC } from 'react';
import { debugLog, debugWarn, debugError } from '../utilis/debug';
import styles from './ControlPanel.module.css';
import { safeSetItem, safeGetItem, safeRemoveItem, storageKey } from '../utilis/storage';
import { normalizeCompetitorKey, sanitizeBoxName, sanitizeCompetitorName } from '../utilis/sanitize';
import type { Box, Competitor, WebSocketMessage, TimerState, LoadingBoxes } from '../types';
import ModalUpload from './ModalUpload';
import AdminExportOfficialView from './AdminExportOfficialView';
import AdminAuditView from './AdminAuditView';
import {
  startTimer,
  stopTimer,
  resumeTimer,
  updateProgress,
  requestActiveCompetitor,
  submitScore,
  initRoute,
  getSessionId,
  setSessionId,
  getBoxVersion,
  resetBox,
} from '../utilis/contestActions';
import ModalModifyScore from './ModalModifyScore';
import getWinners from '../utilis/getWinners';
import useWebSocketWithHeartbeat from '../utilis/useWebSocketWithHeartbeat';
import { normalizeStorageValue } from '../utilis/normalizeStorageValue';
import {
  clearAuth,
  getStoredRole,
  isAuthenticated,
  setJudgePassword as setJudgePasswordApi,
} from '../utilis/auth';
import { downloadOfficialResultsZip } from '../utilis/backup';
import LoginOverlay from './LoginOverlay';

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

type AdminActionsView = 'actions' | 'upload' | 'export' | 'audit';

const ADMIN_VIEW_LABELS: Record<AdminActionsView, string> = {
  actions: 'Actions',
  upload: 'Upload',
  export: 'Export',
  audit: 'Audit',
};

type IconProps = React.SVGProps<SVGSVGElement>;

const IconBase: React.FC<IconProps> = ({ className, children, ...props }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    className={`h-5 w-5 ${className || ''}`}
    aria-hidden="true"
    {...props}
  >
    {children}
  </svg>
);

const Squares2X2Icon: React.FC<IconProps> = (props) => (
  <IconBase {...props}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3 3.75A.75.75 0 013.75 3h4.5a.75.75 0 01.75.75v4.5a.75.75 0 01-.75.75h-4.5A.75.75 0 013 8.25v-4.5zM3 14.25a.75.75 0 01.75-.75h4.5a.75.75 0 01.75.75v4.5a.75.75 0 01-.75.75h-4.5a.75.75 0 01-.75-.75v-4.5zM14.25 3a.75.75 0 00-.75.75v4.5a.75.75 0 00.75.75h4.5a.75.75 0 00.75-.75v-4.5a.75.75 0 00-.75-.75h-4.5zM14.25 14.25a.75.75 0 00-.75.75v4.5a.75.75 0 00.75.75h4.5a.75.75 0 00.75-.75v-4.5a.75.75 0 00-.75-.75h-4.5z"
    />
  </IconBase>
);

const ArrowUpTrayIcon: React.FC<IconProps> = (props) => (
  <IconBase {...props}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 13.5l3-3m0 0l3 3m-3-3v9.75M4.5 18.75h15a2.25 2.25 0 002.25-2.25v-6.75a.75.75 0 10-1.5 0v6.75a.75.75 0 01-.75.75h-15a.75.75 0 01-.75-.75v-6.75a.75.75 0 10-1.5 0v6.75a2.25 2.25 0 002.25 2.25z"
    />
  </IconBase>
);

const ArrowDownTrayIcon: React.FC<IconProps> = (props) => (
  <IconBase {...props}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 13.5l3 3m0 0l3-3m-3 3V6.75M4.5 18.75h15a2.25 2.25 0 002.25-2.25v-6.75a.75.75 0 10-1.5 0v6.75a.75.75 0 01-.75.75h-15a.75.75 0 01-.75-.75v-6.75a.75.75 0 10-1.5 0v6.75a2.25 2.25 0 002.25 2.25z"
    />
  </IconBase>
);

const ClipboardDocumentListIcon: React.FC<IconProps> = (props) => (
  <IconBase {...props}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M16.5 6.75v-1.5a2.25 2.25 0 00-2.25-2.25h-4.5a2.25 2.25 0 00-2.25 2.25v1.5M6 6.75h12a2.25 2.25 0 012.25 2.25v9.75A2.25 2.25 0 0118 21H6a2.25 2.25 0 01-2.25-2.25V9A2.25 2.25 0 016 6.75zM9.75 11.25h4.5M9.75 14.25h4.5M9.75 17.25h4.5"
    />
  </IconBase>
);

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
const parseTimeCriterionValue = (raw: string | null): boolean | null => {
  if (raw === 'on') return true;
  if (raw === 'off') return false;
  if (!raw) return null;
  try {
    return !!JSON.parse(raw);
  } catch {
    return null;
  }
};

const readTimeCriterionEnabled = (boxId: number): boolean => {
  const perBox = parseTimeCriterionValue(safeGetItem(`timeCriterionEnabled-${boxId}`));
  if (perBox !== null) return perBox;
  const legacy = parseTimeCriterionValue(safeGetItem('timeCriterionEnabled'));
  return legacy ?? false;
};

const isTabAlive = (t: Window | null): boolean => {
  try {
    return t !== null && !t.closed;
  } catch {
    return false;
  }
};
const buildJudgeUrl = (boxId: number, categorie: string): string => {
  return `${window.location.origin}/#/judge/${boxId}?cat=${encodeURIComponent(categorie)}`;
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
  const [showBoxTimerDialog, setShowBoxTimerDialog] = useState<boolean>(false);
  const [timerDialogBoxId, setTimerDialogBoxId] = useState<number | null>(null);
  const [timerDialogValue, setTimerDialogValue] = useState<string>('');
  const [timerDialogCriterion, setTimerDialogCriterion] = useState<boolean>(false);
  const [timerDialogError, setTimerDialogError] = useState<string | null>(null);
  const [adminActionsView, setAdminActionsView] = useState<AdminActionsView>('upload');
  const [scoringBoxId, setScoringBoxId] = useState<number | null>(null);
  const [judgeAccessBoxId, setJudgeAccessBoxId] = useState<number | null>(null);
  const [setupBoxId, setSetupBoxId] = useState<number | null>(null);
  const [judgePasswordBoxId, setJudgePasswordBoxId] = useState<number | null>(null);
  const [showQrDialog, setShowQrDialog] = useState<boolean>(false);
  const [adminQrUrl, setAdminQrUrl] = useState<string>('');
  const [showSetPasswordDialog, setShowSetPasswordDialog] = useState<boolean>(false);
  const [showRoutesetterDialog, setShowRoutesetterDialog] = useState<boolean>(false);
  const [routesetterBoxId, setRoutesetterBoxId] = useState<number | null>(null);
  const [routesetterRouteIndex, setRoutesetterRouteIndex] = useState<number>(1);
  const [routesetterNameInput, setRoutesetterNameInput] = useState<string>('');
  const [routesetterNamesTemp, setRoutesetterNamesTemp] = useState<Record<number, string>>({});
  const [routesetterDialogError, setRoutesetterDialogError] = useState<string | null>(null);
  const [judgeUsername, setJudgeUsername] = useState<string>('');
  const [judgePassword, setJudgePassword] = useState<string>('');
  const [judgePasswordConfirm, setJudgePasswordConfirm] = useState<string>('');
  const [judgePasswordStatus, setJudgePasswordStatus] = useState<
    { type: 'success' | 'error'; message: string } | null
  >(null);
  const [controlTimers, setControlTimers] = useState<{ [boxId: number]: number }>({});
  const loadListboxes = (): Box[] => {
    const saved = safeGetItem('listboxes');
    const globalPreset = readClimbingTime();
    if (!saved) return [];
    try {
      return JSON.parse(saved).map((lb: Box) => ({
        ...lb,
        timerPreset: lb.timerPreset || globalPreset,
      }));
    } catch {
      return [];
    }
  };
  const [listboxes, setListboxes] = useState<Box[]>(loadListboxes);
  const [climbingTime, setClimbingTime] = useState<string>(readClimbingTime);
  const [timeCriterionByBox, setTimeCriterionByBox] = useState<Record<number, boolean>>({});
  const [timerStates, setTimerStates] = useState<{ [boxId: number]: TimerState }>({});
  const [activeBoxId, setActiveBoxId] = useState<number | null>(null);
  const [activeCompetitor, setActiveCompetitor] = useState<string>('');
  const [showScoreModal, setShowScoreModal] = useState<boolean>(false);
  const [showModifyModal, setShowModifyModal] = useState<boolean>(false);
  const [editList, setEditList] = useState<string[]>([]);
  const [editScores, setEditScores] = useState<Record<string, number>>({});
  const [editTimes, setEditTimes] = useState<Record<string, number | null | undefined>>({});
  const [currentClimbers, setCurrentClimbers] = useState<{ [boxId: number]: string }>({});
  const [holdClicks, setHoldClicks] = useState<{ [boxId: number]: number }>({});
  const [usedHalfHold, setUsedHalfHold] = useState<{ [boxId: number]: boolean }>({});
  const [registeredTimes, setRegisteredTimes] = useState<{ [boxId: number]: number }>({});
  const registeredTimesRef = useRef<{ [boxId: number]: number }>(registeredTimes);
  useEffect(() => {
    registeredTimesRef.current = registeredTimes;
  }, [registeredTimes]);
  const [rankingStatus, setRankingStatus] = useState<
    Record<number, { message: string; type: 'info' | 'error' }>
  >({});
  const [loadingBoxes, setLoadingBoxes] = useState<LoadingBoxes>(new Set()); // TASK 3.1: Track loading operations
  const [adminRole, setAdminRole] = useState<string | null>(() => getStoredRole());
  const [showAdminLogin, setShowAdminLogin] = useState<boolean>(() => {
    const authenticated = isAuthenticated();
    const r = getStoredRole();
    return !(authenticated && r === 'admin');
  });
  const [exportBoxId, setExportBoxId] = useState<number>(0);

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

  useEffect(() => {
    if (listboxes.length === 0) return;
    setTimeCriterionByBox((prev) => {
      const next = { ...prev };
      listboxes.forEach((_, idx) => {
        if (typeof next[idx] !== 'boolean') {
          next[idx] = readTimeCriterionEnabled(idx);
        }
      });
      return next;
    });
  }, [listboxes]);

  // Auto-select first category in Setup dropdown when boxes are loaded
  useEffect(() => {
    if (listboxes.length > 0 && setupBoxId == null) {
      setSetupBoxId(0);
    }
  }, [listboxes, setupBoxId]);

  // WebSocket: subscribe to each box channel and mirror updates from JudgePage
  const wsRefs = useRef<{ [boxId: string]: WebSocket }>({});
  const disconnectFnsRef = useRef<{ [boxId: string]: () => void }>({}); // TASK 2.4: Store disconnect functions for cleanup
  const getTimeCriterionEnabled = (boxId: number): boolean => {
    const stored = timeCriterionByBox[boxId];
    if (typeof stored === 'boolean') return stored;
    return readTimeCriterionEnabled(boxId);
  };

  const setTimeCriterionState = (boxId: number, enabled: boolean, persist: boolean): void => {
    setTimeCriterionByBox((prev) => ({ ...prev, [boxId]: enabled }));
    if (persist) {
      safeSetItem(`timeCriterionEnabled-${boxId}`, enabled ? 'on' : 'off');
    }
    if (!enabled) {
      clearRegisteredTime(boxId);
    }
  };

  const syncTimeCriterion = (boxId: number, enabled: boolean): void => {
    setTimeCriterionState(boxId, enabled, true);
  };

  const adoptTimeCriterion = (boxId: number, enabled: boolean): void => {
    setTimeCriterionState(boxId, enabled, false);
  };

  const propagateTimeCriterion = async (boxId: number, enabled: boolean): Promise<void> => {
    const previous = getTimeCriterionEnabled(boxId);
    syncTimeCriterion(boxId, enabled);
    try {
      const config = getApiConfig();
      const res = await fetch(config.API_CP, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          boxId,
          type: 'SET_TIME_CRITERION',
          timeCriterionEnabled: enabled,
          sessionId: getSessionId(boxId),
          boxVersion: getBoxVersion(boxId),
        }),
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          clearAuth();
                setAdminRole(null);
          setShowAdminLogin(true);
          throw new Error('auth_required');
        }
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
    } catch (err) {
      debugError('Failed to propagate time criterion toggle', err);
      syncTimeCriterion(boxId, previous);
    }
  };

  // Ensure we always have a fresh sessionId per box (needed for state isolation)
  useEffect(() => {
    const config = getApiConfig();
    // Check if authenticated (token in httpOnly cookie)
    if (!isAuthenticated()) {
      return;
    }
    listboxes.forEach((_, idx) => {
      (async () => {
        try {
          const res = await fetch(`${config.API_CP.replace('/cmd', '')}/state/${idx}`, {
            credentials: 'include',
          });
          if (res.status === 401) {
            clearAuth();
                    setAdminRole(null);
            setShowAdminLogin(true);
            return;
          }
          if (res.ok) {
            const st = await res.json();
            if (st?.sessionId) {
              setSessionId(idx, st.sessionId);
            }
            if (typeof st?.boxVersion === 'number') {
              safeSetItem(`boxVersion-${idx}`, String(st.boxVersion));
            }
            if (typeof st?.timeCriterionEnabled === 'boolean') {
              syncTimeCriterion(idx, st.timeCriterionEnabled);
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
          debugLog('📥 WS mesaj primit în ControlPanel:', msg);
          if (!('boxId' in msg) || +msg.boxId !== idx) return;

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
                setControlTimers((prev) => ({ ...prev, [idx]: Number.isFinite(msg.remaining) ? msg.remaining : 0 }));
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
	              markCompetitorInListboxes(idx, msg.competitor);
	              setHoldClicks((prev) => ({ ...prev, [idx]: 0 }));
	              setUsedHalfHold((prev) => ({ ...prev, [idx]: false }));
	              setTimerStates((prev) => ({ ...prev, [idx]: 'idle' }));
	              setTimerSecondsForBox(idx, defaultTimerSec(idx));
	              clearRegisteredTime(idx);
	              break;
            case 'REGISTER_TIME':
              if (typeof msg.registeredTime === 'number') {
                if (typeof msg.registeredTime === 'number' && !Number.isNaN(msg.registeredTime)) {
                  setRegisteredTimes((prev) => {
                    if (typeof msg.registeredTime === 'number' && !Number.isNaN(msg.registeredTime)) {
                      return { ...prev, [idx]: msg.registeredTime };
                    } else {
                      // Remove the entry if invalid
                      const { [idx]: _, ...rest } = prev;
                      return rest;
                    }
                  });
                }
              }
              break;
            case 'SET_TIME_CRITERION':
              if (typeof msg.timeCriterionEnabled === 'boolean') {
                syncTimeCriterion(idx, msg.timeCriterionEnabled);
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
                    timeCriterionEnabled: getTimeCriterionEnabled(idx),
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
              if (typeof msg.boxVersion === 'number') {
                safeSetItem(`boxVersion-${idx}`, String(msg.boxVersion));
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
                setRegisteredTimes((prev) => {
                  if (typeof msg.registeredTime === 'number' && !Number.isNaN(msg.registeredTime)) {
                    return { ...prev, [idx]: msg.registeredTime };
                  } else {
                    const { [idx]: _, ...rest } = prev;
                    return rest;
                  }
                });
              }
              if (typeof msg.remaining === 'number') {
                setControlTimers((prev) => ({ ...prev, [idx]: typeof msg.remaining === 'number' && Number.isFinite(msg.remaining) ? msg.remaining : 0 }));
              }
              if (typeof msg.timeCriterionEnabled === 'boolean') {
                syncTimeCriterion(idx, msg.timeCriterionEnabled);
              }
              break;
            default:
              break;
          }
        };

        // Create WebSocket connection with heartbeat using a custom implementation
        // that manually manages the connection to fit our multi-box pattern
        const config = getApiConfig();
        // Token is in httpOnly cookie - check if user appears authenticated
        if (!isAuthenticated()) {
          debugWarn(`Skipping WS connect for box ${idx}: not authenticated`);
          return;
        }
        // WebSocket will use cookie for auth (no token in URL for security)
        const url = `${config.WS_PROTOCOL_CP}://${window.location.hostname}:8000/api/ws/${idx}`;
        const ws = new WebSocket(url);
        let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
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

        wsRefs.current[String(idx)] = ws;
        disconnectFnsRef.current[String(idx)] = () => {
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
          if (disconnectFnsRef.current[String(idx)]) {
            disconnectFnsRef.current[String(idx)]();
          }
          const ws = wsRefs.current[String(idx)];
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.close();
          }
          delete wsRefs.current[String(idx)];
          delete disconnectFnsRef.current[String(idx)];
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
        if (!ws) return;
        try {
          // Detach handlers to prevent reconnect loops / side effects after unmount
          ws.onopen = null;
          ws.onmessage = null;
          ws.onerror = null;
          ws.onclose = null;
        } catch (err) {
          debugError(`Error detaching WebSocket handlers for box ${idx}:`, err);
        }
        try {
          if (ws.readyState === WebSocket.OPEN) {
            ws.close(1000, 'ControlPanel unmounting');
          } else if (ws.readyState === WebSocket.CONNECTING) {
            // Avoid closing while CONNECTING (browser warns: "closed before established")
            ws.addEventListener(
              'open',
              () => {
                try {
                  ws.close(1000, 'ControlPanel unmounting');
                } catch {}
              },
              { once: true },
            );
          }
        } catch (err) {
          debugError(`Error closing WebSocket for box ${idx}:`, err);
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
    type TimerCmd = { type: 'START_TIMER' | 'STOP_TIMER' | 'RESUME_TIMER'; boxId: number };
    let bcCmd: BroadcastChannel | undefined;
    const handleTimerCmd = (cmd: Partial<TimerCmd> | null | undefined) => {
      if (!cmd || typeof cmd.boxId !== 'number') return;
      if (cmd.type === 'START_TIMER')
        setTimerStates((prev) => ({ ...prev, [Number(cmd.boxId)]: 'running' }));
      if (cmd.type === 'STOP_TIMER') setTimerStates((prev) => ({ ...prev, [Number(cmd.boxId)]: 'paused' }));
      if (cmd.type === 'RESUME_TIMER')
        setTimerStates((prev) => ({ ...prev, [Number(cmd.boxId)]: 'running' }));
    };
    if ('BroadcastChannel' in window) {
      bcCmd = new BroadcastChannel('timer-cmd');
      bcCmd.onmessage = (ev) => handleTimerCmd(ev.data);
    }
    const onStorageCmd = (e: StorageEvent) => {
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
    let bc: BroadcastChannel | undefined;
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
    const onStorageTimer = (e: StorageEvent) => {
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
    const safeSec = typeof sec === 'number' && !isNaN(sec) ? sec : 0;
    const m = Math.floor(safeSec / 60)
      .toString()
      .padStart(2, '0');
    const s = (safeSec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

	  const getTimerPreset = (idx: number): string => {
	    const stored = safeGetItem(`climbingTime-${idx}`);
	    const lb = listboxesRef.current[idx] || listboxes[idx];
	    const fallback = readClimbingTime() || climbingTime || '05:00';
	    return stored || (lb && lb.timerPreset) || fallback;
	  };

	  const presetToSeconds = (preset: string): number => {
	    if (!/^\d{1,2}:\d{2}$/.test(preset)) return 300;
	    const [m, s] = preset.split(':').map(Number);
	    const mm = Number.isFinite(m) ? m : 5;
	    const ss = Number.isFinite(s) ? s : 0;
	    return mm * 60 + ss;
	  };

	  // convert preset MM:SS în secunde pentru un box
	  const defaultTimerSec = (idx: number) => {
	    return presetToSeconds(getTimerPreset(idx));
	  };

	  const setTimerSecondsForBox = (boxId: number, seconds: number): void => {
	    setControlTimers((prev) => ({ ...prev, [boxId]: seconds }));
	    try {
	      safeSetItem(`timer-${boxId}`, String(seconds));
	    } catch (err) {
	      debugError('Failed to persist timer seconds', err);
	    }
	  };

  interface ReadCurrentTimerSec {
    (idx: number): number | null;
  }

	  const readCurrentTimerSec: ReadCurrentTimerSec = (idx) => {
	    const fromState = controlTimers[idx];
	    if (typeof fromState === 'number' && Number.isFinite(fromState)) {
	      return fromState;
	    }
	    const raw = safeGetItem(`timer-${idx}`);
	    const parsed = parseInt(raw, 10);
	    return Number.isFinite(parsed) ? parsed : null;
	  };

  const clearRegisteredTime = (idx: number) => {
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

	  useEffect(() => {
	    // Inițializare timere din localStorage la încărcare pagină
	    const initial: { [key: number]: number } = {};
	    listboxes.forEach((_, idx) => {
	      const v = safeGetItem(`timer-${idx}`);
	      if (v == null) return;
	      const parsed = parseInt(v, 10);
	      if (Number.isFinite(parsed)) {
	        initial[idx] = parsed;
	      }
	    });
	    setControlTimers(initial);

    // Ascultă evenimentul 'storage' pentru sincronizare
    const handleStorage = (e: StorageEvent) => {
      if (!e.key) return;
      const nsPrefix = storageKey('timer-');
      if (e.key.startsWith(nsPrefix) || e.key.startsWith('timer-')) {
        const parts = e.key.replace(nsPrefix, 'timer-').split('-');
        const boxId = parseInt(parts[1] || '', 10);
        const remaining = parseInt(e.newValue ?? '', 10);
        if (Number.isNaN(boxId) || Number.isNaN(remaining)) return;
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
    const initial: { [boxId: number]: number } = {};
    listboxes.forEach((_, idx) => {
      const raw = safeGetItem(`registeredTime-${idx}`);
      const parsed = parseInt(raw, 10);
      if (!Number.isNaN(parsed)) {
        initial[idx] = parsed;
      }
    });
    setRegisteredTimes(initial);

    interface StorageEventWithKey extends StorageEvent {
      key: string | null;
      newValue: string | null;
    }

    const onStorageRegistered = (e: StorageEventWithKey): void => {
      if (!e.key) return;
      const nsPrefix = storageKey('registeredTime-');
      if (!(e.key.startsWith(nsPrefix) || e.key.startsWith('registeredTime-'))) return;
      const idx: number = Number(e.key.split('-')[1]);
      const parsed: number = parseInt(e.newValue ?? '', 10);
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
    const handleStorageClimber = (e: StorageEvent) => {
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
    const onListboxChange = (e: StorageEvent) => {
      if (e.key === storageKey('listboxes') || e.key === 'listboxes') {
        try {
          const updated: Box[] = JSON.parse(e.newValue || '[]');
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
    const onStorageToggle = (e: StorageEvent) => {
      if (!e.key) return;
      const nsPrefix = storageKey('timeCriterionEnabled-');
      if (!(e.key.startsWith(nsPrefix) || e.key.startsWith('timeCriterionEnabled-'))) return;
      const key = e.key.replace(nsPrefix, 'timeCriterionEnabled-');
      const parts = key.split('-');
      const idx = Number(parts[1] || '');
      if (Number.isNaN(idx)) return;
      const parsed = parseTimeCriterionValue(e.newValue);
      if (parsed === null) return;
      adoptTimeCriterion(idx, parsed);
    };
    window.addEventListener('storage', onStorageToggle);
    return () => window.removeEventListener('storage', onStorageToggle);
  }, []);

  useEffect(() => {
    const handleMessage = (e: StorageEvent) => {
      if (e.key === storageKey('climb_response') || e.key === 'climb_response') {
        try {
          const parsed: any = JSON.parse(e.newValue ?? 'null');
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

  const handleUpload = (data: {
    categorie: string;
    concurenti: Competitor[];
    routesCount?: number | string;
    holdsCounts?: Array<number | string>;
  }) => {
    const { categorie, concurenti, routesCount, holdsCounts } = data;
    const routesCountNum = Number(routesCount) || (Array.isArray(holdsCounts) ? holdsCounts.length : 0);
    const holdsCountsNum = Array.isArray(holdsCounts) ? holdsCounts.map((h) => Number(h)) : [];
    const timerPreset = climbingTime || safeGetItem('climbingTime') || '05:00';
    const newIdx = listboxes.length;

    setListboxes((prev) => {
      const next: Box[] = [
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
    setHoldClicks((prev) => ({ ...prev, [newIdx]: 0 }));
    setUsedHalfHold((prev) => ({ ...prev, [newIdx]: false }));
    setTimerStates((prev) => ({ ...prev, [newIdx]: 'idle' }));
    setAdminActionsView('actions');
  };

  const handleDelete = async (index: number): Promise<void> => {
    // Reset backend state to avoid stale snapshots
    try {
      await resetBox(index);
    } catch (err) {
      debugError(`RESET_BOX failed for box ${index}`, err);
    }
    // ==================== FIX 2: EXPLICIT WS CLOSE ====================
    // Close WebSocket BEFORE deleting from state to prevent ghost WS
    const ws = wsRefs.current[String(index)];
    if (ws && ws.readyState === WebSocket.OPEN) {
      debugLog(`Closing WebSocket for deleted box ${index}`);
      ws.close(1000, 'Box deleted');
    }
    delete wsRefs.current[String(index)];

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
      const indexMap: Record<number, number> = {};
      let newIdx = 0;
      prev.forEach((_, oldIdx) => {
        if (oldIdx !== index) {
          indexMap[oldIdx] = newIdx++;
        }
      });
      // Renumber localStorage keys
      Object.entries(indexMap).forEach(([oldIdxStr, newIdxNum]) => {
        const oldIdxNum = Number(oldIdxStr);
        if (Number.isNaN(oldIdxNum) || oldIdxNum === newIdxNum) return;
          // Move boxVersion from old index to new index
          const oldVersionKey = `boxVersion-${oldIdxNum}`;
          const newVersionKey = `boxVersion-${newIdxNum}`;
          const version = safeGetItem(oldVersionKey);
          if (version) {
            safeSetItem(newVersionKey, version);
            safeRemoveItem(oldVersionKey);
          }
          // Move sessionId from old index to new index
          const oldSessionKey = `sessionId-${oldIdxNum}`;
          const newSessionKey = `sessionId-${newIdxNum}`;
          const sessionId = safeGetItem(oldSessionKey);
          if (sessionId) {
            safeSetItem(newSessionKey, sessionId);
            safeRemoveItem(oldSessionKey);
          }
          // Move other per-box localStorage keys
          ['timer', 'registeredTime', 'climbingTime', 'timeCriterionEnabled', 'ranking', 'rankingTimes'].forEach((key) => {
            const oldKey = `${key}-${oldIdxNum}`;
            const newKey = `${key}-${newIdxNum}`;
            const value = safeGetItem(oldKey);
            if (value) {
              safeSetItem(newKey, value);
              safeRemoveItem(oldKey);
            }
          });
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
    setTimeCriterionByBox((prev) => {
      const next: Record<number, boolean> = {};
      Object.entries(prev).forEach(([key, value]) => {
        const idx = Number(key);
        if (Number.isNaN(idx) || idx == index) return;
        next[idx > index ? idx - 1 : idx] = value as boolean;
      });
      return next;
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
  const handleReset = async (index: number): Promise<void> => {
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
	    setTimerSecondsForBox(index, defaultTimerSec(index));
	    clearRegisteredTime(index);
	    // reset current climber highlight
	    setCurrentClimbers((prev) => ({ ...prev, [index]: '' }));
	  };

	  const handleInitiate = (index: number): void => {
	    // 1. Marchează listbox‑ul ca inițiat
	    setListboxes((prev) => prev.map((lb, i) => (i === index ? { ...lb, initiated: true } : lb)));
	    setTimerStates((prev) => ({ ...prev, [index]: 'idle' }));
	    clearRegisteredTime(index);
		    // Reset displayed timer to current preset (so header matches "Set timer" immediately).
		    const preset = getTimerPreset(index);
		    try {
		      safeSetItem(`climbingTime-${index}`, preset);
		    } catch (err) {
		      debugError('Failed to persist climbingTime preset on initiate', err);
		    }
		    setTimerSecondsForBox(index, presetToSeconds(preset));
		    // 2. Dacă tab‑ul nu există sau s‑a închis → deschide
		    const existingTab = openTabs[index];
	    let tab: Window | null = existingTab;
	    if (!isTabAlive(existingTab)) {
      const url = `${window.location.origin}/#/contest/${index}`;
      tab = window.open(url, '_blank');
      if (tab) openTabs[index] = tab;
    } else {
      // tab există: adu‑l în față
      existingTab?.focus();
    }

		    // 3. Trimite mesaj de (re)inițiere pentru traseul curent prin HTTP+WS
		    if (tab && !tab.closed) {
		      const lb = listboxes[index];
		      // preset already persisted above
		      // send INIT_ROUTE via HTTP+WS
		      initRoute(
		        index,
		        lb.routeIndex,
        lb.holdsCount,
        lb.concurenti,
        preset,
        lb.routesCount,
        lb.holdsCounts,
        lb.categorie,
      );
    }
  };

  // Advance to the next route on demand
  const handleNextRoute = (index: number): void => {
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
	    setTimerSecondsForBox(index, defaultTimerSec(index));
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
      initRoute(
        index,
        nextRouteIndex,
        nextHoldsCount,
        nextCompetitors,
        getTimerPreset(index),
        updatedBox.routesCount,
        updatedBox.holdsCounts,
        updatedBox.categorie,
      );
    }
  };
  // --- handlere globale pentru butoane optimiste ------------------
  const handleClickStart = async (boxIdx: number): Promise<void> => {
    setLoadingBoxes((prev) => new Set(prev).add(boxIdx)); // TASK 3.1: Set loading
    setTimerStates((prev) => ({ ...prev, [boxIdx]: 'running' }));
    clearRegisteredTime(boxIdx);
    try {
      const result: any = await startTimer(boxIdx);
      if (result?.status === 'ignored') {
        debugWarn(`START_TIMER ignored (box ${boxIdx}), resyncing...`);
        try {
          const config = getApiConfig();
          const res = await fetch(`${config.API_CP.replace('/cmd', '')}/state/${boxIdx}`, {
            credentials: 'include',
          });
          if (res.status === 401 || res.status === 403) {
            clearAuth();
            setAdminRole(null);
            setShowAdminLogin(true);
            return;
          }
          if (res.ok) {
            const st = await res.json();
            if (st?.sessionId) setSessionId(boxIdx, st.sessionId);
            if (typeof st?.boxVersion === 'number') safeSetItem(`boxVersion-${boxIdx}`, String(st.boxVersion));
            if (typeof st?.timerState === 'string') {
              // If timer is already running in backend, no need to retry.
              if (st.timerState === 'running') return;
            }
          }
        } catch (err) {
          debugError(`Failed to resync state after ignored START_TIMER for box ${boxIdx}`, err);
        }

        const retry: any = await startTimer(boxIdx);
        if (retry?.status === 'ignored') {
          debugWarn(`START_TIMER still ignored after resync (box ${boxIdx})`);
          setTimerStates((prev) => ({ ...prev, [boxIdx]: 'idle' }));
        }
      }
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

  const handleClickStop = async (boxIdx: number): Promise<void> => {
    setLoadingBoxes((prev) => new Set(prev).add(boxIdx)); // TASK 3.1: Set loading
    setTimerStates((prev) => ({ ...prev, [boxIdx]: 'paused' }));
    try {
      const result: any = await stopTimer(boxIdx);
      if (result?.status === 'ignored') {
        debugWarn(`STOP_TIMER ignored (box ${boxIdx}), resyncing...`);
        try {
          const config = getApiConfig();
          const res = await fetch(`${config.API_CP.replace('/cmd', '')}/state/${boxIdx}`, {
            credentials: 'include',
          });
          if (res.status === 401 || res.status === 403) {
            clearAuth();
            setAdminRole(null);
            setShowAdminLogin(true);
            return;
          }
          if (res.ok) {
            const st = await res.json();
            if (st?.sessionId) setSessionId(boxIdx, st.sessionId);
            if (typeof st?.boxVersion === 'number') safeSetItem(`boxVersion-${boxIdx}`, String(st.boxVersion));
            if (typeof st?.timerState === 'string') {
              // If timer is already paused in backend, no need to retry.
              if (st.timerState === 'paused') return;
            }
          }
        } catch (err) {
          debugError(`Failed to resync state after ignored STOP_TIMER for box ${boxIdx}`, err);
        }

        const retry: any = await stopTimer(boxIdx);
        if (retry?.status === 'ignored') {
          debugWarn(`STOP_TIMER still ignored after resync (box ${boxIdx})`);
          setTimerStates((prev) => ({ ...prev, [boxIdx]: 'running' }));
        }
      }
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

  const handleClickResume = async (boxIdx: number): Promise<void> => {
    setLoadingBoxes((prev) => new Set(prev).add(boxIdx)); // TASK 3.1: Set loading
    setTimerStates((prev) => ({ ...prev, [boxIdx]: 'running' }));
    clearRegisteredTime(boxIdx);
    try {
      const result: any = await resumeTimer(boxIdx);
      if (result?.status === 'ignored') {
        debugWarn(`RESUME_TIMER ignored (box ${boxIdx}), resyncing...`);
        try {
          const config = getApiConfig();
          const res = await fetch(`${config.API_CP.replace('/cmd', '')}/state/${boxIdx}`, {
            credentials: 'include',
          });
          if (res.status === 401 || res.status === 403) {
            clearAuth();
            setAdminRole(null);
            setShowAdminLogin(true);
            return;
          }
          if (res.ok) {
            const st = await res.json();
            if (st?.sessionId) setSessionId(boxIdx, st.sessionId);
            if (typeof st?.boxVersion === 'number') safeSetItem(`boxVersion-${boxIdx}`, String(st.boxVersion));
            if (typeof st?.timerState === 'string') {
              // If timer is already running in backend, no need to retry.
              if (st.timerState === 'running') return;
            }
          }
        } catch (err) {
          debugError(`Failed to resync state after ignored RESUME_TIMER for box ${boxIdx}`, err);
        }

        const retry: any = await resumeTimer(boxIdx);
        if (retry?.status === 'ignored') {
          debugWarn(`RESUME_TIMER still ignored after resync (box ${boxIdx})`);
          setTimerStates((prev) => ({ ...prev, [boxIdx]: 'paused' }));
        }
      }
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

  const handleClickHold = async (boxIdx: number): Promise<void> => {
    setLoadingBoxes((prev) => new Set(prev).add(boxIdx)); // TASK 3.1: Set loading
    try {
      const box = listboxesRef.current[boxIdx] || listboxes[boxIdx];
      const max = Number(box?.holdsCount ?? 0);
      const current = Number(holdClicksRef.current[boxIdx] ?? holdClicks[boxIdx] ?? 0);
      if (max > 0 && current >= max) {
        return;
      }
      const result: any = await updateProgress(boxIdx, 1);
      if (result?.status === 'ignored') {
        try {
          const config = getApiConfig();
          const res = await fetch(`${config.API_CP.replace('/cmd', '')}/state/${boxIdx}`, {
            credentials: 'include',
          });
          if (res.status === 401 || res.status === 403) {
            clearAuth();
            setAdminRole(null);
            setShowAdminLogin(true);
            return;
          }
          if (res.ok) {
            const st = await res.json();
            if (st?.sessionId) setSessionId(boxIdx, st.sessionId);
            if (typeof st?.boxVersion === 'number') safeSetItem(`boxVersion-${boxIdx}`, String(st.boxVersion));
            if (typeof st?.holdCount === 'number') {
              setHoldClicks((prev) => ({ ...prev, [boxIdx]: st.holdCount }));
            }
            if (typeof st?.currentClimber === 'string') {
              setCurrentClimbers((prev) => ({ ...prev, [boxIdx]: st.currentClimber }));
            }
          }
        } catch (err) {
          debugError(`Failed to resync state after ignored PROGRESS_UPDATE for box ${boxIdx}`, err);
        }

        const retry: any = await updateProgress(boxIdx, 1);
        if (retry?.status === 'ignored') {
          debugWarn(`PROGRESS_UPDATE still ignored after resync (box ${boxIdx})`);
        }
      }
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

  const handleHalfHoldClick = async (boxIdx: number): Promise<void> => {
    setLoadingBoxes((prev) => new Set(prev).add(boxIdx)); // TASK 3.1: Set loading
    try {
      const box = listboxesRef.current[boxIdx] || listboxes[boxIdx];
      const max = Number(box?.holdsCount ?? 0);
      const current = Number(holdClicksRef.current[boxIdx] ?? holdClicks[boxIdx] ?? 0);
      if (max > 0 && current >= max) {
        return;
      }
      const result: any = await updateProgress(boxIdx, 0.1);
      if (result?.status === 'ignored') {
        try {
          const config = getApiConfig();
          const res = await fetch(`${config.API_CP.replace('/cmd', '')}/state/${boxIdx}`, {
            credentials: 'include',
          });
          if (res.status === 401 || res.status === 403) {
            clearAuth();
            setAdminRole(null);
            setShowAdminLogin(true);
            return;
          }
          if (res.ok) {
            const st = await res.json();
            if (st?.sessionId) setSessionId(boxIdx, st.sessionId);
            if (typeof st?.boxVersion === 'number') safeSetItem(`boxVersion-${boxIdx}`, String(st.boxVersion));
            if (typeof st?.holdCount === 'number') {
              setHoldClicks((prev) => ({ ...prev, [boxIdx]: st.holdCount }));
            }
            if (typeof st?.currentClimber === 'string') {
              setCurrentClimbers((prev) => ({ ...prev, [boxIdx]: st.currentClimber }));
            }
          }
        } catch (err) {
          debugError(`Failed to resync state after ignored PROGRESS_UPDATE for box ${boxIdx}`, err);
        }

        const retry: any = await updateProgress(boxIdx, 0.1);
        if (retry?.status === 'ignored') {
          debugWarn(`PROGRESS_UPDATE 0.1 still ignored after resync (box ${boxIdx})`);
        }
      }
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

  const persistRankingEntry = (
    boxIdx: number,
    competitor: string,
    score: number,
    registeredTime: number | string | null | undefined,
  ): void => {
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

  const markCompetitorInListboxes = (boxIdx: number, competitor: string): void => {
    const target = normalizeCompetitorKey(competitor);
    if (!target) return;
    setListboxes((prev) =>
      prev.map((lb, i) => {
        if (i !== boxIdx || !lb?.concurenti?.length) return lb;
        const updated = lb.concurenti.map((c) => {
          if (c.marked) return c;
          const candidate = normalizeCompetitorKey(c.nume);
          if (candidate && candidate === target) {
            return { ...c, marked: true };
          }
          return c;
        });
        return { ...lb, concurenti: updated };
      }),
    );
  };

  const handleScoreSubmit = async (
    score: number,
    boxIdx: number,
  ): Promise<boolean | void> => {
    setLoadingBoxes((prev) => new Set(prev).add(boxIdx)); // TASK 3.1: Set loading
    const registeredTime = (() => {
      if (!getTimeCriterionEnabled(boxIdx)) return undefined;
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
    try {
      const result: any = await submitScore(boxIdx, score, activeCompetitor, registeredTime);
      if (result?.status === 'ignored') {
        showRankingStatus(
          boxIdx,
          `SUBMIT_SCORE ignored by backend (${result.reason || 'unknown'}). Resyncing...`,
          'error',
        );
        try {
          const config = getApiConfig();
          const res = await fetch(`${config.API_CP.replace('/cmd', '')}/state/${boxIdx}`, {
            credentials: 'include',
          });
          if (res.status === 401 || res.status === 403) {
            clearAuth();
            setAdminRole(null);
            setShowAdminLogin(true);
            return false;
          }
          if (res.ok) {
            const st = await res.json();
            if (st?.sessionId) setSessionId(boxIdx, st.sessionId);
            if (typeof st?.boxVersion === 'number') safeSetItem(`boxVersion-${boxIdx}`, String(st.boxVersion));
            if (typeof st?.holdCount === 'number') {
              setHoldClicks((prev) => ({ ...prev, [boxIdx]: st.holdCount }));
            }
            if (typeof st?.currentClimber === 'string') {
              setCurrentClimbers((prev) => ({ ...prev, [boxIdx]: st.currentClimber }));
            }
          }
        } catch (err) {
          debugError(`Failed to resync state after ignored SUBMIT_SCORE for box ${boxIdx}`, err);
        }
        return false;
      }

      persistRankingEntry(boxIdx, activeCompetitor, score, registeredTime);
      markCompetitorInListboxes(boxIdx, activeCompetitor);
	      // Reset UI state for this box
	      setHoldClicks((prev) => ({ ...prev, [boxIdx]: 0 }));
	      setUsedHalfHold((prev) => ({ ...prev, [boxIdx]: false }));
	      setTimerStates((prev) => ({ ...prev, [boxIdx]: 'idle' }));
	      setTimerSecondsForBox(boxIdx, defaultTimerSec(boxIdx));
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

  const buildEditLists = (boxIdx: number): {
    comp: string[];
    scores: Record<string, number>;
    times: Record<string, number | null | undefined>;
  } => {
    const comp: string[] = [];
    const scores: Record<string, number> = {};
    const times: Record<string, number | null | undefined> = {};
    const box = listboxes[boxIdx];
    const routeIdx = (box?.routeIndex || 1) - 1;
    let cachedScores: Record<string, number[]> = {};
    let cachedTimes: Record<string, (number | null | undefined)[]> = {};
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
  const showRankingStatus = (boxIdx: number, message: string, type: 'info' | 'error' = 'info') => {
    setRankingStatus((prev) => ({ ...prev, [boxIdx]: { message, type } }));
    setTimeout(() => {
      setRankingStatus((prev) => {
        if (prev[boxIdx]?.message !== message) return prev;
        const { [boxIdx]: _, ...rest } = prev;
        return rest;
      });
    }, 3000);
  };
  const handleGenerateRankings = async (boxIdx: number): Promise<void> => {
    const box = listboxesRef.current[boxIdx] || listboxes[boxIdx];
    if (!box) return;
    let ranking: Record<string, number[]> = {};
    let rankingTimes: Record<string, (number | null | undefined)[]> = {};
    try {
      ranking = JSON.parse(safeGetItem(`ranking-${boxIdx}`) || '{}');
      rankingTimes = JSON.parse(safeGetItem(`rankingTimes-${boxIdx}`) || '{}');
    } catch (err) {
      debugError('Failed to read cached rankings for export', err);
    }
    const clubMap: Record<string, string> = {};
    (box.concurenti || []).forEach((c) => {
      clubMap[c.nume] = c.club ?? '';
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
          use_time_tiebreak: getTimeCriterionEnabled(boxIdx),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showRankingStatus(boxIdx, 'Rankings generated');
    } catch (err) {
      debugError('Failed to generate rankings:', err);
      showRankingStatus(boxIdx, 'Failed to generate rankings', 'error');
    }
  };
  const handleCeremony = (category: string): void => {
    // Open the ceremony window immediately on click
    const win = window.open('/ceremony.html', '_blank', 'width=1920,height=1080');
    if (!win) {
      alert('The browser blocked the window - please allow pop-ups for this site.');
      return;
    }

    // Fetch podium from backend
    getWinners(category)
      .then((winners) => {
        (win as any).ceremonyWinners = winners;
      })
      .catch((err) => {
        debugError('Error fetching podium:', err);
        alert('Unable to fetch podium data from the server.');
        win.close();
      });
  };

  const openQrDialog = (boxIdx: number): void => {
    const box = listboxes[boxIdx];
    if (!box) return;
    const url = buildJudgeUrl(boxIdx, box.categorie);
    setAdminQrUrl(url);
    setShowQrDialog(true);
  };

  const openSetJudgePasswordDialog = (boxIdx: number): void => {
    const box = listboxes[boxIdx];
    if (!box) return;
    setJudgePasswordBoxId(boxIdx);
    if (showAdminLogin || adminRole !== 'admin') {
      setShowAdminLogin(true);
      alert('You must be logged in as admin to set the judge password.');
      return;
    }
    setJudgeUsername((box.categorie || `Box ${boxIdx}`).trim());
    setJudgePassword('');
    setJudgePasswordConfirm('');
    setJudgePasswordStatus(null);
    setShowSetPasswordDialog(true);
  };

  const openRoutesetterDialog = (boxId: number | null): void => {
    if (boxId == null || listboxes.length === 0) return;
    const box = listboxes[boxId];
    const routeIdx = box?.routeIndex || 1;
    const routesCount = box?.routesCount || 1;
    
    // Load all existing routesetter names for all routes
    const tempNames: Record<number, string> = {};
    for (let i = 1; i <= routesCount; i++) {
      const existing =
        safeGetItem(`routesetterName-${boxId}-${i}`) ||
        safeGetItem(`routesetterName-${boxId}`) ||
        safeGetItem('routesetterName') ||
        '';
      if (existing) tempNames[i] = existing;
    }
    
    setRoutesetterBoxId(boxId);
    setRoutesetterRouteIndex(routeIdx);
    setRoutesetterNamesTemp(tempNames);
    setRoutesetterNameInput(tempNames[routeIdx] || '');
    setRoutesetterDialogError(null);
    setShowRoutesetterDialog(true);
  };

  const saveRoutesetter = (): void => {
    if (routesetterBoxId == null) {
      setRoutesetterDialogError('Select a category.');
      return;
    }
    
    // Save current input to temp state first
    const currentName = routesetterNameInput.trim();
    const allNames = { ...routesetterNamesTemp };
    if (currentName) {
      allNames[routesetterRouteIndex] = currentName;
    }
    
    // Validate that at least one route has a name
    const hasAnyName = Object.values(allNames).some(name => name && name.trim());
    if (!hasAnyName) {
      setRoutesetterDialogError('At least one routesetter name is required.');
      return;
    }
    
    // Save all names to localStorage
    Object.entries(allNames).forEach(([routeIdx, name]) => {
      if (name && name.trim()) {
        safeSetItem(`routesetterName-${routesetterBoxId}-${routeIdx}`, name.trim());
      }
    });
    
    // Also save the last entered name as defaults
    if (currentName) {
      safeSetItem(`routesetterName-${routesetterBoxId}`, currentName);
      safeSetItem('routesetterName', currentName);
    }
    
    setShowRoutesetterDialog(false);
  };

  const submitJudgePassword = async (boxIdx: number): Promise<void> => {
    if (showAdminLogin || adminRole !== 'admin') {
      setShowAdminLogin(true);
      setJudgePasswordStatus({
        type: 'error',
        message: 'You must be logged in as admin to set the judge password.',
      });
      return;
    }
    const username = judgeUsername.trim();
    if (!username) {
      setJudgePasswordStatus({ type: 'error', message: 'Username is required.' });
      return;
    }
    if (!judgePassword) {
      setJudgePasswordStatus({ type: 'error', message: 'Password is required.' });
      return;
    }
    if (judgePassword !== judgePasswordConfirm) {
      setJudgePasswordStatus({ type: 'error', message: 'Passwords do not match.' });
      return;
    }
    try {
      const result = await setJudgePasswordApi(boxIdx, judgePassword, username);
      const savedUsername = (result?.username || username).toString();
            const alias = result?.alias ? result.alias.toString() : '';
      const idAlias = result?.id_alias ? result.id_alias.toString() : '';
      const aliases = [alias, idAlias].filter((v) => v && v !== savedUsername);
      const aliasMsg = aliases.length ? ` (also works for ${aliases.join(', ')})` : '';
      setJudgePasswordStatus({
        type: 'success',
        message: `Password set for ${savedUsername}.${aliasMsg}`,
      });
      setJudgePassword('');
      setJudgePasswordConfirm('');
    } catch (err: unknown) {
      debugError('Failed to set judge password', err);
      if (err instanceof Error && err.message === 'auth_required') {
        clearAuth();
        setAdminRole(null);
        setShowAdminLogin(true);
        setJudgePasswordStatus({
          type: 'error',
          message: 'You are not authenticated as admin. Please log in again.',
        });
        return;
      }
      setJudgePasswordStatus({
        type: 'error',
        message: 'Unable to set password. Please verify you are logged in as admin.',
      });
    }
  };


  const openModifyScoreFromAdmin = (): void => {
    if (scoringBoxId == null) return;
    const { comp, scores, times } = buildEditLists(scoringBoxId);
    setEditList(comp);
    setEditScores(scores);
    setEditTimes(times);
    setShowModifyModal(true);
  };

  const openJudgeViewFromAdmin = (): void => {
    if (judgeAccessBoxId == null) return;
    const box = listboxes[judgeAccessBoxId];
    if (!box) return;
    window.open(buildJudgeUrl(judgeAccessBoxId, box.categorie), '_blank');
  };

  const openCeremonyFromAdmin = (): void => {
    if (scoringBoxId == null) return;
    const box = listboxes[scoringBoxId];
    if (!box) return;
    handleCeremony(sanitizeBoxName(box.categorie || `Box ${scoringBoxId}`));
  };

  const handleCopyQrUrl = async (): Promise<void> => {
    if (!adminQrUrl) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(adminQrUrl);
        return;
      }
    } catch (err) {
      debugWarn('Failed to copy QR URL via clipboard API', err);
    }
    window.prompt('Copy the judge URL:', adminQrUrl);
  };

  const normalizeTimerPreset = (value: string): string | null => {
    const match = value.trim().match(/^(\d{1,2}):([0-5]\d)$/);
    if (!match) return null;
    const minutes = match[1].padStart(2, '0');
    return `${minutes}:${match[2]}`;
  };

  const openBoxTimerDialog = (boxId: number | null): void => {
    const resolved =
      typeof boxId === 'number'
        ? boxId
        : listboxes.length > 0
        ? 0
        : null;
    setTimerDialogBoxId(resolved);
    setTimerDialogError(null);
    if (resolved != null) {
      setTimerDialogValue(getTimerPreset(resolved));
      setTimerDialogCriterion(getTimeCriterionEnabled(resolved));
    } else {
      setTimerDialogValue(readClimbingTime());
      setTimerDialogCriterion(false);
    }
    setShowBoxTimerDialog(true);
  };

	  const applyTimerPreset = (boxId: number, preset: string): void => {
	    setListboxes((prev) =>
	      prev.map((lb, idx) => (idx === boxId ? { ...lb, timerPreset: preset } : lb)),
	    );
	    safeSetItem(`climbingTime-${boxId}`, preset);
	    // If timer is idle, update displayed/reset value immediately to match preset.
	    const state = timerStatesRef.current[boxId] || 'idle';
	    if (state !== 'running' && state !== 'paused') {
	      setTimerSecondsForBox(boxId, presetToSeconds(preset));
	    }
	  };

  const saveBoxTimerDialog = async (): Promise<void> => {
    if (timerDialogBoxId == null) {
      setTimerDialogError('Select a box.');
      return;
    }
    const normalized = normalizeTimerPreset(timerDialogValue);
    if (!normalized) {
      setTimerDialogError('Use MM:SS.');
      return;
    }
    applyTimerPreset(timerDialogBoxId, normalized);
    const currentCriterion = getTimeCriterionEnabled(timerDialogBoxId);
    if (timerDialogCriterion !== currentCriterion) {
      await propagateTimeCriterion(timerDialogBoxId, timerDialogCriterion);
    }
    setShowBoxTimerDialog(false);
  };

  const handleExportOfficial = async () => {
    if (showAdminLogin || adminRole !== 'admin') {
      setShowAdminLogin(true);
      alert('You must be logged in as admin for official export.');
      return;
    }
    try {
      await downloadOfficialResultsZip(exportBoxId);
    } catch (err) {
      debugError('Failed to export official results ZIP', err);
      alert(
        'Official export failed: verify the API is running and you are logged in as admin.',
      );
    }
  };

  const handleAdminLogout = () => {
    clearAuth();
    setAdminRole(null);
    setShowAdminLogin(true);
  };


  useEffect(() => {
    // Keep selected export box in range when list changes
    if (listboxes.length === 0) return;
    if (exportBoxId < 0 || exportBoxId >= listboxes.length) {
      setExportBoxId(0);
    }
  }, [listboxes.length, exportBoxId]);

  useEffect(() => {
    const initiatedIds = listboxes
      .map((lb, idx) => (lb.initiated ? idx : null))
      .filter((idx): idx is number => idx !== null);
    if (initiatedIds.length == 0) {
      setScoringBoxId(null);
      return;
    }
    if (scoringBoxId == null || !initiatedIds.includes(scoringBoxId)) {
      setScoringBoxId(initiatedIds[0]);
    }
  }, [listboxes, scoringBoxId]);

  useEffect(() => {
    if (listboxes.length == 0) {
      setJudgeAccessBoxId(null);
      return;
    }
    if (judgeAccessBoxId == null || judgeAccessBoxId >= listboxes.length) {
      setJudgeAccessBoxId(0);
    }
  }, [listboxes.length, judgeAccessBoxId]);

  useEffect(() => {
    setAdminRole(getStoredRole());
  }, []);

  const initiatedBoxIds = listboxes.reduce((acc, lb, idx) => {
    if (lb.initiated) acc.push(idx);
    return acc;
  }, [] as number[]);
  const scoringBox = scoringBoxId != null ? listboxes[scoringBoxId] : null;
  const scoringBoxSelected = scoringBoxId != null && !!scoringBox;
  const scoringBoxHasMarked =
    !!scoringBox?.concurenti?.some((c) => c.marked);
  const scoringEnabled = initiatedBoxIds.length > 0;

  const judgeAccessBox =
    judgeAccessBoxId != null ? listboxes[judgeAccessBoxId] : null;
  const judgeAccessSelected = judgeAccessBoxId != null && !!judgeAccessBox;
  const judgeAccessEnabled = listboxes.length > 0;
  const adminViewLabel = ADMIN_VIEW_LABELS[adminActionsView];
  const adminSections: {
    id: AdminActionsView;
    label: string;
    icon: React.FC<IconProps>;
  }[] = [
    { id: 'upload', label: 'Upload', icon: ArrowUpTrayIcon },
    { id: 'actions', label: 'Actions', icon: Squares2X2Icon },
    { id: 'export', label: 'Export', icon: ArrowDownTrayIcon },
    { id: 'audit', label: 'Audit', icon: ClipboardDocumentListIcon },
  ];

  return (
    <div className={styles.container}>
      {showAdminLogin && (
        <LoginOverlay
          onSuccess={() => {
            setAdminRole(getStoredRole());
            setShowAdminLogin(false);
          }}
        />
      )}
      <div className={styles.header}>
        <h1 className={styles.title}>🎯 Control Panel</h1>
        <p className={styles.subtitle}>Manage competitions in real-time</p>
      </div>
      <section className={styles.adminBar}>
        <div className="flex items-center justify-between mb-md">
          <div>
            <h2 className="text-2xl font-semibold text-primary">Admin Panel</h2>
            <p className="text-sm text-secondary">Admin Panel › {adminViewLabel}</p>
          </div>
          <div className="flex items-center gap-md">
            {adminRole === 'admin' ? (
              <button
                className="modern-btn modern-btn-ghost"
                onClick={handleAdminLogout}
                type="button"
              >
                Log out
              </button>
            ) : (
              <span className="modern-badge modern-badge-neutral">Login required</span>
            )}
          </div>
        </div>

          

          <div className="md:grid md:grid-cols-[220px_1fr]">
            <div className="border-b border-slate-200 md:border-b-0 md:border-r md:border-slate-200">
              <div className="md:hidden px-6 py-3">
                <label className="text-sm">
                  Section
                  <select
                    className="mt-1 w-full border border-slate-300 rounded px-2 py-1"
                    value={adminActionsView}
                    onChange={(e) => setAdminActionsView(e.target.value as AdminActionsView)}
                    disabled={adminRole !== 'admin'}
                  >
                    {adminSections.map(({ id, label }) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="hidden md:block">
                <div className="px-4 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Sections
                </div>
                <nav className="p-2 space-y-1">
                  {adminSections.map(({ id, label, icon: Icon }) => {
                    const isActive = adminActionsView === id;
                    return (
                      <button
                        key={id}
                        className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                          isActive
                            ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-300 border border-cyan-500/30'
                            : 'text-slate-300 hover:bg-white/5 border border-transparent'
                        }`}
                        onClick={() => setAdminActionsView(id)}
                        disabled={adminRole !== 'admin'}
                        type="button"
                      >
                        <Icon className={isActive ? 'text-cyan-400' : 'text-slate-400'} />
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </nav>
              </div>
            </div>

            <div className="p-6">
              {adminRole !== 'admin' ? (
                <div className="text-sm text-slate-500">Admin login required.</div>
              ) : (
                <>
                  {adminActionsView === 'actions' && (
                    <div className="space-y-4">

	                      <div className="grid grid-cols-[repeat(3,minmax(260px,1fr))] gap-3 overflow-x-auto">
                        <div className={styles.adminCard}>
                          <div className={styles.adminCardTitle}>Scoring</div>
                          <label className={styles.modalField}>
                            <span className={styles.modalLabel}>Select category</span>
                            <select
                              className={styles.modalSelect}
                              value={scoringBoxId ?? ''}
                              onChange={(e) => {
                                const value = e.target.value;
                                setScoringBoxId(value === '' ? null : Number(value));
                              }}
                              disabled={!scoringEnabled}
                            >
                              {scoringEnabled ? (
                                initiatedBoxIds.map((idx) => (
                                  <option key={idx} value={idx}>
                                    {sanitizeBoxName(listboxes[idx].categorie || `Box ${idx}`)}
                                  </option>
                                ))
                              ) : (
                                <option value="">No initiated boxes</option>
                              )}
                            </select>
                          </label>
                          {!scoringEnabled && (
                            <div className="text-xs" style={{ color: 'var(--text-tertiary)', marginTop: '8px' }}>
                              upload a category and initiate contest
                            </div>
                          )}
                          <div className="mt-3 flex flex-col gap-2">
                          <button
                            className="modern-btn modern-btn-ghost"
                            onClick={openModifyScoreFromAdmin}
                            disabled={!scoringBoxSelected || !scoringBoxHasMarked}
                            type="button"
                          >
                            Modify score
                          </button>
                          <button
                            className="modern-btn modern-btn-ghost"
                            onClick={openCeremonyFromAdmin}
                            disabled={!scoringBoxSelected}
                            type="button"
                          >
                            Award ceremony
                          </button>
                          </div>
                        </div>

                        <div className={styles.adminCard}>
                          <div className={styles.adminCardTitle}>Judge access</div>
                          <label className={styles.modalField}>
                            <span className={styles.modalLabel}>Select category</span>
                            <select
                              className={styles.modalSelect}
                              value={judgeAccessBoxId ?? ''}
                              onChange={(e) => {
                                const value = e.target.value;
                                setJudgeAccessBoxId(value === '' ? null : Number(value));
                              }}
                              disabled={!judgeAccessEnabled}
                            >
                              {judgeAccessEnabled ? (
                                listboxes.map((b, idx) => (
                                  <option key={idx} value={idx}>
                                    {sanitizeBoxName(b.categorie || `Box ${idx}`)}
                                  </option>
                                ))
                              ) : (
                                <option value="">No boxes available</option>
                              )}
                            </select>
                          </label>
                          {!judgeAccessEnabled && (
                            <div className="text-xs" style={{ color: 'var(--text-tertiary)', marginTop: '8px' }}>
                              upload a category and initiate contest
                            </div>
                          )}
                          <div className="mt-3 flex flex-col gap-2">
                          <button
                            className="modern-btn modern-btn-ghost"
                            onClick={openJudgeViewFromAdmin}
                            disabled={!judgeAccessSelected || !judgeAccessBox?.initiated}
                            type="button"
                          >
                            Open judge view
                          </button>
                          <button
                            className="modern-btn modern-btn-ghost"
                            onClick={() => {
                              if (judgeAccessBoxId == null) return;
                              openQrDialog(judgeAccessBoxId);
                            }}
                            disabled={!judgeAccessSelected}
                            type="button"
                          >
                            Generate QR
                          </button>
                          <button
                            className="modern-btn modern-btn-ghost"
                            onClick={() => {
                              if (judgeAccessBoxId == null) return;
                              openSetJudgePasswordDialog(judgeAccessBoxId);
                            }}
                            disabled={!judgeAccessSelected}
                            type="button"
                          >
                            Set judge password
                          </button>
                          </div>
                        </div>

                        <div className={styles.adminCard}>
                          <div className={styles.adminCardTitle}>Setup</div>
                          <label className={styles.modalField}>
                            <span className={styles.modalLabel}>Select category</span>
                            <select
                              className={styles.modalSelect}
                              value={setupBoxId ?? (listboxes.length > 0 ? 0 : '')}
                              onChange={(e) => {
                                const value = e.target.value;
                                setSetupBoxId(value === '' ? null : Number(value));
                              }}
                              disabled={listboxes.length === 0}
                            >
                              {listboxes.length === 0 ? (
                                <option value="">No boxes available</option>
                              ) : (
                                listboxes.map((b, idx) => (
                                  <option key={idx} value={idx}>
                                    {sanitizeBoxName(b.categorie || `Box ${idx}`)}
                                  </option>
                                ))
                              )}
                            </select>
                          </label>
                          <div className="flex flex-col gap-2 mt-3">
                          <button
                            className="modern-btn modern-btn-ghost"
                            onClick={() => openBoxTimerDialog(setupBoxId)}
                            disabled={setupBoxId == null}
                            type="button"
                          >
                            Set timer
                          </button>
                          <button
                            className="modern-btn modern-btn-ghost"
                            onClick={() => {
                              window.open(`${window.location.origin}/#/rankings`, '_blank');
                            }}
                            type="button"
                          >
                            Open public rankings
                          </button>
                          <button
                            className="modern-btn modern-btn-ghost"
                            onClick={() => openRoutesetterDialog(setupBoxId)}
                            disabled={setupBoxId == null}
                            type="button"
                          >
                            Set routesetter
                          </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {adminActionsView === 'upload' && (
                    <ModalUpload
                      isOpen={adminActionsView === 'upload'}
                      onClose={() => setAdminActionsView('actions')}
                      onUpload={handleUpload}
                    />
                  )}

                  {adminActionsView === 'export' && (
                    <AdminExportOfficialView
                      listboxes={listboxes}
                      exportBoxId={exportBoxId}
                      onChangeExportBoxId={setExportBoxId}
                      onExport={handleExportOfficial}
                    />
                  )}

                  {adminActionsView === 'audit' && (
                    <div className="h-full">
                      <AdminAuditView
                        className=""
                        showOpenFullPage
                        showBackLink={false}
                        showLogout={false}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </section>

      {/* Modals */}
      <ModalModifyScore
        isOpen={showModifyModal && editList.length > 0}
        competitors={editList}
        scores={editScores}
        times={editTimes}
        onClose={() => setShowModifyModal(false)}
        onSubmit={(name: string, newScore: number, newTime: number | null) => {
          if (scoringBoxId == null) return;
          persistRankingEntry(scoringBoxId, name, newScore, newTime);
          submitScore(
            scoringBoxId,
            newScore,
            name,
            typeof newTime === 'number' ? newTime : undefined,
          );
          setShowModifyModal(false);
        }}
      />

	      {showQrDialog && (
	        <div className={styles.modalOverlay}>
	          <div className={styles.modalCard}>
	            <div className={styles.modalHeader}>
	              <div>
	                <div className={styles.modalTitle}>Judge QR</div>
	                <div className={styles.modalSubtitle}>manual authentication required</div>
	              </div>
	              <button
	                className="modern-btn modern-btn-sm modern-btn-ghost"
	                onClick={() => setShowQrDialog(false)}
	                type="button"
	              >
	                Cancel
	              </button>
	            </div>
	            <div className={styles.modalContent}>
	              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
	                <QRCode value={adminQrUrl} size={180} />
                <div style={{ 
                  width: '100%', 
                  padding: '12px', 
                  background: 'rgba(0, 0, 0, 0.4)', 
                  border: '1px solid var(--border-medium)', 
                  borderRadius: 'var(--radius-md)', 
                  fontSize: '12px', 
                  color: 'var(--text-secondary)', 
                  wordBreak: 'break-all'
                }}>
                  {adminQrUrl}
                </div>
                <button
                  className="modern-btn modern-btn-ghost"
                  onClick={handleCopyQrUrl}
                  type="button"
                >
                  Copy URL
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

	      {showSetPasswordDialog && (
	        <div className={styles.modalOverlay}>
	          <div className={styles.modalCard}>
	            <div className={styles.modalHeader}>
	              <div>
	                <div className={styles.modalTitle}>Set judge password</div>
	                <div className={styles.modalSubtitle}>
	                  Choose credentials for the judge login.
	                </div>
	              </div>
	            </div>
	            <div className={styles.modalContent}>
	              <div className={styles.modalField}>
	                <label className={styles.modalLabel}>Username</label>
	                <input
                  className={styles.modalInput}
                  value={judgeUsername}
                  onChange={(e) => setJudgeUsername(e.target.value)}
                  type="text"
                />
              </div>
              <div className={styles.modalField}>
                <label className={styles.modalLabel}>Password</label>
                <input
                  className={styles.modalInput}
                  value={judgePassword}
                  onChange={(e) => setJudgePassword(e.target.value)}
                  type="password"
                />
              </div>
              <div className={styles.modalField}>
                <label className={styles.modalLabel}>Confirm password</label>
                <input
                  className={styles.modalInput}
                  value={judgePasswordConfirm}
                  onChange={(e) => setJudgePasswordConfirm(e.target.value)}
                  type="password"
                />
              </div>
              {judgePasswordStatus && (
                <div
                  className={judgePasswordStatus.type === 'success' ? styles.modalAlertSuccess : styles.modalAlertError}
                >
                  {judgePasswordStatus.message}
                </div>
              )}
              <div className={styles.modalActions}>
                <button
                  className="modern-btn modern-btn-ghost"
                  onClick={() => setShowSetPasswordDialog(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="modern-btn modern-btn-warning"
                  onClick={() => {
                    if (judgePasswordBoxId == null) return;
                    void submitJudgePassword(judgePasswordBoxId);
                  }}
                  type="button"
                >
                  Save password
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

	      {showRoutesetterDialog && (
	        <div className={styles.modalOverlay}>
	          <div className={styles.modalCard}>
	            <div className={styles.modalHeader}>
	              <div>
	                <div className={styles.modalTitle}>Set routesetter</div>
	                <div className={styles.modalSubtitle}>
	                  {routesetterBoxId != null && listboxes[routesetterBoxId] ? (
	                    `Category: ${sanitizeBoxName(listboxes[routesetterBoxId].categorie || `Box ${routesetterBoxId}`)}`
	                  ) : (
	                    'Set the routesetter name for the selected category.'
	                  )}
	                </div>
	              </div>
	            </div>
	            <div className={styles.modalContent}>
              {routesetterBoxId != null && listboxes[routesetterBoxId]?.routesCount > 1 && (
                <div className={styles.modalField}>
                  <label className={styles.modalLabel}>Route</label>
                  <select
                    className={styles.modalSelect}
                    value={routesetterRouteIndex}
                    onChange={(e) => {
                      // Save current input to temp state before switching
                      const currentName = routesetterNameInput.trim();
                      if (currentName) {
                        setRoutesetterNamesTemp(prev => ({
                          ...prev,
                          [routesetterRouteIndex]: currentName
                        }));
                      }
                      
                      // Switch to new route
                      const newRoute = Number(e.target.value);
                      setRoutesetterRouteIndex(newRoute);
                      
                      // Load name for new route from temp state
                      const newName = routesetterNamesTemp[newRoute] || '';
                      setRoutesetterNameInput(newName);
                    }}
                  >
                    {Array.from({ length: listboxes[routesetterBoxId].routesCount }).map((_, i) => (
                      <option key={i + 1} value={i + 1}>
                        Route {i + 1}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className={styles.modalField}>
                <label className={styles.modalLabel}>Routesetter name</label>
                <input
                  className={styles.modalInput}
                  value={routesetterNameInput}
                  onChange={(e) => setRoutesetterNameInput(e.target.value)}
                  placeholder="e.g. Alex Popescu"
                  type="text"
                />
              </div>

              {routesetterDialogError && (
                <div className={styles.modalAlertError}>
                  {routesetterDialogError}
                </div>
              )}

              <div className={styles.modalActions}>
                <button
                  className="modern-btn modern-btn-ghost"
                  onClick={() => setShowRoutesetterDialog(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="modern-btn modern-btn-primary"
                  onClick={saveRoutesetter}
                  type="button"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

	      {showBoxTimerDialog && (
	        <div className={styles.modalOverlay}>
	          <div className={styles.modalCard}>
	            <div className={styles.modalHeader}>
	              <div>
	                <div className={styles.modalTitle}>Set timer</div>
	                <div className={styles.modalSubtitle}>
	                  {timerDialogBoxId != null && listboxes[timerDialogBoxId] ? (
	                    `Category: ${sanitizeBoxName(listboxes[timerDialogBoxId].categorie || `Box ${timerDialogBoxId}`)}`
	                  ) : (
	                    'Configure timer preset and top-3 time display.'
	                  )}
	                </div>
	              </div>
	            </div>
	            <div className={styles.modalContent}>
              <div className={styles.modalField}>
                <label className={styles.modalLabel}>Timer preset (MM:SS)</label>
                <input
                  className={styles.modalInput}
                  value={timerDialogValue}
                  onChange={(e) => setTimerDialogValue(e.target.value)}
                  placeholder="MM:SS"
                  type="text"
                />
              </div>
              <button
                className="modern-btn modern-btn-ghost"
                style={{ width: '100%' }}
                onClick={() => setTimerDialogCriterion((prev) => !prev)}
                disabled={timerDialogBoxId == null}
                type="button"
              >
                Top-3 time display: {timerDialogCriterion ? 'On' : 'Off'}
              </button>
              {timerDialogError && (
                <div className={styles.modalAlertError}>
                  {timerDialogError}
                </div>
              )}
              <div className={styles.modalActions}>
                <button
                  className="modern-btn modern-btn-ghost"
                  onClick={() => setShowBoxTimerDialog(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="modern-btn modern-btn-primary"
                  onClick={() => void saveBoxTimerDialog()}
                  disabled={timerDialogBoxId == null}
                  type="button"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={styles.boxesGrid}>
	        {listboxes.map((lb, idx) => {
	          const timerState = timerStates[idx] || 'idle';
	          const isRunning = timerState === 'running';
	          const isPaused = timerState === 'paused';
	          const statusClass = isRunning ? 'running' : isPaused ? 'paused' : 'idle';
	          const activeKey = normalizeCompetitorKey(currentClimbers[idx] || '');
	          const presetSec = defaultTimerSec(idx);
	          const remainingSec = readCurrentTimerSec(idx);
	          const hasActiveRemaining =
	            !!lb.initiated &&
	            typeof remainingSec === 'number' &&
	            Number.isFinite(remainingSec) &&
	            remainingSec !== presetSec;
	          const displaySec =
	            isRunning || isPaused || hasActiveRemaining ? (remainingSec ?? presetSec) : presetSec;
	          return (
	            <div
	              key={idx}
	              className={`${styles.boxCard} ${loadingBoxes.has(idx) ? styles.loading : ''} fade-in-up`}
	              style={{ animationDelay: `${idx * 0.05}s` }}
            >
              <div className={styles.boxHeader}>
                <div className={styles.boxTitle}>
                  <span>{sanitizeBoxName(lb.categorie)}</span>
                  <span className={`${styles.statusBadge} ${styles[statusClass]}`}>
                    <span className={styles.statusDot}></span>
                    {statusClass.toUpperCase()}
                  </span>
                </div>
	                <div className={styles.boxRouteInfo}>
	                  <span>Route {lb.routeIndex}/{lb.routesCount}</span>
	                  <span className={styles.timerDisplay}>
	                    {formatTime(displaySec)}
	                  </span>
	                </div>
	              </div>

	              <div className={styles.competitorsList}>
	                {lb.concurenti.map((c, i) => {
	                  const isClimbing =
	                    !!activeKey && normalizeCompetitorKey(c.nume) === activeKey;
	                  return (
	                    <div
	                      key={i}
	                      className={`${styles.competitorItem} ${
                        c.marked ? styles.marked : ''
                      } ${isClimbing ? styles.active : ''}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{sanitizeCompetitorName(c.nume)}</span>
                        {c.club && <span className="text-xs text-tertiary">{sanitizeBoxName(c.club)}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className={styles.boxActions}>
                {!lb.initiated && (
                  <button
                    className={`modern-btn modern-btn-success ${loadingBoxes.has(idx) ? 'loading' : ''}`}
                    onClick={() => handleInitiate(idx)}
                    disabled={lb.initiated || loadingBoxes.has(idx)}
                  >
                    {loadingBoxes.has(idx) ? (
                      <>
                        <span className="spinner" style={{ width: '16px', height: '16px', marginRight: '8px' }} />
                        Initiating...
                      </>
                    ) : (
                      '🚀 Initiate Contest'
                    )}
                  </button>
                )}

                {!isRunning && !isPaused && (
                  <button
                    className={`modern-btn modern-btn-primary btn-press-effect ${loadingBoxes.has(idx) ? 'loading' : ''}`}
                    onClick={() => handleClickStart(idx)}
                    disabled={!lb.initiated || loadingBoxes.has(idx)}
                  >
                    {loadingBoxes.has(idx) ? (
                      <>
                        <span className="spinner" style={{ width: '16px', height: '16px', marginRight: '8px' }} />
                        Starting...
                      </>
                    ) : (
                      '▶️ Start Timer'
                    )}
                  </button>
                )}

                {isRunning && (
                  <button
                    className={`modern-btn modern-btn-danger btn-press-effect ${loadingBoxes.has(idx) ? 'loading' : ''}`}
                    onClick={() => handleClickStop(idx)}
                    disabled={!lb.initiated || loadingBoxes.has(idx)}
                  >
                    {loadingBoxes.has(idx) ? (
                      <>
                        <span className="spinner" style={{ width: '16px', height: '16px', marginRight: '8px' }} />
                        Stopping...
                      </>
                    ) : (
                      '⏸️ Stop Timer'
                    )}
                  </button>
                )}

                {isPaused && (
                  <div className="flex gap-sm">
                    <button
                      className={`modern-btn modern-btn-primary btn-press-effect ${loadingBoxes.has(idx) ? 'loading' : ''}`}
                      onClick={() => handleClickResume(idx)}
                      disabled={!lb.initiated || loadingBoxes.has(idx)}
                    >
                      {loadingBoxes.has(idx) ? (
                        <>
                          <span className="spinner" style={{ width: '16px', height: '16px', marginRight: '8px' }} />
                          Resuming...
                        </>
                      ) : (
                        '▶️ Resume Timer'
                      )}
                    </button>
                  </div>
                )}
                <div className={styles.progressControls}>
                  <div className="flex gap-sm flex-1">
                    <button
                      className="modern-btn modern-btn-primary flex-1 btn-press-effect"
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
                        <span className="text-xs font-medium text-accent">{currentClimbers[idx] || ''}</span>
                        <span className="text-lg font-bold">+1 Hold</span>
                        <span className="text-xs text-secondary">
                          {holdClicks[idx] || 0} → {lb.holdsCount}
                        </span>
                      </div>
                    </button>
                    <button
                      className="modern-btn modern-btn-secondary btn-press-effect"
                      style={{ minWidth: '60px' }}
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
                      +0.1
                    </button>
                  </div>
                </div>

                <button
                  className="modern-btn modern-btn-warning btn-press-effect"
                  onClick={() => {
                    setActiveBoxId(idx);
                    requestActiveCompetitor(idx);
                  }}
                  disabled={!lb.initiated || !currentClimbers[idx]}
                >
                  📊 Insert Score
                </button>

                <Suspense fallback={null}>
                  <ModalScore
                    isOpen={showScoreModal && activeBoxId === idx}
                    competitor={activeCompetitor}
                    initialScore={holdClicks[idx] || 0}
                    maxScore={lb.holdsCount}
                    registeredTime={getTimeCriterionEnabled(idx) ? registeredTimes[idx] : undefined}
                    onClose={() => setShowScoreModal(false)}
                    onSubmit={(score: number) => handleScoreSubmit(score, idx)}
                  />
                </Suspense>

                <button
                  className="modern-btn modern-btn-success btn-press-effect"
                  onClick={() => handleNextRoute(idx)}
                  disabled={!lb.concurenti.every((c) => c.marked)}
                >
                  ➡️ Next Route
                </button>

                <div className="flex gap-sm">
                  <button
                    className="modern-btn modern-btn-warning hover-lift"
                    onClick={() => handleReset(idx)}
                  >
                    🔄 Reset
                  </button>
                  <button
                    className="modern-btn modern-btn-danger hover-lift"
                    onClick={() => handleDelete(idx)}
                  >
                    🗑️ Delete
                  </button>
                </div>

                {rankingStatus[idx]?.message && (
                  <div
                    className={`${styles.messageBox} ${
                      rankingStatus[idx].type === 'error' ? styles.error : styles.success
                    }`}
                  >
                    {rankingStatus[idx].type === 'error' ? '⚠️' : 'ℹ️'} {rankingStatus[idx].message}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ControlPanel;
