// JudgePage (Judge Remote)
// Mobile/tablet judge interface for a single contest box.
// Keeps UI in sync with the backend via an authenticated WebSocket,
// with HTTP + localStorage fallbacks for resilience on unstable networks.
import React, { useState, useEffect, useRef, useCallback, useMemo, FC } from 'react';
// URL param identifies which box this judge controls (0-based).
import { useParams } from 'react-router-dom';
import {
  // Contest commands (HTTP -> /api/cmd).
  startTimer,
  stopTimer,
  resumeTimer,
  updateProgress,
  submitScore,
  getSessionId,
  setSessionId,
} from '../utilis/contestActions';
// Realtime updates via per-box WebSocket subscriptions (heartbeat + reconnect).
import useWebSocketWithHeartbeat from '../utilis/useWebSocketWithHeartbeat';
// Debug logging and safe localStorage helpers (namespaced keys).
import { debugLog, debugWarn, debugError } from '../utilis/debug';
import { safeSetItem, safeGetItem, safeRemoveItem, safeGetJSON, storageKey } from '../utilis/storage';
import {
  // Authentication helpers (cookie token lifecycle + role/box gating).
  clearAuth,
  isAuthenticated,
  getStoredRole,
  getStoredBoxes,
} from '../utilis/auth';
// Shared types and UI primitives used across ControlPanel/ContestPage/JudgePage.
import type { WebSocketMessage, TimerState, StateSnapshot } from '../types';
import ModalScore from './ModalScore';
import ModalModifyScore from './ModalModifyScore';
import LoginOverlay from './LoginOverlay';
import { JudgePageSkeleton } from './Skeleton';

type LoginOverlayProps = {
  defaultUsername: string;
  title: string;
  onSuccess: () => void;
};

const TypedLoginOverlay = LoginOverlay as unknown as React.ComponentType<LoginOverlayProps>;

