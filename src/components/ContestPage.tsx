import React, { useEffect, useState, useRef, useCallback, FC } from 'react';
import { ResizableBox } from 'react-resizable';
import 'react-resizable/css/styles.css';
import { useParams } from 'react-router-dom';
import { debugLog, debugError } from '../utilis/debug';
import type { Box, Competitor, RankingRow, WebSocketMessage } from '../types';
import { safeSetItem, safeGetItem, safeRemoveItem } from '../utilis/storage';
import { sanitizeBoxName, sanitizeCompetitorName } from '../utilis/sanitize';
import { getStoredToken } from '../utilis/auth';
import type { Box, Competitor, RankingRow, WebSocketMessage } from '../types';
// (WebSocket logic moved into component)

const API_PROTOCOL = window.location.protocol === 'https:' ? 'https' : 'http';
const API_CMD = `${API_PROTOCOL}://${window.location.hostname}:8000/api/cmd`;
const API_BASE = `${API_PROTOCOL}://${window.location.hostname}:8000/api`;
const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss' : 'ws';

// Internal type definitions
interface RouteProgressProps {
  holds: number;
  current?: number;
  h?: number;
  w?: number;
  tilt?: number;
}

interface ScoresByName {
  [name: string]: number[];
}

interface TimesByName {
  [name: string]: (number | undefined)[];
}

interface RankInfo {
  nume: string;
  score: number;
  time?: number;
}

interface TimerMessage {
  type: 'START_TIMER' | 'STOP_TIMER' | 'RESUME_TIMER';
  boxId: number | string;
}

interface ProgressUpdateMessage {
  type: 'PROGRESS_UPDATE';
  boxId: number | string;
  delta?: number;
}

interface SubmitScoreMessage {
  type: 'SUBMIT_SCORE';
  boxId: number | string;
  competitor: string;
  score: number;
  registeredTime?: number | string;
}

interface ClimberRequestMessage {
  type: 'REQUEST_ACTIVE_COMPETITOR';
  boxId: number | string;
}

interface ClimberResponseMessage {
  type: 'RESPONSE_ACTIVE_COMPETITOR';
  boxId: number | string;
  competitor: string;
  ts: number;
}

type WindowMessage =
  | TimerMessage
  | ProgressUpdateMessage
  | SubmitScoreMessage
  | ClimberRequestMessage
  | ClimberResponseMessage;

// RouteProgress: continuous 5 golden-ratio segments, alternating tilt
const RouteProgress: FC<RouteProgressProps> = ({
  holds,
  current = 0,
  h = 500,
  w = 20,
  tilt = 5,
}) => {
  const phi = (6 + Math.sqrt(12)) / 2;
  let rem = h;
  const rawSegs = Array.from({ length: 8 }, () => {
    const s = rem / phi;
    rem -= s;
    return s;
  });
  const sumRaw = rawSegs.reduce((sum, s) => sum + s, 0);
  const scaledSegs = rawSegs.map((s) => s * (h / sumRaw));
  const segs = scaledSegs.reverse();
  // build points along the path
  const points = [[0, h]];
  segs.forEach((seg, i) => {
    const angleRad = ((i % 2 === 0 ? tilt : -tilt) * Math.PI) / 180;
    const dx = seg * Math.sin(angleRad);
    const dy = -seg * Math.cos(angleRad);
    const [x, y] = points[points.length - 1];
    points.push([x + dx, y + dy]);
  });
  // compute dot position by length
  const totalLen = segs.reduce((a, b) => a + b, 0);
  const target = (holds > 1 ? current / (holds - 1) : 0) * totalLen;
  let accumulated = 0;
  let dotX = 0,
    dotY = 0;
  for (let i = 0; i < segs.length; i++) {
    if (accumulated + segs[i] >= target) {
      const frac = (target - accumulated) / segs[i];
      const [x1, y1] = points[i];
      const [x2, y2] = points[i + 1];
      dotX = x1 + (x2 - x1) * frac;
      dotY = y1 + (y2 - y1) * frac;
      break;
    }
    accumulated += segs[i];
  }
  const pathD = 'M ' + points.map((p) => p.join(',')).join(' L ');
  return (
    <svg width={w} height={h} className="block overflow-visible">
      <defs>
        <linearGradient id="progressGradient" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="orange" />
          <stop offset="100%" stopColor="black" />
        </linearGradient>
      </defs>
      <path
        d={pathD}
        fill="none"
        stroke="url(#progressGradient)"
        strokeWidth={w}
        strokeLinecap="round"
      />
      <circle cx={dotX} cy={dotY} r={w * 0.75} fill="yellow" stroke="white" strokeWidth={2} />
    </svg>
  );
};

