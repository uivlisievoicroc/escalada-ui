import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  startTimer,
  stopTimer,
  resumeTimer,
  updateProgress,
  submitScore,
  registerTime,
  getSessionId,
  setSessionId,
} from '../utilis/contestActions';
import {
  getAuthHeader,
  getStoredToken,
  clearAuth,
  getStoredRole,
  getStoredBoxes,
} from '../utilis/auth';
import { magicLogin } from '../utilis/auth';
import useWebSocketWithHeartbeat from '../utilis/useWebSocketWithHeartbeat';
import { debugLog, debugError } from '../utilis/debug';
import { safeSetItem, safeGetItem, safeRemoveItem, storageKey } from '../utilis/storage';
import ModalScore from './ModalScore';
import ModalModifyScore from './ModalModifyScore';
import LoginOverlay from './LoginOverlay';

const JudgePage = () => {
  debugLog('🟡 [JudgePage] Component rendering START');

  const API_PROTOCOL = window.location.protocol === 'https:' ? 'https' : 'http';
  const API_BASE = `${API_PROTOCOL}://${window.location.hostname}:8000`;
  const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss' : 'ws';

  const { boxId } = useParams();
  const idx = Number(boxId);
  debugLog('🟡 [JudgePage] boxId from params:', boxId, 'idx:', idx);
  debugLog('🟡 [JudgePage] API_BASE:', API_BASE);
  debugLog('🟡 [JudgePage] WS_PROTOCOL:', WS_PROTOCOL);
  const [initiated, setInitiated] = useState(false);
  const [timerState, setTimerState] = useState('idle');
  const [usedHalfHold, setUsedHalfHold] = useState(false);
  const [currentClimber, setCurrentClimber] = useState('');
  const [holdCount, setHoldCount] = useState(0);
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [maxScore, setMaxScore] = useState(0);
  const [authToken, setAuthToken] = useState(() => getStoredToken());
  const [showLogin, setShowLogin] = useState(() => !getStoredToken());
  const [magicTried, setMagicTried] = useState(false);
  const [registeredTime, setRegisteredTime] = useState(() => {
    const raw = safeGetItem(`registeredTime-${idx}`);
    const parsed = parseInt(raw, 10);
    return Number.isNaN(parsed) ? null : parsed;
  });
  const [timeCriterionEnabled, setTimeCriterionEnabled] = useState(
    () => safeGetItem('timeCriterionEnabled') === 'on',
  );
  const [timerSeconds, setTimerSeconds] = useState(() => {
    const raw = safeGetItem(`timer-${idx}`);
    const parsed = parseInt(raw, 10);
    return Number.isNaN(parsed) ? null : parsed;
  });
  const [serverTimerPresetSec, setServerTimerPresetSec] = useState(null);

  // Ref to track snapshot fallback timeout
  const snapshotTimeoutRef = useRef(null);

  const getTimerPreset = () => {
    const specific = safeGetItem(`climbingTime-${idx}`);
    const global = safeGetItem('climbingTime');
    return specific || global || '05:00';
  };
  const presetToSec = (preset) => {
    const [m, s] = (preset || '').split(':').map(Number);
    return (m || 0) * 60 + (s || 0);
  };
  const totalDurationSec = () => {
    if (typeof serverTimerPresetSec === 'number' && !Number.isNaN(serverTimerPresetSec)) {
      return serverTimerPresetSec;
    }
    return presetToSec(getTimerPreset());
  };

  const applyTimerPresetSnapshot = useCallback((snapshot) => {
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

  // WebSocket subscription to backend for real-time updates
  const [wsStatus, setWsStatus] = useState('connecting');
  const [showWsBanner, setShowWsBanner] = useState(true);

  const clearRegisteredTime = useCallback(() => {
    setRegisteredTime(null);
    try {
      safeRemoveItem(`registeredTime-${idx}`);
    } catch (err) {
      debugError('Failed clearing registered time', err);
    }
  }, [idx]);

  // Build WebSocket URL - memoized to prevent infinite render loop
  const WS_URL = useMemo(() => {
    const token = getStoredToken();
    const url = `${WS_PROTOCOL}://${window.location.hostname}:8000/api/ws/${idx}${
      token ? `?token=${encodeURIComponent(token)}` : ''
    }`;
    debugLog('🟡 [JudgePage] WS_URL memoized:', url);
    return url;
  }, [idx, WS_PROTOCOL, authToken]);

  // Message handler for all incoming WS messages
  const handleWsMessage = useCallback(
    (msg) => {
      debugLog('🟢 [JudgePage] Handler called with:', msg);

      if (msg.type === 'TIME_CRITERION') {
        setTimeCriterionEnabled(!!msg.timeCriterionEnabled);
        safeSetItem('timeCriterionEnabled', msg.timeCriterionEnabled ? 'on' : 'off');
        return;
      }
      if (msg.type === 'TIMER_SYNC') {
        if (+msg.boxId !== idx) return;
        if (typeof msg.remaining === 'number') {
          setTimerSeconds(msg.remaining);
          safeSetItem(`timer-${idx}`, msg.remaining.toString());
        }
        return;
      }
      if (+msg.boxId !== idx) return;

      if (msg.type === 'INIT_ROUTE') {
        debugLog('🟢 [JudgePage] Applying INIT_ROUTE:', msg);
        setInitiated(true);
        setMaxScore(msg.holdsCount || 0);
        setCurrentClimber(
          Array.isArray(msg.competitors) && msg.competitors.length ? msg.competitors[0].nume : '',
        );
        setTimerState('idle');
        setUsedHalfHold(false);
        setHoldCount(0);
        applyTimerPresetSnapshot(msg);
      }
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
      if (msg.type === 'SUBMIT_SCORE') {
        debugLog('🟢 [JudgePage] Applying SUBMIT_SCORE');
        setTimerState('idle');
        setUsedHalfHold(false);
        setHoldCount(0);
        clearRegisteredTime();
      }
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
        if (msg.sessionId) setSessionId(idx, msg.sessionId);
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
          setTimerSeconds(msg.remaining);
          safeSetItem(`timer-${idx}`, msg.remaining.toString());
        }
        if (typeof msg.timeCriterionEnabled === 'boolean') {
          setTimeCriterionEnabled(msg.timeCriterionEnabled);
          safeSetItem('timeCriterionEnabled', msg.timeCriterionEnabled ? 'on' : 'off');
        }
      }
      if (msg.type === 'ACTIVE_CLIMBER') {
        debugLog('🟢 [JudgePage] Applying ACTIVE_CLIMBER:', msg.competitor);
        setCurrentClimber(msg.competitor || '');
      }
    },
    [idx, applyTimerPresetSnapshot, clearRegisteredTime],
  );

  // Initialize WebSocket hook at top level with memoized URL
  debugLog('🟡 [JudgePage] About to call useWebSocketWithHeartbeat with wsUrl:', WS_URL);
  const { ws, connected, wsError } = useWebSocketWithHeartbeat(WS_URL, (m) => {
    debugLog('🟢 [JudgePage] WS message received:', m.type);
    handleWsMessage(m);
  });
  debugLog('🟡 [JudgePage] Hook returned, connected:', connected, 'ws:', ws ? 'exists' : 'null');
  // Track WS open/close to update banner and trigger resync
  useEffect(() => {
    if (!ws) return;
    const handleOpen = () => {
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

        fetch(`${API_BASE}/api/state/${idx}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((st) => {
            if (!st) return;
            debugLog('📗 [JudgePage] Applied fallback HTTP state:', st);
            if (st.sessionId) setSessionId(idx, st.sessionId);
            setInitiated(!!st.initiated);
            setMaxScore(st.holdsCount || 0);
            setCurrentClimber(st.currentClimber || '');
            setTimerState(st.timerState || (st.started ? 'running' : 'idle'));
            setHoldCount(st.holdCount || 0);
            applyTimerPresetSnapshot(st);
            if (typeof st.registeredTime === 'number') setRegisteredTime(st.registeredTime);
            if (typeof st.remaining === 'number') setTimerSeconds(st.remaining);
            if (typeof st.timeCriterionEnabled === 'boolean')
              setTimeCriterionEnabled(st.timeCriterionEnabled);
          })
          .catch((err) => debugError('📗 [JudgePage] Failed to fetch fallback state:', err));
      }, 2000);
    };
    const handleClose = () => setWsStatus('closed');

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
    ws.addEventListener('error', handleClose);
    return () => {
      ws.removeEventListener('open', handleOpen);
      ws.removeEventListener('close', handleClose);
      ws.removeEventListener('error', handleClose);
    };
  }, [ws, API_BASE, idx, applyTimerPresetSnapshot]);

  const formatTime = (sec) => {
    if (typeof sec !== 'number' || Number.isNaN(sec)) return '—';
    const m = Math.floor(sec / 60)
      .toString()
      .padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // ==================== FIX 2: WATCH BOXVERSION CHANGES ====================
  // If reset happens (boxVersion changes) in ControlPanel, refresh Judge state
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (
        (e.key === storageKey(`boxVersion-${idx}`) || e.key === `boxVersion-${idx}`) &&
        e.newValue !== e.oldValue
      ) {
        debugLog(
          `📦 boxVersion-${idx} changed from ${e.oldValue} to ${e.newValue}, refreshing Judge state...`,
        );
        // Re-fetch state from server to sync with new version
        (async () => {
          if (!authToken) return;
          try {
            const res = await fetch(`${API_BASE}/api/state/${idx}`, {
              headers: { ...getAuthHeader() },
            });
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
  }, [idx, API_BASE, authToken]);

  // Fetch initial state snapshot on mount
  // Forțează reset dacă linkul are reset=1 (util când vrei obligatoriu login proaspăt)
  useEffect(() => {
    const paramsSearch = new URLSearchParams(window.location.search);
    let resetFlag = paramsSearch.get('reset');
    if (!resetFlag && window.location.hash && window.location.hash.includes('?')) {
      const [, qs] = window.location.hash.split('?');
      resetFlag = new URLSearchParams(qs).get('reset');
    }
    if (resetFlag === '1') {
      clearAuth();
      setAuthToken(null);
      setShowLogin(true);
    }
  }, []);

  useEffect(() => {
    const role = getStoredRole();
    const boxes = getStoredBoxes();
    if (role !== 'judge' || !boxes.includes(idx)) {
      clearAuth();
      setAuthToken(null);
      setShowLogin(true);
    }
  }, [idx]);

  // Fetch initial state snapshot on mount
  useEffect(() => {
    if (!authToken) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/state/${idx}`, {
          headers: { ...getAuthHeader() },
        });
        if (res.ok) {
          const st = await res.json();
          if (st.sessionId) setSessionId(idx, st.sessionId);
          setInitiated(st.initiated);
          setMaxScore(st.holdsCount);
          setCurrentClimber(st.currentClimber);
          setTimerState(st.timerState || (st.started ? 'running' : 'idle'));
          setHoldCount(st.holdCount);
          applyTimerPresetSnapshot(st);
          if (typeof st.registeredTime === 'number') setRegisteredTime(st.registeredTime);
          if (typeof st.remaining === 'number') setTimerSeconds(st.remaining);
          if (typeof st.timeCriterionEnabled === 'boolean')
            setTimeCriterionEnabled(st.timeCriterionEnabled);
        }
      } catch (e) {
        debugError('Error fetching initial state:', e);
      }
    })();
  }, [idx, API_BASE, applyTimerPresetSnapshot, authToken]);

  // Magic login via token in query string (QR)
  useEffect(() => {
    if (authToken || magicTried) return;
    // În HashRouter, query-ul stă de obicei după '#'
    let token = null;
    const fromSearch = new URLSearchParams(window.location.search).get('token');
    if (fromSearch) {
      token = fromSearch;
    } else if (window.location.hash && window.location.hash.includes('?')) {
      const [, qs] = window.location.hash.split('?');
      token = new URLSearchParams(qs).get('token');
    }
    if (!token) return;
    (async () => {
      try {
        await magicLogin(token);
        setAuthToken(getStoredToken());
        setShowLogin(false);
        await pullLatestState();
      } catch (err) {
        debugError('Magic login failed', err);
        setShowLogin(true);
      } finally {
        setMagicTried(true);
      }
    })();
  }, [authToken, magicTried]);

  useEffect(() => {
    const syncFromStorage = () => {
      const rawTimer = safeGetItem(`timer-${idx}`);
      const parsedTimer = parseInt(rawTimer, 10);
      setTimerSeconds(Number.isNaN(parsedTimer) ? null : parsedTimer);
      const rawReg = safeGetItem(`registeredTime-${idx}`);
      const parsedReg = parseInt(rawReg, 10);
      setRegisteredTime(Number.isNaN(parsedReg) ? null : parsedReg);
      setTimeCriterionEnabled(safeGetItem('timeCriterionEnabled') === 'on');
    };
    syncFromStorage();
    const onStorage = (e) => {
      if (e.key === storageKey(`timer-${idx}`) || e.key === `timer-${idx}`) {
        const parsed = parseInt(e.newValue, 10);
        setTimerSeconds(Number.isNaN(parsed) ? null : parsed);
      }
      if (e.key === storageKey(`registeredTime-${idx}`) || e.key === `registeredTime-${idx}`) {
        const parsed = parseInt(e.newValue, 10);
        setRegisteredTime(Number.isNaN(parsed) ? null : parsed);
      }
      if (e.key === storageKey('timeCriterionEnabled') || e.key === 'timeCriterionEnabled') {
        setTimeCriterionEnabled(e.newValue === 'on');
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [idx]);

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

  const pullLatestState = async () => {
    if (!authToken) return;
    let snapshot = {};
    try {
      const res = await fetch(`${API_BASE}/api/state/${idx}`, {
        headers: { ...getAuthHeader() },
      });
      if (res.ok) {
        snapshot = await res.json();
        applyTimerPresetSnapshot(snapshot);
        if (typeof snapshot.remaining === 'number') {
          setTimerSeconds(snapshot.remaining);
          safeSetItem(`timer-${idx}`, snapshot.remaining.toString());
        }
        if (typeof snapshot.registeredTime === 'number') {
          setRegisteredTime(snapshot.registeredTime);
          safeSetItem(`registeredTime-${idx}`, snapshot.registeredTime.toString());
        }
        if (typeof snapshot.timeCriterionEnabled === 'boolean') {
          setTimeCriterionEnabled(snapshot.timeCriterionEnabled);
          safeSetItem('timeCriterionEnabled', snapshot.timeCriterionEnabled ? 'on' : 'off');
        }
      }
    } catch (err) {
      debugError('Failed to fetch latest state snapshot', err);
    }
    return snapshot;
  };

  const resolveRemainingSeconds = async () => {
    const snapshot = await pullLatestState();
    const fallback =
      typeof timerSeconds === 'number'
        ? timerSeconds
        : parseInt(safeGetItem(`timer-${idx}`) || '', 10);
    if (typeof snapshot.remaining === 'number') return snapshot.remaining;
    return Number.isNaN(fallback) ? null : fallback;
  };

  // Handler for Start Time
  const handleStartTime = () => {
    startTimer(idx);
    setTimerState('running');
    clearRegisteredTime();
  };

  const handleStopTime = () => {
    stopTimer(idx);
    setTimerState('paused');
  };

  const handleResumeTime = () => {
    resumeTimer(idx);
    setTimerState('running');
    clearRegisteredTime();
  };

  // Handler for +1 Hold
  const handleHoldClick = () => {
    const max = Number(maxScore ?? 0);
    const current = Number(holdCount ?? 0);
    if (max > 0 && current >= max) {
      return;
    }
    updateProgress(idx, 1);
    setUsedHalfHold(false);
  };

  // Handler for +0.1 Hold
  const handleHalfHoldClick = () => {
    const max = Number(maxScore ?? 0);
    const current = Number(holdCount ?? 0);
    if (max > 0 && current >= max) {
      return;
    }
    updateProgress(idx, 0.1);
    setUsedHalfHold(true);
  };

  const handleRegisterTime = async () => {
    if (!timeCriterionEnabled || !isPaused) return;
    const current = await resolveRemainingSeconds();
    if (current == null || Number.isNaN(current)) {
      alert('Nu există un timp de înregistrat pentru acest box.');
      return;
    }
    const elapsed = Math.max(0, totalDurationSec() - current);
    setRegisteredTime(elapsed);
    try {
      safeSetItem(`registeredTime-${idx}`, elapsed.toString());
    } catch (err) {
      debugError('Failed storing registered time', err);
    }
    registerTime(idx, elapsed);
  };

  // Handler for Insert Score
  const handleInsertScore = () => {
    setShowScoreModal(true);
  };

  const isRunning = timerState === 'running';
  const isPaused = timerState === 'paused';

  // Prefer categoria transmisă în URL (din QR); fallback la listbox din localStorage; altfel Box {id}
  const defaultJudgeUsername = useMemo(() => {
    // 1) din query param cat (suportă și hash cu query)
    const readCatFromUrl = () => {
      let cat = null;
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
      {showLogin && (
        <LoginOverlay
          defaultUsername={defaultJudgeUsername}
          onSuccess={() => {
            setAuthToken(getStoredToken());
            setShowLogin(false);
            pullLatestState();
          }}
        />
      )}
      <div className="p-20 flex flex-col gap-2">
        {showWsBanner && wsStatus !== 'open' && (
          <div className="mb-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
            WS: {wsStatus}.{' '}
            {wsError ? `(${wsError})` : 'Check host IP and that port 8000 is reachable.'}
          </div>
        )}
        {!isRunning && !isPaused && (
          <button
            className="px-3 py-1 bg-blue-600 text-white rounded disabled:opacity-50"
            onClick={handleStartTime}
            disabled={!initiated}
          >
            Start Time
          </button>
        )}
        {isRunning && (
          <button
            className="px-3 py-1 bg-red-600 text-white rounded disabled:opacity-50"
            onClick={handleStopTime}
            disabled={!initiated}
          >
            Stop Time
          </button>
        )}
        {isPaused && (
          <div className="flex gap-2">
            <button
              className="px-3 py-1 bg-blue-600 text-white rounded disabled:opacity-50"
              onClick={handleResumeTime}
              disabled={!initiated}
            >
              Resume Time
            </button>
            <button
              className="px-3 py-1 bg-gray-500 text-white rounded disabled:opacity-50"
              onClick={handleRegisterTime}
              disabled={!initiated || !timeCriterionEnabled}
            >
              Register Time
            </button>
          </div>
        )}
        {isPaused && timeCriterionEnabled && registeredTime !== null && (
          <div className="text-xs text-gray-700">Registered: {formatTime(registeredTime)}</div>
        )}
        <div className="flex gap-2">
          <button
            className="mt-10 px-12 py-12 bg-purple-600 text-white rounded hover:bg-purple-700 active:scale-95 transition flex flex-col items-center disabled:opacity-50"
            onClick={handleHoldClick}
            disabled={
              !initiated ||
              !isRunning ||
              (Number(maxScore ?? 0) > 0 && Number(holdCount ?? 0) >= Number(maxScore ?? 0))
            }
            title={
              Number(maxScore ?? 0) > 0 && Number(holdCount ?? 0) >= Number(maxScore ?? 0)
                ? 'Top reached! Climber cannot climb over the top :)'
                : 'Add 1 hold'
            }
          >
            <div className="flex flex-col items-center">
              <span className="text-xs font-medium">{currentClimber || ''}</span>
              <span>+1 Hold</span>
              <span className="text-sm">
                Score {holdCount} → {maxScore}
              </span>
            </div>
          </button>
          <button
            className="mt-10 px-4 py-5 bg-purple-600 text-white rounded hover:bg-purple-700 active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleHalfHoldClick}
            disabled={
              !initiated ||
              !isRunning ||
              usedHalfHold ||
              (Number(maxScore ?? 0) > 0 && Number(holdCount ?? 0) >= Number(maxScore ?? 0))
            }
            title={
              Number(maxScore ?? 0) > 0 && Number(holdCount ?? 0) >= Number(maxScore ?? 0)
                ? 'Top reached! Climber cannot climb over the top :)'
                : 'Add 0.1 hold'
            }
          >
            + .1
          </button>
        </div>
        <button
          className="mt-10 px-3 py-1 bg-yellow-500 text-white rounded"
          onClick={handleInsertScore}
          disabled={!initiated || (!isRunning && !isPaused)}
        >
          Insert Score
        </button>
        <ModalScore
          isOpen={showScoreModal}
          competitor={currentClimber}
          initialScore={holdCount}
          maxScore={maxScore}
          registeredTime={timeCriterionEnabled ? registeredTime : undefined}
          onClose={() => setShowScoreModal(false)}
          onSubmit={async (score) => {
            let timeToSend;
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
            await submitScore(idx, score, currentClimber, timeToSend);
            clearRegisteredTime();
            setShowScoreModal(false);
            const boxes = JSON.parse(safeGetItem('listboxes') || '[]');
            const box = boxes?.[idx];
            if (box?.concurenti) {
              const competitorIdx = box.concurenti.findIndex((c) => c.nume === currentClimber);
              if (competitorIdx !== -1) {
                box.concurenti[competitorIdx].marked = true;
                safeSetItem('listboxes', JSON.stringify(boxes));
              }
            }
          }}
        />
      </div>
    </>
  );
};

debugLog('🟡 [JudgePage] File loaded, export:', typeof JudgePage);
export default JudgePage;