const JudgePage: FC = () => {
  // NOTE: This page runs during live events; verbose logs help diagnose LAN/WS issues quickly.
  debugLog('🟡 [JudgePage] Component rendering START');

  // Build API/WS endpoints from the current host (works for LAN deployments and mobile devices).
  const API_PROTOCOL = window.location.protocol === 'https:' ? 'https' : 'http';
  const API_BASE = `${API_PROTOCOL}://${window.location.hostname}:8000`;
  const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss' : 'ws';

  // Read the box id from the route (e.g. `#/judge/0`) and use it to scope all actions/subscriptions.
  const { boxId } = useParams<{ boxId: string }>();
  const idx = Number(boxId);
  debugLog('🟡 [JudgePage] boxId from params:', boxId, 'idx:', idx);
  debugLog('🟡 [JudgePage] API_BASE:', API_BASE);
  debugLog('🟡 [JudgePage] WS_PROTOCOL:', WS_PROTOCOL);

  // -------------------- Box state (synced from backend) --------------------
  // These values are primarily driven by WS command echoes and authoritative STATE_SNAPSHOT payloads.
  const [initiated, setInitiated] = useState<boolean>(false);
  const [timerState, setTimerState] = useState<TimerState>('idle');
  const [usedHalfHold, setUsedHalfHold] = useState<boolean>(false);
  const [currentClimber, setCurrentClimber] = useState<string>('');
  const [holdCount, setHoldCount] = useState<number>(0);
  // List of competitors for the current route (used to detect when the route has no athletes left).
  const [competitors, setCompetitors] = useState<StateSnapshot['competitors'] | null>(null);

  // Keep the latest currentClimber in a ref for WS handlers that shouldn't depend on React state closures.
  const currentClimberRef = useRef<string>('');
  useEffect(() => {
    currentClimberRef.current = currentClimber;
  }, [currentClimber]);

  // -------------------- UI/network state (local only) --------------------
  // Used to prevent accidental double taps and to drive modal/pending UI states.
  const progressPendingRef = useRef(false);
  const [progressPending, setProgressPending] = useState<boolean>(false);
  const [showScoreModal, setShowScoreModal] = useState<boolean>(false);
  const [scoreSubmitPending, setScoreSubmitPending] = useState<boolean>(false);
  const [scoreSubmitError, setScoreSubmitError] = useState<string | null>(null);

  // Holds on the current route (aka "top") used for clamping and button disabling.
  const [maxScore, setMaxScore] = useState<number>(0);

  // -------------------- Auth + initial loading --------------------
  const [authActive, setAuthActive] = useState<boolean>(() => isAuthenticated());
  const [showLogin, setShowLogin] = useState<boolean>(() => !isAuthenticated());
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);

  // -------------------- Time registration + tiebreak config --------------------
  // `registeredTime` is persisted per-box so a refresh or reconnect won't lose the judge's input.
  const [registeredTime, setRegisteredTime] = useState<number | null>(() => {
    const raw = safeGetItem(`registeredTime-${idx}`);
    const parsed = parseInt(raw, 10);
    return Number.isNaN(parsed) ? null : parsed;
  });

  // Parse "on"/"off"/JSON boolean stored in localStorage (supports legacy formats).
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
  // Read time-criterion flag (per-box first, then legacy global key).
  const readTimeCriterionEnabled = (): boolean => {
    const perBox = parseTimeCriterionValue(safeGetItem(`timeCriterionEnabled-${idx}`));
    if (perBox !== null) return perBox;
    const legacy = parseTimeCriterionValue(safeGetItem('timeCriterionEnabled'));
    return legacy ?? false;
  };
  const [timeCriterionEnabled, setTimeCriterionEnabled] = useState<boolean>(
    () => readTimeCriterionEnabled(),
  );

  // -------------------- Timer display state --------------------
  // `timerSeconds` is the currently displayed remaining time; it is updated by WS snapshots and a local ticker.
  const [timerSeconds, setTimerSeconds] = useState<number | null>(() => {
    const raw = safeGetItem(`timer-${idx}`);
    const parsed = parseInt(raw, 10);
    return Number.isNaN(parsed) ? null : parsed;
  });
  // Timer preset received from the server (authoritative total duration for the progress bar).
  const [serverTimerPresetSec, setServerTimerPresetSec] = useState<number | null>(null);
  // Local "base" for smooth countdown between server updates.
  const timerBaseRef = useRef<{ atMs: number; remaining: number } | null>(null);

  // Used to cancel the HTTP fallback if a WS STATE_SNAPSHOT arrives in time.
  const snapshotTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Centralized auth failure handler used by both HTTP and WS paths.
  const forceReauth = useCallback(
    (reason: string) => {
      debugWarn('🔐 [JudgePage] Forcing re-auth:', reason);
      clearAuth();
      setAuthActive(false);
      setShowLogin(true);
    },
    [setAuthActive, setShowLogin],
  );

  // Read the configured timer preset for this box (per-box key wins over global default).
  const getTimerPreset = useCallback(() => {
    const specific = safeGetItem(`climbingTime-${idx}`);
    const global = safeGetItem('climbingTime');
    return specific || global || '05:00';
  }, [idx]);
  // Convert MM:SS into total seconds.
  const presetToSec = (preset: string): number => {
    const [m, s] = (preset || '').split(':').map(Number);
    return (m || 0) * 60 + (s || 0);
  };
  // Total timer duration used for the progress bar (server value is authoritative if present).
  const totalDurationSec = useCallback((): number => {
    if (typeof serverTimerPresetSec === 'number' && !Number.isNaN(serverTimerPresetSec)) {
      return serverTimerPresetSec;
    }
    return presetToSec(getTimerPreset());
  }, [serverTimerPresetSec, getTimerPreset]);

  type TimerPresetCarrier = Pick<StateSnapshot, 'timerPreset' | 'timerPresetSec'> & {
    [key: string]: any;
  };

  // Accept timer preset from the backend in either pre-parsed (sec) or legacy (MM:SS string) form.
  const applyTimerPresetSnapshot = useCallback((snapshot: TimerPresetCarrier | null) => {
    if (!snapshot) return;
    if (typeof snapshot.timerPresetSec === 'number') {
      setServerTimerPresetSec(snapshot.timerPresetSec);
      return;
    }
    if (typeof snapshot.timerPreset === 'string') {
      const parsedPreset = presetToSec(snapshot.timerPreset);
      if (!Number.isNaN(parsedPreset)) {
        setServerTimerPresetSec(parsedPreset);
      }
    }
  }, []);

  // WebSocket connection status used for UI and banner logic.
  const [wsStatus, setWsStatus] = useState<'connecting' | 'open' | 'closed'>('connecting');
  const [showWsBanner, setShowWsBanner] = useState<boolean>(true);

  // Clear per-box registered time (used when timer resumes or tiebreak is disabled).
  const clearRegisteredTime = useCallback(() => {
    setRegisteredTime(null);
    try {
      safeRemoveItem(`registeredTime-${idx}`);
    } catch (err) {
      debugError('Failed clearing registered time', err);
    }
  }, [idx]);

  // Build WebSocket URL - memoized to prevent reconnect storms from re-renders.
  // Token is in an httpOnly cookie, so WS auth is implicit (no token in the URL).
  const WS_URL = useMemo(() => {
    if (!authActive) {
      return '';
    }
    // No token in URL - WebSocket auth will use httpOnly cookie
    const url = `${WS_PROTOCOL}://${window.location.hostname}:8000/api/ws/${idx}`;
    debugLog('🟡 [JudgePage] WS_URL memoized:', url);
    return url;
  }, [idx, WS_PROTOCOL, authActive]);

  // Message handler for all incoming WS messages.
  // We treat STATE_SNAPSHOT as authoritative and command echoes as incremental UI updates.
  const handleWsMessage = useCallback(
    (msg: WebSocketMessage) => {
      debugLog('🟢 [JudgePage] Handler called with:', msg);

      // Time-criterion flag can change from ControlPanel; persist so a refresh keeps the same behavior.
      if (msg.type === 'SET_TIME_CRITERION') {
        if (+msg.boxId !== idx) return;
        if (typeof msg.timeCriterionEnabled === 'boolean') {
          setTimeCriterionEnabled(msg.timeCriterionEnabled);
          safeSetItem(`timeCriterionEnabled-${idx}`, msg.timeCriterionEnabled ? 'on' : 'off');
        }
        return;
      }
      // Legacy/compat timer sync (best-effort). With server-side timer enabled, snapshots provide remaining time.
      if (msg.type === 'TIMER_SYNC') {
        if (+msg.boxId !== idx) return;
        // With server-side timer enabled, TIMER_SYNC is legacy/best-effort; avoid being misled while running.
        if (timerBaseRef.current) return;
        if (typeof msg.remaining === 'number') {
          const next = Math.max(0, Math.ceil(msg.remaining));
          timerBaseRef.current = { atMs: Date.now(), remaining: next };
          setTimerSeconds(next);
          safeSetItem(`timer-${idx}`, next.toString());
        }
        return;
      }
      // Ignore non-box messages (e.g. PING/PONG) and messages for other boxes.
      if (!('boxId' in msg)) return;
      if (+msg.boxId !== idx) return;

      // Route initialization for this box (starts a fresh competitor flow for the selected route).
      if (msg.type === 'INIT_ROUTE') {
        debugLog('🟢 [JudgePage] Applying INIT_ROUTE:', msg);
        setInitiated(true);
        setMaxScore(msg.holdsCount || 0);
        setCurrentClimber(
          Array.isArray(msg.competitors) && msg.competitors.length ? msg.competitors[0].nume : '',
        );
        setCompetitors(
          Array.isArray(msg.competitors)
            ? msg.competitors.map((c: any) => ({ nume: String(c?.nume || ''), marked: !!c?.marked }))
            : [],
        );
        setTimerState('idle');
        setUsedHalfHold(false);
        setHoldCount(0);
        applyTimerPresetSnapshot(msg);
      }
      // Timer state updates (start/stop/resume).
      if (msg.type === 'START_TIMER') {
        debugLog('🟢 [JudgePage] Applying START_TIMER');
        setTimerState('running');
      }
      if (msg.type === 'STOP_TIMER') {
        debugLog('🟢 [JudgePage] Applying STOP_TIMER');
        setTimerState('paused');
      }
      if (msg.type === 'RESUME_TIMER') {
        debugLog('🟢 [JudgePage] Applying RESUME_TIMER');
        setTimerState('running');
      }
      // Holds/progress updates for the active climber.
      if (msg.type === 'PROGRESS_UPDATE') {
        debugLog('🟢 [JudgePage] Applying PROGRESS_UPDATE:', msg);
        // Prefer authoritative count if provided; otherwise apply delta
        if (typeof msg.holdCount === 'number') {
          setHoldCount(msg.holdCount);
        } else {
          const delta = typeof msg.delta === 'number' ? msg.delta : 1;
          setHoldCount((prev) => {
            if (delta === 1) return Math.floor(prev) + 1;
            return Number((prev + delta).toFixed(1));
          });
          if (delta === 0.1) setUsedHalfHold(true);
          else setUsedHalfHold(false);
        }
      }
      // After scoring a climber, reset local per-climber UI (timer idle, holds cleared).
      if (msg.type === 'SUBMIT_SCORE') {
        debugLog('🟢 [JudgePage] Applying SUBMIT_SCORE');
        setTimerState('idle');
        setUsedHalfHold(false);
        setHoldCount(0);
        // Mark the just-scored competitor so "no athletes left" can be detected without waiting for a full snapshot.
        const scoredName =
          typeof (msg as any).competitor === 'string'
            ? (msg as any).competitor
            : currentClimberRef.current;
        if (scoredName) {
          setCompetitors((prev) =>
            Array.isArray(prev)
              ? prev.map((c) => (c.nume === scoredName ? { ...c, marked: true } : c))
              : prev,
          );
        }
        clearRegisteredTime();
      }
      // Explicitly registered time (optional tiebreak data).
      if (msg.type === 'REGISTER_TIME') {
        debugLog('🟢 [JudgePage] Applying REGISTER_TIME:', msg.registeredTime);
        if (typeof msg.registeredTime === 'number') {
          setRegisteredTime(msg.registeredTime);
          try {
            safeSetItem(`registeredTime-${idx}`, msg.registeredTime.toString());
          } catch (err) {
            debugError('Failed to persist registered time from WS', err);
          }
        }
      }
      // Authoritative full snapshot sent on connect and after important transitions.
      if (msg.type === 'STATE_SNAPSHOT') {
        debugLog('🟢 [JudgePage] Applying STATE_SNAPSHOT:', msg);

        // Clear fallback timeout since snapshot arrived
        if (snapshotTimeoutRef.current) {
          clearTimeout(snapshotTimeoutRef.current);
          snapshotTimeoutRef.current = null;
          debugLog('📗 [JudgePage] Cleared fallback timeout (STATE_SNAPSHOT received)');
        }

        // Always apply snapshot so Judge reflects backend immediately
        setInitiated(!!msg.initiated);
        setMaxScore(msg.holdsCount || 0);
        setCurrentClimber(msg.currentClimber || '');
        setCompetitors(Array.isArray(msg.competitors) ? msg.competitors : []);
        if (msg.sessionId) setSessionId(idx, msg.sessionId);
        if (typeof msg.boxVersion === 'number') {
          safeSetItem(`boxVersion-${idx}`, msg.boxVersion.toString());
        }
        setTimerState(msg.timerState || (msg.started ? 'running' : 'idle'));
        setHoldCount(msg.holdCount || 0);
        applyTimerPresetSnapshot(msg);
        if (typeof msg.registeredTime === 'number') {
          setRegisteredTime(msg.registeredTime);
          try {
            safeSetItem(`registeredTime-${idx}`, msg.registeredTime.toString());
          } catch (err) {
            debugError('Failed to persist registered time from snapshot', err);
          }
        }
        if (typeof msg.remaining === 'number') {
          const next = Math.max(0, Math.ceil(msg.remaining));
          timerBaseRef.current = { atMs: Date.now(), remaining: next };
          setTimerSeconds(next);
          safeSetItem(`timer-${idx}`, next.toString());
        }
        if (typeof msg.timeCriterionEnabled === 'boolean') {
          setTimeCriterionEnabled(msg.timeCriterionEnabled);
          safeSetItem(`timeCriterionEnabled-${idx}`, msg.timeCriterionEnabled ? 'on' : 'off');
        }
      }
      // ControlPanel can push the active climber name even if the judge page isn't driving it.
      if (msg.type === 'ACTIVE_CLIMBER') {
        debugLog('🟢 [JudgePage] Applying ACTIVE_CLIMBER:', msg.competitor);
        setCurrentClimber(msg.competitor || '');
      }
    },
    [idx, applyTimerPresetSnapshot, clearRegisteredTime],
  );

  // Initialize WebSocket hook at top level with memoized URL
  debugLog('🟡 [JudgePage] About to call useWebSocketWithHeartbeat with wsUrl:', WS_URL);
  const { ws, connected, wsError } = useWebSocketWithHeartbeat(WS_URL, (m: WebSocketMessage) => {
    debugLog('🟢 [JudgePage] WS message received:', m.type);
    handleWsMessage(m);
  }) as {
    ws: WebSocket | null;
    connected: boolean;
    wsError: string;
  };
  debugLog('🟡 [JudgePage] Hook returned, connected:', connected, 'ws:', ws ? 'exists' : 'null');
  // Track WS open/close to update banner and trigger resync
  useEffect(() => {
    if (!ws) return;
    const handleOpen = (): void => {
      debugLog('📗 [JudgePage ws effect] handleOpen called, syncing state from server');
      setWsStatus('open');

      // NEW: Force explicit STATE_SNAPSHOT request via WebSocket
      if (ws.readyState === WebSocket.OPEN) {
        debugLog('📗 [JudgePage] Requesting STATE_SNAPSHOT via WebSocket');
        try {
          ws.send(JSON.stringify({ type: 'REQUEST_STATE', boxId: idx }));
        } catch (err) {
          debugError('📗 [JudgePage] Failed to send REQUEST_STATE:', err);
        }
      }

      // Fallback: If no STATE_SNAPSHOT arrives in 2s, fetch via HTTP
      snapshotTimeoutRef.current = setTimeout(() => {
        debugWarn('📗 [JudgePage] No STATE_SNAPSHOT received in 2s, fetching via HTTP');

        fetch(`${API_BASE}/api/state/${idx}`, { credentials: 'include' })
          .then((res) => {
            if (res.status === 401 || res.status === 403) {
              forceReauth(`http_state_fallback_${res.status}`);
              return null;
            }
            return res.ok ? res.json() : null;
          })
          .then((st) => {
            if (!st) return;
            debugLog('📗 [JudgePage] Applied fallback HTTP state:', st);
            if (st.sessionId) setSessionId(idx, st.sessionId);
            if (typeof st.boxVersion === 'number') safeSetItem(`boxVersion-${idx}`, String(st.boxVersion));
            setInitiated(!!st.initiated);
            setMaxScore(st.holdsCount || 0);
            setCurrentClimber(st.currentClimber || '');
            setTimerState(st.timerState || (st.started ? 'running' : 'idle'));
            setHoldCount(st.holdCount || 0);
            applyTimerPresetSnapshot(st);
            if (typeof st.registeredTime === 'number') setRegisteredTime(st.registeredTime);
            if (typeof st.remaining === 'number') setTimerSeconds(st.remaining);
            if (typeof st.timeCriterionEnabled === 'boolean') {
              setTimeCriterionEnabled(st.timeCriterionEnabled);
              safeSetItem(`timeCriterionEnabled-${idx}`, st.timeCriterionEnabled ? 'on' : 'off');
            }
          })
          .catch((err) => debugError('📗 [JudgePage] Failed to fetch fallback state:', err));
      }, 2000);
    };
    const handleClose = (evt: CloseEvent): void => {
      setWsStatus('closed');
      if (evt?.code === 4401 || evt?.code === 4403) {
        forceReauth(evt.reason || `ws_close_${evt.code}`);
      }
    };
    const handleError = (): void => setWsStatus('closed');

    // If socket is already open, call handleOpen immediately (in case open event already fired)
    if (ws.readyState === WebSocket.OPEN) {
      debugLog(
        '📗 [JudgePage ws effect] Socket already OPEN (readyState:',
        ws.readyState,
        '), calling handleOpen immediately',
      );
      handleOpen();
    }

    ws.addEventListener('open', handleOpen);
    ws.addEventListener('close', handleClose);
    ws.addEventListener('error', handleError);
    return () => {
      ws.removeEventListener('open', handleOpen);
      ws.removeEventListener('close', handleClose);
      ws.removeEventListener('error', handleError);
    };
  }, [ws, API_BASE, idx, applyTimerPresetSnapshot, forceReauth]);

  // Format seconds as MM:SS for display (returns "—" when unknown).
  const formatTime = (sec: number | null): string => {
    if (typeof sec !== 'number' || Number.isNaN(sec)) return '—';
    const whole = Math.max(0, Math.floor(sec));
    const m = Math.floor(whole / 60)
      .toString()
      .padStart(2, '0');
    const s = (whole % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Local ticking so Judge sees time flowing between server updates.
  useEffect(() => {
    if (timerState !== 'running') {
      timerBaseRef.current = null;
      return;
    }

    // Ensure we have a base even if we only received a START_TIMER event.
    if (!timerBaseRef.current) {
      const fallback =
        typeof timerSeconds === 'number' && Number.isFinite(timerSeconds)
          ? timerSeconds
          : parseInt(safeGetItem(`timer-${idx}`) || '', 10);
      const initial = Number.isFinite(fallback) ? Math.max(0, fallback) : totalDurationSec();
      timerBaseRef.current = { atMs: Date.now(), remaining: initial };
      setTimerSeconds(initial);
      safeSetItem(`timer-${idx}`, initial.toString());
    }

    const tick = () => {
      const base = timerBaseRef.current;
      if (!base) return;
      const elapsedSec = (Date.now() - base.atMs) / 1000;
      const next = Math.max(0, Math.ceil(base.remaining - elapsedSec));
      setTimerSeconds(next);
      safeSetItem(`timer-${idx}`, next.toString());
    };

    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [timerState, timerSeconds, idx, totalDurationSec]);

  // ==================== FIX 2: WATCH BOXVERSION CHANGES ====================
  // If reset happens (boxVersion changes) in ControlPanel, refresh Judge state
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (
        (e.key === storageKey(`boxVersion-${idx}`) || e.key === `boxVersion-${idx}`) &&
        e.newValue !== e.oldValue
      ) {
        debugLog(
          `📦 boxVersion-${idx} changed from ${e.oldValue} to ${e.newValue}, refreshing Judge state...`,
        );
        // Re-fetch state from server to sync with new version
        (async () => {
          try {
            const res = await fetch(`${API_BASE}/api/state/${idx}`, {
              credentials: 'include',
            });
            if (res.status === 401 || res.status === 403) {
              forceReauth(`http_state_refresh_${res.status}`);
              return;
            }
            if (res.ok) {
              const st = await res.json();
              setInitiated(st.initiated);
              setMaxScore(st.holdsCount);
              setCurrentClimber(st.currentClimber);
              setTimerState(st.timerState || (st.started ? 'running' : 'idle'));
              setHoldCount(st.holdCount);
              applyTimerPresetSnapshot(st);
            }
          } catch (err) {
            debugError('Failed to refresh state after boxVersion change', err);
          }
        })();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [idx, API_BASE, forceReauth]);

  // Force reset if link has reset=1 (useful when QR should trigger fresh login)
  useEffect(() => {
    const paramsSearch = new URLSearchParams(window.location.search);
    let resetFlag = paramsSearch.get('reset');
    if (!resetFlag && window.location.hash && window.location.hash.includes('?')) {
      const [, qs] = window.location.hash.split('?');
      resetFlag = new URLSearchParams(qs).get('reset');
    }
    if (resetFlag === '1') {
      forceReauth('reset=1');
    }
  }, [forceReauth]);

  // If token exists but is wrong role/box, force re-auth
  useEffect(() => {
    const role = getStoredRole();
    const boxes = getStoredBoxes();
    if (role !== 'judge' || !boxes.includes(idx)) {
      forceReauth('role_or_box_mismatch');
    }
  }, [idx, forceReauth]);

  // Fetch initial state snapshot on mount
  useEffect(() => {
    if (!authActive) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/state/${idx}`, {
          credentials: 'include',
        });
        if (res.status === 401 || res.status === 403) {
          forceReauth(`http_state_init_${res.status}`);
          return;
        }
        if (res.ok) {
          const st = await res.json();
          if (st.sessionId) setSessionId(idx, st.sessionId);
          if (typeof st.boxVersion === 'number') safeSetItem(`boxVersion-${idx}`, String(st.boxVersion));
          setInitiated(st.initiated);
          setMaxScore(st.holdsCount);
          setCurrentClimber(st.currentClimber);
          setTimerState(st.timerState || (st.started ? 'running' : 'idle'));
          setHoldCount(st.holdCount);
          applyTimerPresetSnapshot(st);
          if (typeof st.registeredTime === 'number') setRegisteredTime(st.registeredTime);
          if (typeof st.remaining === 'number') setTimerSeconds(st.remaining);
          if (typeof st.timeCriterionEnabled === 'boolean') {
            setTimeCriterionEnabled(st.timeCriterionEnabled);
            safeSetItem(`timeCriterionEnabled-${idx}`, st.timeCriterionEnabled ? 'on' : 'off');
          }
          setIsInitialLoading(false);
        }
      } catch (e) {
        debugError('Error fetching initial state:', e);
        setIsInitialLoading(false);
      }
    })();
  }, [idx, API_BASE, applyTimerPresetSnapshot, authActive, forceReauth]);

  // Sync a few critical values via localStorage events (useful when ControlPanel and Judge are in different tabs).
  useEffect(() => {
    const syncFromStorage = () => {
      const rawTimer = safeGetItem(`timer-${idx}`);
      const parsedTimer = parseInt(rawTimer, 10);
      setTimerSeconds(Number.isNaN(parsedTimer) ? null : parsedTimer);
      const rawReg = safeGetItem(`registeredTime-${idx}`);
      const parsedReg = parseInt(rawReg, 10);
      setRegisteredTime(Number.isNaN(parsedReg) ? null : parsedReg);
      setTimeCriterionEnabled(readTimeCriterionEnabled());
    };
    syncFromStorage();
    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey(`timer-${idx}`) || e.key === `timer-${idx}`) {
        const parsed = parseInt(e.newValue ?? '', 10);
        setTimerSeconds(Number.isNaN(parsed) ? null : parsed);
      }
      if (e.key === storageKey(`registeredTime-${idx}`) || e.key === `registeredTime-${idx}`) {
        const parsed = parseInt(e.newValue ?? '', 10);
        setRegisteredTime(Number.isNaN(parsed) ? null : parsed);
      }
      const nsPrefix = storageKey('timeCriterionEnabled-');
      if (!e.key) return;
      if (!(e.key.startsWith(nsPrefix) || e.key.startsWith('timeCriterionEnabled-'))) return;
      const key = e.key.replace(nsPrefix, 'timeCriterionEnabled-');
      const parts = key.split('-');
      const boxKey = Number(parts[1] || '');
      if (Number.isNaN(boxKey) || boxKey !== idx) return;
      const parsed = parseTimeCriterionValue(e.newValue);
      if (parsed === null) return;
      setTimeCriterionEnabled(parsed);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [idx]);

  // If time tiebreak is turned off, ensure we never submit a stale registeredTime.
  useEffect(() => {
    if (!timeCriterionEnabled) {
      clearRegisteredTime();
    }
  }, [timeCriterionEnabled, clearRegisteredTime]);

  // Debounce WS banner to avoid flicker on quick reconnects
  useEffect(() => {
    if (wsStatus === 'open') {
      setShowWsBanner(false);
      return;
    }
    const t = setTimeout(() => setShowWsBanner(true), 800);
    return () => clearTimeout(t);
  }, [wsStatus]);

  // Pull the latest authoritative snapshot via HTTP.
  // Used as a recovery path when the backend ignores a command (stale session/version) or WS is unstable.
  const pullLatestState = async (): Promise<any> => {
    let snapshot: any = {};
    try {
      const res = await fetch(`${API_BASE}/api/state/${idx}`, {
        credentials: 'include',
      });
      if (res.status === 401 || res.status === 403) {
        forceReauth(`http_state_latest_${res.status}`);
        return;
      }
      if (res.ok) {
        snapshot = await res.json();
        applyTimerPresetSnapshot(snapshot);
        if (snapshot.sessionId) {
          setSessionId(idx, snapshot.sessionId);
        }
        if (typeof snapshot.boxVersion === 'number') {
          safeSetItem(`boxVersion-${idx}`, String(snapshot.boxVersion));
        }
        if (typeof snapshot.initiated === 'boolean') {
          setInitiated(!!snapshot.initiated);
        }
        if (typeof snapshot.holdsCount === 'number') {
          setMaxScore(snapshot.holdsCount || 0);
        }
        if (typeof snapshot.currentClimber === 'string') {
          setCurrentClimber(snapshot.currentClimber || '');
        }
        if (typeof snapshot.timerState === 'string') {
          setTimerState(snapshot.timerState);
        } else if (typeof snapshot.started === 'boolean') {
          setTimerState(snapshot.started ? 'running' : 'idle');
        }
        if (typeof snapshot.holdCount === 'number') {
          setHoldCount(snapshot.holdCount || 0);
        }
        if (typeof snapshot.remaining === 'number') {
          const next = Math.max(0, Math.ceil(snapshot.remaining));
          timerBaseRef.current = { atMs: Date.now(), remaining: next };
          setTimerSeconds(next);
          safeSetItem(`timer-${idx}`, next.toString());
        }
        if (typeof snapshot.registeredTime === 'number') {
          setRegisteredTime(snapshot.registeredTime);
          safeSetItem(`registeredTime-${idx}`, snapshot.registeredTime.toString());
        }
        if (typeof snapshot.timeCriterionEnabled === 'boolean') {
          setTimeCriterionEnabled(snapshot.timeCriterionEnabled);
          safeSetItem(`timeCriterionEnabled-${idx}`, snapshot.timeCriterionEnabled ? 'on' : 'off');
        }
      }
    } catch (err) {
      debugError('Failed to fetch latest state snapshot', err);
    }
    return snapshot;
  };

  // Best-effort remaining time (sec) used to compute `registeredTime` when needed.
  const resolveRemainingSeconds = async (): Promise<number | null> => {
    const snapshot: any = await pullLatestState();
    const fallback =
      typeof timerSeconds === 'number'
        ? timerSeconds
        : parseInt(safeGetItem(`timer-${idx}`) || '', 10);
    if (typeof snapshot.remaining === 'number') return snapshot.remaining;
    return Number.isNaN(fallback) ? null : fallback;
  };

  // Shared helper for START/STOP/RESUME actions.
  // Does an optimistic UI update and then verifies the backend accepted it (with a stale retry path).
  const runTimerCmd = async (
    nextState: TimerState,
    action: 'START_TIMER' | 'STOP_TIMER' | 'RESUME_TIMER',
  ): Promise<void> => {
    // Optimistic UI, but verify backend accepted (important for cross-device sync).
    setTimerState(nextState);
    if (action !== 'STOP_TIMER') {
      clearRegisteredTime();
    }
    if (action === 'START_TIMER') {
      const initial = totalDurationSec();
      timerBaseRef.current = { atMs: Date.now(), remaining: initial };
      setTimerSeconds(initial);
      safeSetItem(`timer-${idx}`, initial.toString());
    }
    if (action === 'RESUME_TIMER') {
      const initial =
        typeof timerSeconds === 'number' && Number.isFinite(timerSeconds)
          ? Math.max(0, timerSeconds)
          : totalDurationSec();
      timerBaseRef.current = { atMs: Date.now(), remaining: initial };
      setTimerSeconds(initial);
      safeSetItem(`timer-${idx}`, initial.toString());
    }

    try {
      // Ensure we have a fresh sessionId/version (Judge may open mid-contest).
      if (!getSessionId(idx)) {
        await pullLatestState();
      }

      const exec =
        action === 'START_TIMER' ? startTimer : action === 'STOP_TIMER' ? stopTimer : resumeTimer;

      const result: any = await exec(idx);
      if (result?.status === 'ignored') {
        await pullLatestState();
        const retry: any = await exec(idx);
        if (retry?.status === 'ignored') {
          await pullLatestState();
        }
      }
    } catch (err: any) {
      debugError(`[JudgePage] ${action} failed`, err);
      if (err?.status === 401 || err?.status === 403) {
        forceReauth(`${action.toLowerCase()}_${err.status}`);
        return;
      }
      // Re-sync UI state from backend if the command didn't apply.
      await pullLatestState();
    }
  };

  // Handler for Start/Stop/Resume Time
  const handleStartTime = async (): Promise<void> => {
    await runTimerCmd('running', 'START_TIMER');
  };

  const handleStopTime = async (): Promise<void> => {
    await runTimerCmd('paused', 'STOP_TIMER');
  };

  const handleResumeTime = async (): Promise<void> => {
    await runTimerCmd('running', 'RESUME_TIMER');
  };

  // Handler for +1 Hold
  const handleHoldClick = async () => {
    const max = Number(maxScore ?? 0);
    const current = Number(holdCount ?? 0);
    if (max > 0 && current >= max) {
      return;
    }
    if (progressPendingRef.current) return;
    progressPendingRef.current = true;
    setProgressPending(true);
    try {
      const result: any = await updateProgress(idx, 1);
      if (result?.status === 'ignored') {
        await pullLatestState();
        const retry: any = await updateProgress(idx, 1);
        if (retry?.status === 'ignored') {
          await pullLatestState();
        }
        return;
      }
      setUsedHalfHold(false); // success
    } catch (err) {
      debugError('PROGRESS_UPDATE failed', err);
      await pullLatestState();
    } finally {
      progressPendingRef.current = false;
      setProgressPending(false);
    }
  };

  // Handler for +0.1 Hold
  const handleHalfHoldClick = async () => {
    const max = Number(maxScore ?? 0);
    const current = Number(holdCount ?? 0);
    if (max > 0 && current >= max) {
      return;
    }
    if (progressPendingRef.current) return;
    progressPendingRef.current = true;
    setProgressPending(true);
    try {
      const result: any = await updateProgress(idx, 0.1);
      if (result?.status === 'ignored') {
        await pullLatestState();
        const retry: any = await updateProgress(idx, 0.1);
        if (retry?.status === 'ignored') {
          await pullLatestState();
        } else {
          setUsedHalfHold(true);
        }
        return;
      }
      setUsedHalfHold(true); // success
    } catch (err) {
      debugError('PROGRESS_UPDATE failed', err);
      await pullLatestState();
    } finally {
      progressPendingRef.current = false;
      setProgressPending(false);
    }
  };

  // Handler for Insert Score
  const handleInsertScore = () => {
    setScoreSubmitError(null);
    setShowScoreModal(true);
  };

  // -------------------- Derived values for rendering --------------------
  // Compute labels, progress %, and display-friendly timer values outside of JSX.
  const isRunning = timerState === 'running';
  const isPaused = timerState === 'paused';
  const hasRemainingCompetitor =
    // If we don't have a competitor list yet, don't block the UI; snapshots will fill it in.
    !Array.isArray(competitors) ? true : competitors.some((c) => !c?.marked);
  const totalSec = totalDurationSec();
  const shownTimerSec =
    isRunning || isPaused
      ? typeof timerSeconds === 'number' && Number.isFinite(timerSeconds)
        ? Math.max(0, timerSeconds)
        : totalSec
      : totalSec;
  const timerProgressPct =
    totalSec > 0 && Number.isFinite(totalSec)
      ? Math.max(0, Math.min(100, (shownTimerSec / totalSec) * 100))
      : 0;
  const holdCountLabel = Number.isInteger(holdCount) ? String(holdCount) : holdCount.toFixed(1);
  const maxScoreLabel = Number.isFinite(maxScore) && maxScore > 0 ? String(maxScore) : '—';
  const connectionLabel =
    wsStatus === 'open' ? 'Live' : wsStatus === 'connecting' ? 'Connecting' : 'Offline';
  const connectionPill =
    wsStatus === 'open'
      ? 'bg-emerald-500/15 border-emerald-300/40 text-emerald-200'
      : wsStatus === 'connecting'
        ? 'bg-cyan-500/15 border-cyan-300/40 text-cyan-200'
        : 'bg-rose-500/15 border-rose-300/40 text-rose-200';
  const connectionDot =
    wsStatus === 'open'
      ? 'bg-emerald-400'
      : wsStatus === 'connecting'
        ? 'bg-cyan-400 animate-pulse'
        : 'bg-rose-400';

  // Prefer category passed via URL (QR param `cat`), otherwise fall back to listboxes from localStorage.
  // Last resort: display `Box {id}`.
  const defaultJudgeUsername = useMemo(() => {
    const readCatFromUrl = () => {
      let cat: string | null = null;
      const fromSearch = new URLSearchParams(window.location.search).get('cat');
      if (fromSearch) cat = fromSearch;
      else if (window.location.hash && window.location.hash.includes('?')) {
        const [, qs] = window.location.hash.split('?');
        cat = new URLSearchParams(qs).get('cat');
      }
      return cat && cat.trim() ? cat.trim() : null;
    };

    const catFromUrl = readCatFromUrl();
    if (catFromUrl) return catFromUrl;

    try {
      const raw = safeGetItem('listboxes');
      if (raw) {
        const arr = JSON.parse(raw);
        const cat = arr?.[idx]?.categorie;
        if (typeof cat === 'string' && cat.trim()) {
          return cat.trim();
        }
      }
    } catch (err) {
      debugError('Failed to read listboxes for default judge username', err);
    }
    return `Box ${idx}`;
  }, [idx]);

  // Debounce banner: show only if non-open state persists > 1s
  useEffect(() => {
    if (wsStatus === 'open') {
      setShowWsBanner(false);
      return;
    }
    const t = setTimeout(() => {
      setShowWsBanner(true);
    }, 1000);
    return () => clearTimeout(t);
  }, [wsStatus]);

  return (
    <>
      {/* Auth overlay when the judge is not logged in (or token expired). */}
      {showLogin && (
        <TypedLoginOverlay
          defaultUsername={defaultJudgeUsername}
          title="Judge login"
          onSuccess={() => {
            setAuthActive(true);
            setShowLogin(false);
            pullLatestState();
          }}
        />
      )}
      {/* Initial skeleton while we fetch the first snapshot and/or establish WebSocket sync. */}
      {isInitialLoading ? (
        <JudgePageSkeleton />
      ) : (
        <div className="min-h-screen bg-gradient-to-br from-[#05060a] via-[#0b1220] to-[#0f172a] text-slate-100">
		          <div className="max-w-2xl mx-auto p-4 sm:p-6 min-h-[100dvh] flex flex-col gap-4">
              {/* Header: app label + category name + connection state. */}
	            <header className="flex items-start justify-between gap-4">
	              <div className="space-y-1">
	                <p className="text-xs uppercase tracking-[0.28em] text-cyan-200/70">Judge Remote</p>
	                <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight">
	                  {defaultJudgeUsername}
	                </h1>

	              </div>
              <div
                className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs uppercase tracking-[0.24em] ${connectionPill}`}
              >
                <span className={`h-2 w-2 rounded-full ${connectionDot}`} />
                <span>{connectionLabel}</span>
	              </div>
	            </header>

              {/* Connection banner (debounced) to avoid flicker on quick reconnects. */}
	            {showWsBanner && wsStatus !== 'open' && (
	              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-100">
	                <div className="font-semibold">Connection issue</div>
	                <div className="mt-1 text-rose-100/80">
	                  WS: {wsStatus}.{' '}
                  {wsError
                    ? wsError
                    : 'Check same Wi‑Fi, Vite dev server host (0.0.0.0), and that port 8000 is reachable.'}
                </div>
	              </div>
	            )}

              {/* Athlete card: current climber name only (kept compact for small screens). */}
			            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-3">
			              <p className="text-xs uppercase tracking-[0.24em] text-cyan-200/70">Athlete</p>
			              <div className="mt-2 text-xl sm:text-2xl font-black text-white leading-tight break-words">
			                {currentClimber ? currentClimber : 'Waiting for athlete'}
			              </div>
			            </div>

              {/* Main controls: timer actions, progress (holds), and score submission. */}
		            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-4 flex flex-col gap-3">
                {/* Timer controls (Start/Stop/Resume). */}
	              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {!isRunning && !isPaused && (
	                  <button
	                    className="modern-btn modern-btn-primary btn-press-effect w-full"
                    onClick={handleStartTime}
                    disabled={!initiated || !hasRemainingCompetitor}
                  >
                    Start Time
                  </button>
                )}
                {isRunning && (
                  <button
                    className="modern-btn modern-btn-danger btn-press-effect w-full"
                    onClick={handleStopTime}
                    disabled={!initiated}
                  >
                    Stop Time
                  </button>
                )}
                {isPaused && (
                  <button
                    className="modern-btn modern-btn-primary btn-press-effect w-full"
                    onClick={handleResumeTime}
                    disabled={!initiated}
                  >
                    Resume Time
	                  </button>
	                )}
	              </div>

                {/* Progress controls: +1 Hold (wide) and +0.1 Hold (narrow) on the same row. */}
		              <div className="flex gap-3">
		                <button
		                  className="modern-btn modern-btn-primary btn-press-effect"
	                  style={{
	                    flex: '3 1 0',
	                    minWidth: 0,
	                    padding: '28px 16px',
	                    minHeight: '160px',
	                  }}
	                  onClick={handleHoldClick}
	                  disabled={
	                    !initiated ||
	                    !isRunning ||
	                    progressPending ||
                    (Number(maxScore ?? 0) > 0 && Number(holdCount ?? 0) >= Number(maxScore ?? 0))
                  }
                  title={
                    Number(maxScore ?? 0) > 0 && Number(holdCount ?? 0) >= Number(maxScore ?? 0)
                      ? 'Top reached! Climber cannot climb over the top :)'
                      : 'Add 1 hold'
                  }
                >
                  <div className="flex flex-col items-center">
                    <span className="text-xs font-semibold text-[#0b1220]">
                      {progressPending ? 'Sending…' : currentClimber || ''}
                    </span>
                    <span className="text-2xl font-black text-[#eeeff2]">+1 Hold</span>
                    <span className="text-xs font-semibold text-[#0b1220]">
                      {holdCountLabel} → {maxScoreLabel}
                    </span>
                  </div>
	                </button>

	                <button
	                  className="modern-btn btn-press-effect"
	                  style={{
	                    flex: '1 1 0',
	                    minWidth: 0,
	                    padding: '28px 12px',
	                    minHeight: '160px',
	                  }}
	                  onClick={handleHalfHoldClick}
	                  disabled={
	                    !initiated ||
	                    !isRunning ||
                    progressPending ||
                    usedHalfHold ||
                    (Number(maxScore ?? 0) > 0 && Number(holdCount ?? 0) >= Number(maxScore ?? 0))
                  }
                  title={
                    Number(maxScore ?? 0) > 0 && Number(holdCount ?? 0) >= Number(maxScore ?? 0)
                      ? 'Top reached! Climber cannot climb over the top :)'
                      : 'Add 0.1 hold'
                  }
                >
                  <div className="flex flex-col items-center">
                    <span className="text-xs font-semibold text-white/70">
                      {usedHalfHold ? 'Used' : ' '}
                    </span>
                    <span className="text-2xl font-black">+0.1</span>
                    <span className="text-xs text-white/60">Hold</span>
                  </div>
		                </button>
		              </div>

                {/* Opens the score modal for the current climber. */}
		              <button
		                className="modern-btn modern-btn-warning btn-press-effect w-full"
		                onClick={handleInsertScore}
		                disabled={!initiated || !hasRemainingCompetitor || (!isRunning && !isPaused)}
		              >
		                Insert Score
		              </button>
		            </div>

                {/* Timer card: visually smaller and placed last so it sits at the bottom of the screen. */}
		            <div className="mt-auto rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-3">
		              <div className="flex items-start justify-between gap-3">
		                <p className="text-xs uppercase tracking-[0.24em] text-cyan-200/70">Timer</p>
	                <span
	                  className={`px-2 py-1 rounded-full border text-[10px] uppercase tracking-[0.24em] ${
	                    isRunning
	                      ? 'bg-emerald-500/15 border-emerald-300/30 text-emerald-200'
	                      : isPaused
	                        ? 'bg-amber-500/15 border-amber-300/30 text-amber-200'
	                        : 'bg-white/5 border-white/10 text-white/60'
	                  }`}
	                >
	                  {isRunning ? 'Running' : isPaused ? 'Paused' : 'Idle'}
	                </span>
	              </div>

	              <div className="mt-2 font-mono text-3xl sm:text-4xl font-bold tabular-nums tracking-wider text-white">
	                {formatTime(shownTimerSec)}
	              </div>

	              <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
	                <div
	                  className={`h-full ${isRunning ? 'bg-cyan-400' : isPaused ? 'bg-amber-400' : 'bg-slate-600'}`}
	                  style={{ width: `${timerProgressPct}%` }}
	                />
	              </div>

	              {timeCriterionEnabled && (
	                <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 text-emerald-200 text-[10px] uppercase tracking-[0.24em]">
	                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
	                  <span>Time tiebreak enabled</span>
	                </div>
		              )}
		            </div>

              {/* Score modal: submits SUBMIT_SCORE with optional registeredTime for time tiebreaks. */}
            <ModalScore
              isOpen={showScoreModal}
              competitor={currentClimber}
              initialScore={holdCount}
              maxScore={maxScore}
              registeredTime={
                timeCriterionEnabled && typeof registeredTime === 'number' ? registeredTime : undefined
              }
              submitPending={scoreSubmitPending}
              submitError={scoreSubmitError}
              closeOnSubmit={false}
              onClose={() => {
                setScoreSubmitError(null);
                setShowScoreModal(false);
              }}
              onSubmit={async (score: number) => {
                setScoreSubmitPending(true);
                setScoreSubmitError(null);

                // Build the registeredTime payload when time tiebreak is enabled.
                // Priority: in-memory state -> localStorage -> compute from remaining seconds.
                let timeToSend: number | null = null;
                if (timeCriterionEnabled) {
                  if (typeof registeredTime === 'number') {
                    timeToSend = registeredTime;
                  } else {
                    const raw = safeGetItem(`registeredTime-${idx}`);
                    const parsed = parseInt(raw, 10);
                    if (!Number.isNaN(parsed)) {
                      timeToSend = parsed;
                    } else {
                      const current = await resolveRemainingSeconds();
                      if (current != null && !Number.isNaN(current)) {
                        const elapsed = Math.max(0, totalDurationSec() - current);
                        timeToSend = elapsed;
                        try {
                          safeSetItem(`registeredTime-${idx}`, elapsed.toString());
                        } catch (err) {
                          debugError('Failed to persist computed registered time', err);
                        }
                        setRegisteredTime(elapsed);
                      }
                    }
                  }
                }
                try {
                  // Submit score; if backend ignores due to stale session/version, resync and retry once.
                  const result: any = await submitScore(
                    idx,
                    score,
                    currentClimber,
                    typeof timeToSend === 'number' ? timeToSend : undefined,
                  );
                  if (result?.status === 'ignored') {
                    await pullLatestState();
                    const retry: any = await submitScore(
                      idx,
                      score,
                      currentClimber,
                      typeof timeToSend === 'number' ? timeToSend : undefined,
                    );
                    if (retry?.status === 'ignored') {
                      await pullLatestState();
                      setScoreSubmitError('Score ignored. Refresh state and try again.');
                      return false;
                    }
                  }
                  // Success: clear local time, close modal, and update local listboxes for UI parity.
                  clearRegisteredTime();
                  setShowScoreModal(false);
                  // Minimal local typing for listboxes JSON (not the same as the TS `Box` interface).
                  interface Competitor {
                    nume: string;
                    marked?: boolean;
                  }
                  interface Box {
                    concurenti?: Competitor[];
                  }
                  const boxes: Box[] = JSON.parse(safeGetItem('listboxes') || '[]');
                  const box = boxes?.[idx];
                  if (box?.concurenti) {
                    const competitorIdx = box.concurenti.findIndex((c) => c.nume === currentClimber);
                    if (competitorIdx !== -1) {
                      box.concurenti[competitorIdx].marked = true;
                      safeSetItem('listboxes', JSON.stringify(boxes));
                    }
                  }
                  return true;
                } catch (err: any) {
                  // Auth failures should force the login overlay; other errors are user-retryable.
                  if (err?.status === 401 || err?.status === 403) {
                    forceReauth(`submit_score_${err?.status}`);
                  }
                  setScoreSubmitError('Failed to submit score. Check connection and retry.');
                  return false;
                } finally {
                  setScoreSubmitPending(false);
                }
              }}
            />
          </div>
        </div>
      )}
    </>
  );
};

debugLog('🟡 [JudgePage] File loaded, export:', typeof JudgePage);
export default JudgePage;