// ===== helpers pentru clasament IFSC =====
/** Returnează { [nume]: [rankPoints…] } şi numărul total de concurenţi */
const calcRankPointsPerRoute = (
  scoresByName: ScoresByName,
  timesByName: TimesByName,
  routeIdx: number,
  useTimeTiebreak: boolean,
): { rankPoints: { [name: string]: (number | undefined)[] }; nCompetitors: number } => {
  const rankPoints: { [name: string]: (number | undefined)[] } = {};
  const nRoutes = routeIdx; // câte rute am până acum
  let nCompetitors = 0;

  const getTimeFor = (name: string, r: number): number | undefined =>
    timesByName && timesByName[name] && timesByName[name][r] !== undefined
      ? timesByName[name][r]
      : undefined;

  // pentru fiecare rută (0‑based)
  for (let r = 0; r < nRoutes; r++) {
    // colectează scorurile existente
    const list: RankInfo[] = Object.entries(scoresByName)
      .filter(([, arr]) => arr[r] !== undefined)
      .map(([nume, arr]) => ({
        nume,
        score: arr[r],
        time: getTimeFor(nume, r),
      }));

    // sortează descrescător
    list.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (!useTimeTiebreak) return 0;
      const ta = typeof a.time === 'number' ? a.time : Infinity;
      const tb = typeof b.time === 'number' ? b.time : Infinity;
      if (ta !== tb) return ta - tb; // timp mai mic = mai bun
      return 0;
    });

    // parcurge şi atribuie rank‑ul cu tie‑handling
    let pos = 1;
    for (let i = 0; i < list.length; ) {
      const current = list[i];
      let j = i;
      while (
        j < list.length &&
        list[j].score === current.score &&
        (!useTimeTiebreak ||
          (typeof list[j].time === 'number' ? list[j].time : Infinity) ===
            (typeof current.time === 'number' ? current.time : Infinity))
      ) {
        j++;
      }
      const tieCount = j - i;
      const first = pos;
      const last = pos + tieCount - 1;
      const avgRank = (first + last) / 2; // media aritmetică
      for (let k = i; k < j; k++) {
        const x = list[k];
        if (!rankPoints[x.nume]) rankPoints[x.nume] = Array(nRoutes).fill(undefined);
        rankPoints[x.nume][r] = avgRank;
      }
      pos += tieCount;
      i = j;
    }
    nCompetitors = Math.max(nCompetitors, list.length);
  }

  return { rankPoints, nCompetitors };
};

/** Calculează QP = media geometrică (rotunjit 3 zec.) */
const geomMean = (arr: (number | undefined)[], nRoutes: number, nCompetitors: number): number => {
  // lipsă => loc maxim (nCompetitors + 1)
  const filled = arr.map((v) => v ?? nCompetitors + 1);
  if (filled.length < nRoutes) {
    // padding pentru rute lipsă
    while (filled.length < nRoutes) filled.push(nCompetitors + 1);
  }
  const prod = filled.reduce((p, x) => p * x, 1);
  return Number(Math.pow(prod, 1 / nRoutes).toFixed(3));
};

const ContestPage: FC = () => {
  const { boxId } = useParams<{ boxId: string }>();
  const getTimerPreset = useCallback(() => {
    const specific = safeGetItem(`climbingTime-${boxId}`);
    const global = safeGetItem('climbingTime');
    return specific || global || '05:00';
  }, [boxId]);
  const [timeCriterionEnabled, setTimeCriterionEnabled] = useState<boolean>(
    () => safeGetItem('timeCriterionEnabled') === 'on',
  );

  // --- Broadcast channel pentru sincronizare timere ---
  const timerChannelRef = useRef<BroadcastChannel | null>(null);
  const lastTimerSyncRef = useRef<number | null>(null);
  useEffect(() => {
    if ('BroadcastChannel' in window) {
      const ch = new BroadcastChannel('escalada-timer');
      timerChannelRef.current = ch;
      return () => ch.close();
    }
  }, []);

  // --- WebSocket logic with reconnection and safe cleanup ---
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<{ tries: number; shouldReconnect: boolean }>({
    tries: 0,
    shouldReconnect: true,
  });
  useEffect(() => {
    reconnectRef.current.shouldReconnect = true;

    const token = getStoredToken();
    const url = `${WS_PROTOCOL}://${window.location.hostname}:8000/api/ws/${boxId}${
      token ? `?token=${encodeURIComponent(token)}` : ''
    }`;

    const handleMessage = (msg: WebSocketMessage) => {
      if (msg.type === 'INIT_ROUTE') {
        const { routeIndex, competitors, holdsCount } = msg;
        setRouteIdx(routeIndex);
        setHoldsCount(holdsCount);
        if (competitors?.length) {
          setClimbing(competitors[0].nume);
          setPreparing(competitors.slice(1, 2).map((c) => c.nume));
          setRemaining(competitors.slice(2).map((c) => c.nume));
        } else {
          setClimbing('');
          setPreparing([]);
          setRemaining([]);
        }
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        setRunning(false);
        setEndTimeMs(null);
        endTimeRef.current = null;
        const preset = getTimerPreset();
        const [m, s] = preset.split(':').map(Number);
        const resetVal = (m || 0) * 60 + (s || 0);
        setTimerSec(resetVal);
        timerSecRef.current = resetVal;
        return;
      }
      if (msg.type === 'START_TIMER') {
        window.postMessage({ type: 'START_TIMER', boxId: msg.boxId }, '*');
      }
      if (msg.type === 'STOP_TIMER') {
        window.postMessage({ type: 'STOP_TIMER', boxId: msg.boxId }, '*');
      }
      if (msg.type === 'RESUME_TIMER') {
        window.postMessage({ type: 'RESUME_TIMER', boxId: msg.boxId }, '*');
      }
      if (msg.type === 'PROGRESS_UPDATE') {
        window.postMessage({ type: 'PROGRESS_UPDATE', boxId: msg.boxId, delta: msg.delta }, '*');
      }
      if (msg.type === 'REQUEST_ACTIVE_COMPETITOR') {
        safeSetItem(
          'climb_response',
          JSON.stringify({
            type: 'RESPONSE_ACTIVE_COMPETITOR',
            boxId: msg.boxId,
            competitor: climbingRef.current,
            ts: Date.now(),
          }),
        );
      }
      if (msg.type === 'SUBMIT_SCORE') {
        window.postMessage(
          {
            type: 'SUBMIT_SCORE',
            boxId: msg.boxId,
            score: msg.score,
            competitor: msg.competitor,
            registeredTime: msg.registeredTime,
          },
          '*',
        );
      }
    };

    const connect = () => {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectRef.current.tries = 0;
        try {
          ws.send(JSON.stringify({ type: 'REQUEST_STATE', boxId: Number(boxId) }));
        } catch (err) {
          debugError('[ContestPage] Failed to send REQUEST_STATE:', err);
        }
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          handleMessage(msg);
        } catch (err) {
          debugError('[ContestPage] Failed to parse WebSocket message:', err, ev.data);
        }
      };

      ws.onerror = () => {
        // swallow errors during handshake
      };

      ws.onclose = () => {
        if (!reconnectRef.current.shouldReconnect) return;
        const delay = Math.min(1000 * 2 ** reconnectRef.current.tries, 15000);
        reconnectRef.current.tries += 1;
        setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      reconnectRef.current.shouldReconnect = false;
      const ws = wsRef.current;
      wsRef.current = null;
      if (!ws) return;
      try {
        // Detach handlers to avoid side effects after unmount
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
      } catch (err) {
        // Expected during cleanup if socket already closed
        debugLog('[ContestPage cleanup] Handler detachment error (expected):', err);
      }
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close(1000, 'navigate-away');
        } else if (ws.readyState === WebSocket.CONNECTING) {
          // Avoid closing while CONNECTING (causes browser warning). Close once it opens.
          ws.addEventListener(
            'open',
            () => {
              try {
                ws.close(1000, 'navigate-away');
              } catch (err) {
                debugLog('[ContestPage cleanup] Close error during deferred cleanup:', err);
              }
            },
            { once: true },
          );
        }
      } catch (err) {
        // Expected during cleanup if socket state is invalid
        debugLog('[ContestPage cleanup] WebSocket close error (expected):', err);
      }
    };
  }, [boxId, getTimerPreset]);
  const [preparing, setPreparing] = useState<string[]>([]);

  const [climbing, setClimbing] = useState<string>('');
  const climbingRef = useRef<string>('');
  useEffect(() => {
    climbingRef.current = climbing;
  }, [climbing]);
  useEffect(() => {
    const onToggle = (e: StorageEvent) => {
      if (e.key === 'timeCriterionEnabled') {
        setTimeCriterionEnabled(e.newValue === 'on');
      }
    };
    window.addEventListener('storage', onToggle);
    return () => window.removeEventListener('storage', onToggle);
  }, [setTimeCriterionEnabled]);

  // Sincronizează competitorul curent în localStorage
  useEffect(() => {
    safeSetItem(`currentClimber-${boxId}`, climbing);
  }, [climbing, boxId]);

  const [remaining, setRemaining] = useState<string[]>([]);
  const [timerSec, setTimerSec] = useState<number>(() => {
    const t = getTimerPreset();
    const [m, s] = t.split(':').map(Number);
    return (m || 0) * 60 + (s || 0);
  });
  const preset = getTimerPreset();
  const [mPreset, sPreset] = preset.split(':').map(Number);
  const totalSec = (mPreset || 0) * 60 + (sPreset || 0);
  const [endTimeMs, setEndTimeMs] = useState<number | null>(null);
  const endTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerSecRef = useRef<number>(timerSec);
  useEffect(() => {
    timerSecRef.current = timerSec;
  }, [timerSec]);
  useEffect(() => {
    endTimeRef.current = endTimeMs;
  }, [endTimeMs]);
  const [ranking, setRanking] = useState<ScoresByName>(() => ({})); // { nume: [scores…] }
  const rankingRef = useRef<ScoresByName>(ranking);
  useEffect(() => {
    rankingRef.current = ranking;
  }, [ranking]);
  const [rankingTimes, setRankingTimes] = useState<TimesByName>(() => ({})); // { nume: [times…] }
  const rankingTimesRef = useRef<TimesByName>(rankingTimes);
  useEffect(() => {
    rankingTimesRef.current = rankingTimes;
  }, [rankingTimes]);
  const [running, setRunning] = useState<boolean>(false);
  const [category, setCategory] = useState<string>('');
  const [routeIdx, setRouteIdx] = useState<number>(1);
  const [finalized, setFinalized] = useState<boolean>(false);
  const [holdsCount, setHoldsCount] = useState<number>(0);
  const [currentHold, setCurrentHold] = useState<number>(0);
  const [holdsCountsAll, setHoldsCountsAll] = useState<number[]>([]);
  const BAR_WIDTH = 20;
  const [barHeight, setBarHeight] = useState<number>(500);

  const broadcastRemaining = useCallback(
    (remaining: number) => {
      try {
        if (timerChannelRef.current) {
          timerChannelRef.current.postMessage({ boxId: Number(boxId), remaining });
        } else {
          safeSetItem(
            `timer-sync-${boxId}`,
            JSON.stringify({ boxId: Number(boxId), remaining, ts: Date.now() }),
          );
        }
      } catch (err) {
        debugError('Failed to broadcast remaining time', err);
      }
      if (lastTimerSyncRef.current !== remaining) {
        lastTimerSyncRef.current = remaining;
        fetch(API_CMD, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ boxId: Number(boxId), type: 'TIMER_SYNC', remaining }),
        }).catch((err) => debugError('Failed to sync timer to backend', err));
      }
    },
    [boxId],
  );

  const formatSeconds = (sec: number): string | null => {
    if (typeof sec !== 'number' || Number.isNaN(sec)) return null;
    const m = Math.floor(sec / 60)
      .toString()
      .padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const startCountdown = useCallback(() => {
    const presetValue = getTimerPreset();
    const [m, s] = presetValue.split(':').map(Number);
    const duration = (m || 0) * 60 + (s || 0);
    const nextEnd = Date.now() + duration * 1000;
    setTimerSec(duration);
    timerSecRef.current = duration;
    setEndTimeMs(nextEnd);
    endTimeRef.current = nextEnd;
    setRunning(true);
    safeSetItem(`tick-owner-${boxId}`, window.name || 'tick-owner');
    safeSetItem(`timer-${boxId}`, duration.toString());
    broadcastRemaining(duration);
  }, [broadcastRemaining, boxId, getTimerPreset]);

  const pauseCountdown = useCallback(() => {
    const remaining = endTimeRef.current
      ? Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000))
      : timerSecRef.current;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setRunning(false);
    setEndTimeMs(null);
    endTimeRef.current = null;
    setTimerSec(remaining);
    timerSecRef.current = remaining;
    safeSetItem(`timer-${boxId}`, remaining.toString());
    broadcastRemaining(remaining);
  }, [boxId, broadcastRemaining]);

  const resumeCountdown = useCallback(() => {
    const remaining = timerSecRef.current;
    if (remaining <= 0) {
      return;
    }
    const nextEnd = Date.now() + remaining * 1000;
    setEndTimeMs(nextEnd);
    endTimeRef.current = nextEnd;
    setRunning(true);
    safeSetItem(`tick-owner-${boxId}`, window.name || 'tick-owner');
  }, [boxId]);

  // ===== T1 START_TIMER =====
  useEffect(() => {
    const onTimerCommand = (e: MessageEvent<WindowMessage>) => {
      if (+e.data?.boxId !== +boxId) return;
      if (e.data?.type === 'START_TIMER') {
        startCountdown();
      }
      if (e.data?.type === 'STOP_TIMER') {
        pauseCountdown();
      }
      if (e.data?.type === 'RESUME_TIMER') {
        resumeCountdown();
      }
    };
    window.addEventListener('message', onTimerCommand);
    return () => window.removeEventListener('message', onTimerCommand);
  }, [boxId, startCountdown, pauseCountdown, resumeCountdown]);

  // (INIT_ROUTE via WebSocket handled above; removed old postMessage INIT_ROUTE handler)

  // Handle +1 Hold button updates
  useEffect(() => {
    const onProgressUpdate = (e: MessageEvent<WindowMessage>) => {
      if (e.data?.type === 'PROGRESS_UPDATE' && +e.data.boxId === +boxId) {
        const delta = typeof e.data.delta === 'number' ? e.data.delta : 1;
        setCurrentHold((prev) => {
          // If we're applying a full hold after a semi-hold, drop fractional part
          if (delta === 1 && prev % 1 !== 0) {
            return Math.min(Math.floor(prev) + 1, holdsCount);
          }
          return Math.min(prev + delta, holdsCount);
        });
      }
    };
    window.addEventListener('message', onProgressUpdate);
    return () => window.removeEventListener('message', onProgressUpdate);
  }, [boxId, holdsCount]);

  // Synchronize commands from JudgePage via localStorage
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (!e.key || !e.newValue) return;
      let msg: any;
      try {
        msg = JSON.parse(e.newValue);
      } catch {
        // Not a JSON payload we care about (e.g. simple string values)
        return;
      }
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'START_TIMER' && +msg.boxId === +boxId) {
        window.postMessage({ type: 'START_TIMER', boxId: msg.boxId }, '*');
      }
      if (msg.type === 'STOP_TIMER' && +msg.boxId === +boxId) {
        window.postMessage({ type: 'STOP_TIMER', boxId: msg.boxId }, '*');
      }
      if (msg.type === 'RESUME_TIMER' && +msg.boxId === +boxId) {
        window.postMessage({ type: 'RESUME_TIMER', boxId: msg.boxId }, '*');
      }
      if (msg.type === 'PROGRESS_UPDATE' && +msg.boxId === +boxId) {
        window.postMessage({ type: 'PROGRESS_UPDATE', boxId: msg.boxId, delta: msg.delta }, '*');
      }
      if (msg.type === 'REQUEST_ACTIVE_COMPETITOR' && +msg.boxId === +boxId) {
        safeSetItem(
          'climb_response',
          JSON.stringify({
            type: 'RESPONSE_ACTIVE_COMPETITOR',
            boxId: +boxId,
            competitor: climbingRef.current,
            ts: Date.now(),
          }),
        );
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [boxId]);

  // T1 ticking loop
  useEffect(() => {
    if (!running || endTimeMs == null) return;
    const tick = () => {
      const diff = endTimeMs - Date.now();
      const next = Math.max(0, Math.ceil(diff / 1000));
      setTimerSec(next);
      timerSecRef.current = next;
      // opțional, sincronizează și în localStorage
      safeSetItem(`timer-${boxId}`, next.toString());
      if (next > 0) {
        const owner = safeGetItem(`tick-owner-${boxId}`);
        if (owner === (window.name || 'tick-owner')) {
          rafRef.current = requestAnimationFrame(tick);
        }
      } else {
        setRunning(false);
        setEndTimeMs(null);
        endTimeRef.current = null;
      }
      broadcastRemaining(next);
    };
    // Dacă exista un raf în așteptare, îl anulăm
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    tick();
    return () => cancelAnimationFrame(rafRef.current);
  }, [running, endTimeMs, boxId, broadcastRemaining]);

  // T1 initialization
  useEffect(() => {
    const all = JSON.parse(safeGetItem('listboxes') || '[]');
    const box = all[boxId];
    if (!box) return;
    const list = box.concurenti;
    if (list.length > 0) {
      setClimbing(list[0].nume);
      setPreparing(list.slice(1, 2).map((c) => c.nume));
      setRemaining(list.slice(2).map((c) => c.nume));
    }
    setRouteIdx(box.routeIndex || 1);
    setHoldsCount(box.holdsCount);
    setHoldsCountsAll(box.holdsCounts);
    setCategory(box.categorie || '');
  }, [boxId]);

  // T1 response
  useEffect(() => {
    const handleRequestT1 = (e: StorageEvent) => {
      if (e.key === storageKey('climb_request') || e.key === 'climb_request') {
        const parsed = JSON.parse(e.newValue || '{}');
        if (parsed.type === 'REQUEST_ACTIVE_COMPETITOR' && +parsed.boxId === +boxId) {
          safeSetItem(
            'climb_response',
            JSON.stringify({
              type: 'RESPONSE_ACTIVE_COMPETITOR',
              boxId: +boxId,
              competitor: climbingRef.current,
              ts: Date.now(),
            }),
          );
        }
      }
    };
    window.addEventListener('storage', handleRequestT1);
    return () => window.removeEventListener('storage', handleRequestT1);
  }, [boxId, climbing]);

  // T1 specific logic
  useEffect(() => {
    const handleMessageT1 = (e: MessageEvent<WindowMessage>) => {
      if (e.data?.type !== 'SUBMIT_SCORE' || +e.data.boxId !== +boxId) return;

      const competitorName = e.data.competitor;
      if (!competitorName) return;

      // 1. Update ranking state
      const updatedRanking = (() => {
        // start cu valorile curente
        const copy = { ...rankingRef.current };
        if (!copy[competitorName]) copy[competitorName] = [];
        // setează scorul pe ruta curentă (index 1-based → zero-based)
        copy[competitorName][routeIdx - 1] = e.data.score;
        return copy;
      })();
      // setează în state pentru UI
      setRanking(updatedRanking);
      const submittedTime = (() => {
        if (typeof e.data.registeredTime === 'number') return e.data.registeredTime;
        if (typeof e.data.registeredTime === 'string') {
          const parsed = parseFloat(e.data.registeredTime);
          return Number.isNaN(parsed) ? null : parsed;
        }
        return null;
      })();
      const updatedTimes = (() => {
        const copy = { ...rankingTimesRef.current };
        if (!copy[competitorName]) copy[competitorName] = [];
        copy[competitorName][routeIdx - 1] = submittedTime;
        return copy;
      })();
      setRankingTimes(updatedTimes);
      try {
        safeSetItem(`ranking-${boxId}`, JSON.stringify(updatedRanking));
        safeSetItem(`rankingTimes-${boxId}`, JSON.stringify(updatedTimes));
      } catch (err) {
        debugError('Failed to persist rankings', err);
      }
      // reset progress bar after score submission
      setCurrentHold(0);

      // 2. Mark competitor in localStorage
      try {
        const before = JSON.parse(safeGetItem('listboxes') || '[]');
        const boxBefore = before?.[boxId];
        if (boxBefore?.concurenti) {
          const idx = boxBefore.concurenti.findIndex((c) => c.nume === competitorName);
          if (idx !== -1) {
            boxBefore.concurenti[idx].marked = true;
            safeSetItem('listboxes', JSON.stringify(before));
          }
        }
      } catch (err) {
        debugError('Failed to update localStorage listboxes after submit', err);
      }

      // 3. Advance only if modifying the current competitor who just climbed
      if (competitorName === climbingRef.current) {
        // Advance climbers list
        setClimbing(preparing[0] || '');
        setPreparing((prev) => {
          const next = remaining[0];
          return prev.slice(1).concat(next !== undefined ? [next] : []);
        });
        setRemaining((prev) => prev.slice(1));

        // Reset timer
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        const preset = getTimerPreset();
        const [m, s] = preset.split(':').map(Number);
        const resetSec = (m || 0) * 60 + (s || 0);
        setTimerSec(resetSec);
        timerSecRef.current = resetSec;
        setRunning(false);
        setEndTimeMs(null);
        endTimeRef.current = null;
        safeSetItem(`timer-${boxId}`, resetSec.toString());
        broadcastRemaining(resetSec);

        // 5. Detect end of contest
        const after = JSON.parse(safeGetItem('listboxes') || '[]');
        const boxAfter = after?.[boxId];
        const totalRoutes = boxAfter ? Number(boxAfter.routesCount) : routeIdx;
        const allMarked = boxAfter?.concurenti ? boxAfter.concurenti.every((c) => c.marked) : false;
        console.log('End detection:', boxAfter.routeIndex, totalRoutes, allMarked);
        if (boxAfter && boxAfter.routeIndex === totalRoutes && allMarked) {
          setFinalized(true);
          // Salvează top-3 concurenți în localStorage pentru Award Ceremony
          const { rankPoints, nCompetitors } = calcRankPointsPerRoute(
            updatedRanking,
            updatedTimes,
            totalRoutes,
            timeCriterionEnabled,
          );
          const rows = Object.keys(rankPoints).map((nume) => {
            const rp = rankPoints[nume];
            const raw = updatedRanking[nume] || [];
            const total = geomMean(rp, totalRoutes, nCompetitors);
            return { nume, rp, raw, total };
          });
          rows.sort((a, b) => a.total - b.total);
          const podium = rows.slice(0, 3).map((c, i) => ({
            name: c.nume,
            color: ['#ffd700', '#c0c0c0', '#cd7f32'][i], // aur, argint, bronz
          }));
          safeSetItem(`podium-${boxId}`, JSON.stringify(podium));

          setTimeout(() => {
            // Build club mapping: { nume: club }
            const clubMap = {};
            boxAfter.concurenti.forEach((c) => {
              clubMap[c.nume] = c.club;
            });
            console.log('📦 Payload trimis la backend (setTimeout):', {
              categorie: boxAfter.categorie,
              route_count: totalRoutes,
              scores: updatedRanking,
              clubs: clubMap,
              times: updatedTimes,
            });

            fetch(`${API_BASE}/save_ranking`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                categorie: boxAfter.categorie,
                route_count: totalRoutes,
                scores: updatedRanking,
                clubs: clubMap,
                times: updatedTimes,
                use_time_tiebreak: timeCriterionEnabled,
              }),
            })
              .then((r) => r.json())
              .then((data) => {
                console.log('✅ Răspuns de la backend:', data);
              })
              .catch((err) => {
                debugError('❌ Eroare la salvarea clasamentului:', err);
              });
          }, 0); // << înlocuiește requestAnimationFrame cu setTimeout
        }
      }
    };
    window.addEventListener('message', handleMessageT1);
    return () => window.removeEventListener('message', handleMessageT1);
  }, [
    boxId,
    climbing,
    preparing,
    remaining,
    timeCriterionEnabled,
    broadcastRemaining,
    getTimerPreset,
    routeIdx,
  ]);

  const rankClass = (rank: number): string => {
    if (!finalized) return '';
    switch (rank) {
      case 1:
        return 'bg-gradient-to-r from-yellow-800 via-yellow-350 to-yellow-400 animate-pulse font-extrabold italic text-white';
      case 2:
        return 'bg-gray-500 font-bold text-white';
      case 3:
        return 'bg-amber-600  text-white';
      default:
        return '';
    }
  };
  return (
    <div className="h-screen grid grid-rows-[auto_1fr] bg-gray-50">
      {/* Header */}
      <header className="row-span-1 bg-white shadow-sm flex items-center justify-center">
        <h1 className="text-4xl font-extrabold">{sanitizeBoxName(category)}</h1>
      </header>

      <div className="row-span-1 grid grid-cols-12 gap-4 p-4">
        {/* Left column: Preparing + Climbing */}
        <div className="col-span-5 flex flex-col gap-4">
          {/* Preparing */}
          <aside className="bg-white rounded-lg shadow-md p-6 flex flex-col">
            <h2 className="text-4xl font-semibold mb-4">Preparing</h2>
            <ul className="space-y-2 flex-1 overflow-y-auto text-4xl">
              {preparing.map((n, i) => (
                <li key={i} className="py-6 px-2 bg-gray-100 rounded">
                  {n}
                </li>
              ))}
            </ul>
          </aside>

          {/* Climbing */}
          <main className="relative bg-gradient-to-br from-blue-700 to-blue-900 rounded-lg shadow-lg p-8 h-[43rem]">
            <span className="text-3xl uppercase tracking-wide text-blue-200 mb-2">Climber</span>
            <h2
              className={`text-6xl font-extrabold text-white mb-6 ${timerSec > 0 ? 'animate-pulse' : ''}`}
            >
              {climbing || '—'}
            </h2>
            {/* Progress ring */}
            <div className="relative w-64 h-64 mt-20 mb-6">
              <svg className="absolute inset-0" viewBox="0 0 100 100">
                <circle
                  className="stroke-yellow-500 stroke-11 fill-transparent"
                  cx="50"
                  cy="50"
                  r="45"
                  strokeDasharray="283"
                  strokeDashoffset={283 - (timerSec / totalSec) * 283}
                  style={{ transition: 'stroke-dashoffset 1s linear' }}
                />
              </svg>
              <div
                className={`absolute inset-0 flex items-center justify-center font-mono text-7xl ${
                  timerSec <= 5 ? 'text-yellow-300 animate-pulse' : 'text-white'
                }`}
              >
                {timerSec > 0
                  ? `${String(Math.floor(timerSec / 60)).padStart(2, '0')}:${String(
                      timerSec % 60,
                    ).padStart(2, '0')}`
                  : 'STOP!'}
              </div>
            </div>
            {/* Route progress bar at bottom-right, resizable */}
            <div className="absolute bottom-4 right-4">
              <ResizableBox
                width={BAR_WIDTH}
                height={barHeight}
                axis="y"
                resizeHandles={['n']}
                minConstraints={[BAR_WIDTH, 100]}
                maxConstraints={[BAR_WIDTH, 800]}
                onResizeStop={(e, data) => setBarHeight(data.size.height)}
              >
                <RouteProgress
                  holds={holdsCount}
                  current={currentHold}
                  w={BAR_WIDTH}
                  h={barHeight}
                />
              </ResizableBox>
            </div>
          </main>
        </div>

        {/* Ranking */}
        <aside className="col-span-7 bg-gray-200 rounded-lg shadow-md p-6 flex flex-col h-full min-h-0">
          {/* Head row */}
          <div
            className="grid gap-2 divide-x divide-gray-300 font-semibold border-b border-gray-300 pb-2 mb-2"
            style={{ gridTemplateColumns: `1fr repeat(${routeIdx}, 1fr) 80px` }}
          >
            <span className="px-2">Ranking</span>
            {Array.from({ length: routeIdx }).map((_, i) => (
              <span key={i} className="px-2 text-right">
                Score(T{i + 1})
              </span>
            ))}
            <span className="px-2 text-right text-red-500">Total</span>
          </div>

          {/* Rows */}
          <div className="flex-1 overflow-y-auto">
            {(() => {
              const { rankPoints, nCompetitors } = calcRankPointsPerRoute(
                ranking,
                rankingTimes,
                routeIdx,
                timeCriterionEnabled,
              );
              const rows = Object.keys(rankPoints).map((nume) => {
                const rp = rankPoints[nume];
                const raw = ranking[nume] || [];
                const rawTimes = rankingTimes[nume] || [];
                const total = geomMean(rp, routeIdx, nCompetitors);
                return { nume, rp, raw, rawTimes, total };
              });
              rows.sort((a, b) => a.total - b.total);

              // Calculează rank cu tie-handling
              const withRank = [];
              let prevTotal = null,
                prevRank = 0;
              rows.forEach((row, idx) => {
                const rank = row.total === prevTotal ? prevRank : idx + 1;
                withRank.push({ ...row, rank });
                prevTotal = row.total;
                prevRank = rank;
              });

              return withRank.map((row) => (
                <div
                  key={row.nume}
                  className={`grid gap-2 divide-x divide-gray-200 py-2 text-2xl ${rankClass(row.rank)}`}
                  style={{ gridTemplateColumns: `1fr repeat(${routeIdx}, 1fr) 80px` }}
                >
                  <span className="px-2 text-4xl font-semibold">
                    {row.rank}. {sanitizeCompetitorName(row.nume)}
                  </span>
                  {Array.from({ length: routeIdx }).map((_, i) => {
                    const scoreVal = row.raw[i];
                    const timeVal = row.rawTimes[i];
                    return (
                      <span
                        key={i}
                        className="px-2 text-right flex flex-col items-end leading-tight"
                      >
                        {scoreVal !== undefined
                          ? holdsCountsAll[i] && scoreVal === Number(holdsCountsAll[i])
                            ? 'Top'
                            : scoreVal.toFixed(1)
                          : '—'}
                        {timeVal != null && timeCriterionEnabled && (
                          <span className="text-base text-gray-600">{formatSeconds(timeVal)}</span>
                        )}
                      </span>
                    );
                  })}
                  <span className="px-2 text-right font-mono text-red-500">
                    {row.total.toFixed(3)}
                  </span>
                </div>
              ));
            })()}
          </div>
        </aside>
      </div>
    </div>
  );
};

export default ContestPage;
