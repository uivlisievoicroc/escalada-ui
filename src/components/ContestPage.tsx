import React, { useEffect, useState, useRef, useCallback, FC } from 'react';
import { useParams } from 'react-router-dom';
import { debugLog, debugError, debugWarn } from '../utilis/debug';
import { safeSetItem, safeGetItem, safeRemoveItem, storageKey } from '../utilis/storage';
import { sanitizeBoxName, sanitizeCompetitorName, normalizeCompetitorKey } from '../utilis/sanitize';
import { clearAuth, isAuthenticated, magicLogin } from '../utilis/auth';
import LoginOverlay from './LoginOverlay';
import type { Competitor, WebSocketMessage } from '../types';
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
  const trackWidth = w * 0.35;
  return (
    <svg width={w + 20} height={h} className="block overflow-visible">
      <defs>
        <linearGradient id="progressGradient" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.9" />
          <stop offset="50%" stopColor="#0ea5e9" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#0f172a" stopOpacity="0.3" />
        </linearGradient>
        <filter id="dotGlow">
          <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        <filter id="trackGlow">
          <feGaussianBlur stdDeviation="1.5" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      {/* Background rail */}
      <path
        d={pathD}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={trackWidth * 1.8}
        strokeLinecap="round"
      />
      {/* Active track with glow */}
      <path
        d={pathD}
        fill="none"
        stroke="url(#progressGradient)"
        strokeWidth={trackWidth}
        strokeLinecap="round"
        filter="url(#trackGlow)"
      />
      {/* Climber dot with halo */}
      <circle cx={dotX} cy={dotY} r={trackWidth * 2.2} fill="#22d3ee" opacity="0.25" />
      <circle cx={dotX} cy={dotY} r={trackWidth * 1.8} fill="#fbbf24" filter="url(#dotGlow)" />
      <circle cx={dotX} cy={dotY} r={trackWidth * 1.3} fill="#fde047" />
      <circle cx={dotX} cy={dotY} r={trackWidth * 0.9} fill="#fef08a" />
    </svg>
  );
};

// ===== helpers pentru clasament IFSC =====
/** Returnează { [nume]: [rankPoints…] } şi numărul total de concurenţi */
const calcRankPointsPerRoute = (
  scoresByName: ScoresByName,
  routeIdx: number,
): { rankPoints: { [name: string]: (number | undefined)[] }; nCompetitors: number } => {
  const rankPoints: { [name: string]: (number | undefined)[] } = {};
  const nRoutes = routeIdx; // câte rute am până acum
  let nCompetitors = 0;

  // pentru fiecare rută (0‑based)
  for (let r = 0; r < nRoutes; r++) {
    // colectează scorurile existente
    const list: RankInfo[] = Object.entries(scoresByName)
      .filter(([, arr]) => arr[r] !== undefined)
      .map(([nume, arr]) => ({
        nume,
        score: arr[r],
      }));

    // sortează descrescător
    list.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.nume.localeCompare(b.nume, undefined, { sensitivity: 'base' });
    });

    // parcurge şi atribuie rank‑ul cu tie‑handling
    let pos = 1;
    for (let i = 0; i < list.length; ) {
      const current = list[i];
      let j = i;
      while (j < list.length && list[j].score === current.score) {
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
  const { boxId: boxIdParam } = useParams<{ boxId: string }>();
  const boxId = boxIdParam!; // Route ensures this exists

  const [authActive, setAuthActive] = useState<boolean>(() => isAuthenticated());
  const [showLogin, setShowLogin] = useState<boolean>(() => !isAuthenticated());

  // Optional: support magic login via URL param (useful for kiosk displays)
  useEffect(() => {
    const readMagic = (): string | null => {
      try {
        const fromSearch = new URLSearchParams(window.location.search).get('magic');
        if (fromSearch) return fromSearch;
      } catch {
        // ignore
      }

      // Hash router fallback: /#/contest/0?magic=...
      try {
        if (window.location.hash && window.location.hash.includes('?')) {
          const [, qs] = window.location.hash.split('?');
          return new URLSearchParams(qs).get('magic');
        }
      } catch {
        // ignore
      }
      return null;
    };

    const magic = readMagic();
    if (!magic) return;

    (async () => {
      try {
        await magicLogin(magic);
        setAuthActive(true);
        setShowLogin(false);
      } catch (err) {
        debugError('[ContestPage] Magic login failed', err);
      }
    })();
  }, []);
  const getTimerPreset = useCallback(() => {
    const specific = safeGetItem(`climbingTime-${boxId}`);
    const global = safeGetItem('climbingTime');
    return specific || global || '05:00';
  }, [boxId]);
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
  const readTimeCriterionEnabled = useCallback((): boolean => {
    const perBox = parseTimeCriterionValue(safeGetItem(`timeCriterionEnabled-${boxId}`));
    if (perBox !== null) return perBox;
    const legacy = parseTimeCriterionValue(safeGetItem('timeCriterionEnabled'));
    return legacy ?? false;
  }, [boxId]);
  const [timeCriterionEnabled, setTimeCriterionEnabled] = useState<boolean>(
    () => readTimeCriterionEnabled(),
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

    if (!authActive) {
      return;
    }

    // Token is in httpOnly cookie; WebSocket handshake will include cookies automatically.
    const url = `${WS_PROTOCOL}://${window.location.hostname}:8000/api/ws/${boxId}`;

    const handleMessage = (msg: WebSocketMessage) => {
      if (msg.type === 'STATE_SNAPSHOT') {
        if (+msg.boxId !== Number(boxId)) return;
        // Hydrate ContestPage from authoritative backend state so opening mid-contest
        // doesn't reset the UI to the first competitor from localStorage listboxes.
	        if (msg.sessionId) {
	          safeSetItem(`sessionId-${boxId}`, msg.sessionId);
	        }
	        if (typeof msg.boxVersion === 'number') {
	          safeSetItem(`boxVersion-${boxId}`, String(msg.boxVersion));
	        }
        if (typeof msg.categorie === 'string') {
          setCategory(msg.categorie);
        }
        if (typeof msg.routeIndex === 'number') {
          setRouteIdx(msg.routeIndex);
        }
        if (typeof msg.holdsCount === 'number') {
          setHoldsCount(msg.holdsCount);
        }
        if (Array.isArray(msg.holdsCounts)) {
          setHoldsCountsAll(msg.holdsCounts.filter((n: any) => typeof n === 'number'));
        }
        if (typeof msg.holdCount === 'number') {
          setCurrentHold(msg.holdCount);
        }
	        if (typeof msg.timerPreset === 'string' && msg.timerPreset.trim()) {
	          safeSetItem(`climbingTime-${boxId}`, msg.timerPreset);
	        }

        const competitors = Array.isArray(msg.competitors) ? msg.competitors : [];
        const names = competitors
          .filter((c: any) => c && typeof c === 'object' && !c.marked)
          .map((c: any) => (typeof c.nume === 'string' ? c.nume : ''))
          .filter((n: string) => !!n.trim());

        const current =
          typeof msg.currentClimber === 'string' && msg.currentClimber.trim()
            ? msg.currentClimber
            : names[0] || '';
        const currentIdx = current ? names.indexOf(current) : -1;

        const preparing =
          typeof msg.preparingClimber === 'string' && msg.preparingClimber.trim()
            ? msg.preparingClimber
            : currentIdx >= 0
              ? names[currentIdx + 1] || ''
              : names[1] || '';

        setClimbing(current);
        if (preparing) {
          setPreparing([preparing]);
          if (currentIdx >= 0) {
            setRemaining(names.slice(currentIdx + 2));
          } else {
            setRemaining(names.filter((n) => n !== current && n !== preparing).slice(1));
          }
        } else {
          setPreparing([]);
          if (currentIdx >= 0) {
            setRemaining(names.slice(currentIdx + 1));
          } else {
            setRemaining(names.filter((n) => n !== current));
          }
        }

        const remainingRaw = typeof msg.remaining === 'number' ? msg.remaining : null;
        const remainingSec =
          remainingRaw != null && Number.isFinite(remainingRaw) ? Math.max(0, Math.ceil(remainingRaw)) : null;
        const presetFallback =
          typeof msg.timerPresetSec === 'number' && Number.isFinite(msg.timerPresetSec)
            ? Math.max(0, Math.ceil(msg.timerPresetSec))
            : null;

        if (msg.timerState === 'running') {
          const sec = remainingSec ?? presetFallback;
          if (typeof sec === 'number') {
            setTimerSec(sec);
            timerSecRef.current = sec;
            safeSetItem(`timer-${boxId}`, sec.toString());
            const owner = safeGetItem(`tick-owner-${boxId}`);
            if (!owner) {
              safeSetItem(`tick-owner-${boxId}`, window.name || 'tick-owner');
            }
            const nextEnd = Date.now() + sec * 1000;
            setEndTimeMs(nextEnd);
            endTimeRef.current = nextEnd;
            setRunning(true);
            broadcastRemaining(sec);
          }
        } else if (msg.timerState === 'paused') {
          const sec = remainingSec ?? presetFallback;
          if (typeof sec === 'number') {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
            setRunning(false);
            setEndTimeMs(null);
            endTimeRef.current = null;
            setTimerSec(sec);
            timerSecRef.current = sec;
            safeSetItem(`timer-${boxId}`, sec.toString());
            broadcastRemaining(sec);
          }
        } else if (msg.timerState === 'idle') {
          // Don't clobber an active local countdown if we already have one.
          if (!running) {
            const sec = remainingSec ?? presetFallback;
            if (typeof sec === 'number') {
              setTimerSec(sec);
              timerSecRef.current = sec;
              safeSetItem(`timer-${boxId}`, sec.toString());
              broadcastRemaining(sec);
            }
          }
        }

        if (typeof msg.timeCriterionEnabled === 'boolean') {
          setTimeCriterionEnabled(msg.timeCriterionEnabled);
          safeSetItem(`timeCriterionEnabled-${boxId}`, msg.timeCriterionEnabled ? 'on' : 'off');
        }
      }
      if (msg.type === 'SET_TIME_CRITERION') {
        if (+msg.boxId !== Number(boxId)) return;
        if (typeof msg.timeCriterionEnabled === 'boolean') {
          setTimeCriterionEnabled(msg.timeCriterionEnabled);
          safeSetItem(`timeCriterionEnabled-${boxId}`, msg.timeCriterionEnabled ? 'on' : 'off');
        }
      }
      if (msg.type === 'INIT_ROUTE') {
        const { routeIndex, competitors, holdsCount } = msg;
        setRouteIdx(routeIndex);
        setHoldsCount(holdsCount);
        if (competitors?.length) {
          setClimbing(competitors[0].nume);
          setPreparing((competitors as Competitor[]).slice(1, 2).map((c: Competitor) => c.nume));
          setRemaining((competitors as Competitor[]).slice(2).map((c: Competitor) => c.nume));
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

      ws.onclose = async (ev) => {
        if (!reconnectRef.current.shouldReconnect) return;

        // Auth required or forbidden box/role: stop reconnect loop and prompt login.
        if (ev?.code === 4401 || ev?.code === 4403) {
          reconnectRef.current.shouldReconnect = false;
          try {
            await clearAuth();
          } catch {
            // ignore
          }
          setAuthActive(false);
          setShowLogin(true);
          return;
        }

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
  }, [boxId, getTimerPreset, authActive]);
  const [preparing, setPreparing] = useState<string[]>([]);

  const [climbing, setClimbing] = useState<string>('');
  const climbingRef = useRef<string>('');
  useEffect(() => {
    climbingRef.current = climbing;
  }, [climbing]);
  useEffect(() => {
    const onToggle = (e: StorageEvent) => {
      if (!e.key) return;
      const nsPrefix = storageKey('timeCriterionEnabled-');
      if (!(e.key.startsWith(nsPrefix) || e.key.startsWith('timeCriterionEnabled-'))) return;
      const key = e.key.replace(nsPrefix, 'timeCriterionEnabled-');
      const idx = Number(key.split('-')[1] || '');
      if (Number.isNaN(idx) || idx !== Number(boxId)) return;
      const parsed = parseTimeCriterionValue(e.newValue);
      if (parsed === null) return;
      setTimeCriterionEnabled(parsed);
    };
    window.addEventListener('storage', onToggle);
    return () => window.removeEventListener('storage', onToggle);
  }, [boxId]);

  useEffect(() => {
    const onResize = () => {
      setBarHeight(window.innerHeight >= 900 ? 360 : 260);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

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
  const BAR_WIDTH = 22;
  const [barHeight, setBarHeight] = useState<number>(() =>
    window.innerHeight >= 900 ? 360 : 260,
  );
  const readRoutesetterName = useCallback(() => {
    // Load routesetter name for current route
    const perRoute = safeGetItem(`routesetterName-${boxId}-${routeIdx}`);
    const perBox = safeGetItem(`routesetterName-${boxId}`);
    const global = safeGetItem('routesetterName');
    return perRoute || perBox || global || '—';
  }, [boxId, routeIdx]);
  const [routesetterName, setRoutesetterName] = useState<string>(() => readRoutesetterName());
  useEffect(() => {
    setRoutesetterName(readRoutesetterName());
  }, [readRoutesetterName]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (!e.key) return;
      const nsPrefix = storageKey('routesetterName-');
      if (
        e.key === storageKey(`routesetterName-${boxId}-${routeIdx}`) ||
        e.key === `routesetterName-${boxId}-${routeIdx}` ||
        e.key === storageKey(`routesetterName-${boxId}`) ||
        e.key === `routesetterName-${boxId}` ||
        e.key === storageKey('routesetterName') ||
        e.key === 'routesetterName' ||
        e.key.startsWith(nsPrefix)
      ) {
        setRoutesetterName(readRoutesetterName());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [boxId, routeIdx, readRoutesetterName]);

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
        const sessionId = safeGetItem(`sessionId-${boxId}`) || undefined;
        const rawVersion = safeGetItem(`boxVersion-${boxId}`);
        const parsedVersion = rawVersion ? parseInt(rawVersion, 10) : NaN;
        const boxVersion = Number.isFinite(parsedVersion) ? parsedVersion : undefined;
        if (!sessionId) return;
        fetch(API_CMD, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            boxId: Number(boxId),
            type: 'TIMER_SYNC',
            remaining,
            sessionId,
            boxVersion,
          }),
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
    broadcastRemaining(duration ?? 0);
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

  // ===== R1 START_TIMER =====
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

  // R1 ticking loop
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
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [running, endTimeMs, boxId, broadcastRemaining]);

  // R1 initialization
  useEffect(() => {
    const all = JSON.parse(safeGetItem('listboxes') || '[]');
    const box = all[boxId];
    if (!box) return;
    const list = box.concurenti as Competitor[];
    if (list.length > 0) {
      setClimbing(list[0].nume);
      setPreparing(list.slice(1, 2).map((c: Competitor) => c.nume));
      setRemaining(list.slice(2).map((c: Competitor) => c.nume));
    }
    setRouteIdx(box.routeIndex || 1);
    setHoldsCount(box.holdsCount);
    setHoldsCountsAll(box.holdsCounts);
    setCategory(box.categorie || '');
  }, [boxId]);

  // R1 response
  useEffect(() => {
    const handleRequestR1 = (e: StorageEvent) => {
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
    window.addEventListener('storage', handleRequestR1);
    return () => window.removeEventListener('storage', handleRequestR1);
  }, [boxId, climbing]);

  // R1 specific logic
  useEffect(() => {
    const handleMessageR1 = (e: MessageEvent<WindowMessage>) => {
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
        copy[competitorName][routeIdx - 1] = submittedTime ?? undefined;
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
	          const competitors = boxBefore.concurenti as Competitor[];
	          let idx = competitors.findIndex((c: Competitor) => c.nume === competitorName);
	          if (idx === -1) {
	            const target = normalizeCompetitorKey(competitorName);
	            if (target) {
	              idx = competitors.findIndex(
	                (c: Competitor) => normalizeCompetitorKey(c.nume) === target,
	              );
	            }
	          }
	          if (idx !== -1) {
	            boxBefore.concurenti[idx].marked = true;
	            safeSetItem('listboxes', JSON.stringify(before));
	          } else {
	            debugWarn('[ContestPage] Failed to match competitor for marking:', competitorName);
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
        const allMarked = boxAfter?.concurenti
          ? (boxAfter.concurenti as Competitor[]).every((c: Competitor) => !!c.marked)
          : false;
        console.log('End detection:', boxAfter.routeIndex, totalRoutes, allMarked);
        if (boxAfter && boxAfter.routeIndex === totalRoutes && allMarked) {
          setFinalized(true);
          // Salvează top-3 concurenți în localStorage pentru Award Ceremony
          const { rankPoints, nCompetitors } = calcRankPointsPerRoute(
            updatedRanking,
            totalRoutes,
          );
          const rows = Object.keys(rankPoints).map((nume) => {
            const rp = rankPoints[nume];
            const raw = updatedRanking[nume] || [];
            const total = geomMean(rp, totalRoutes, nCompetitors);
            return { nume, rp, raw, total };
          });
          rows.sort((a, b) => {
            if (a.total !== b.total) return a.total - b.total;
            return a.nume.localeCompare(b.nume, undefined, { sensitivity: 'base' });
          });
          const podium = rows.slice(0, 3).map((c, i) => ({
            name: c.nume,
            color: ['#ffd700', '#c0c0c0', '#cd7f32'][i], // aur, argint, bronz
          }));
          safeSetItem(`podium-${boxId}`, JSON.stringify(podium));

          setTimeout(() => {
            // Build club mapping: { nume: club }
            const clubMap: Record<string, string> = {};
            (boxAfter.concurenti as Competitor[]).forEach((c: Competitor) => {
              clubMap[c.nume] = c.club ?? '';
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
    window.addEventListener('message', handleMessageR1);
    return () => window.removeEventListener('message', handleMessageR1);
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

  return (
    <>
      {showLogin && (
        <LoginOverlay
          defaultUsername="viewer"
          onSuccess={() => {
            setAuthActive(true);
            setShowLogin(false);
          }}
        />
      )}
      <div className="h-screen overflow-hidden md:overflow-y-auto bg-gradient-to-br from-[#05060a] via-[#0b1220] to-[#0f172a] text-slate-100 flex flex-col">
      <header className="max-w-7xl mx-auto px-6 py-2 flex items-center justify-between border-b border-white/10 flex-shrink-0">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.28em] text-cyan-200/80">Contest</p>
          <h1 className="text-2xl md:text-3xl font-black text-white">{sanitizeBoxName(category)}</h1>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="px-3 py-1 rounded-full bg-cyan-500/15 border border-cyan-300/40 text-cyan-200">
            T{routeIdx} • {holdsCount || 0} holds
          </span>
          {finalized && (
            <span className="px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-300/40 text-emerald-200">
              Finalized
            </span>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-3 flex-1 grid gap-4 lg:grid-cols-[1.6fr_1fr] items-start overflow-hidden md:overflow-visible">
        <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur">
          <div
            className="absolute inset-0 opacity-70 bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,0.14),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(14,165,233,0.18),transparent_40%)]"
            aria-hidden
          />
          <div className="relative flex flex-col items-center gap-4 p-6 h-full overflow-hidden">
            {/* Climber name - DOMINANT element with spotlight */}
            <div className="relative flex-1 flex flex-col items-center justify-center w-full">
              {/* Spotlight behind name */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div 
                  className="w-[400px] h-[200px] rounded-full opacity-20 blur-3xl"
                  style={{
                    background: 'radial-gradient(ellipse, rgba(34,211,238,0.5) 0%, transparent 70%)'
                  }}
                />
              </div>
              
              <div className="relative z-10 text-center space-y-3">
                <p className="text-xs uppercase tracking-[0.28em] text-cyan-200/60">Climber</p>
                <h2 
                  className="text-7xl md:text-8xl font-black leading-none text-white px-8"
                  style={{
                    textShadow: '0 0 40px rgba(34,211,238,0.5), 0 0 20px rgba(34,211,238,0.3), 0 4px 12px rgba(0,0,0,0.8)',
                    filter: 'drop-shadow(0 0 30px rgba(34,211,238,0.4))'
                  }}
                >
                  {climbing ? sanitizeCompetitorName(climbing) : 'Waiting for athlete'}
                </h2>
                <p className="text-sm text-white/50 tracking-wide">
                  Up next: {preparing[0] ? sanitizeCompetitorName(preparing[0]) : '—'}
                </p>
              </div>
            </div>

            {/* Climber progress (vertical) */}
            <div className="relative flex items-center justify-center w-full">
              <div className="flex flex-col items-center gap-2">
                <div className="text-[10px] uppercase tracking-[0.25em] text-white/50">
                  Route Progress
                </div>
                <RouteProgress holds={holdsCount} current={currentHold} w={BAR_WIDTH} h={barHeight} />
              </div>
            </div>

            {/* Timer - SECONDARY premium element */}
            <div className="relative w-full">
              <div className="rounded-2xl border border-white/20 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl shadow-2xl p-4">
                <div className="flex flex-col items-center gap-3">
                  {/* Timer display - 2x larger */}
                  <div
                    className="font-mono text-7xl md:text-8xl font-bold tabular-nums"
                    style={{
                      color: timerSec <= 5 ? '#fbbf24' : '#e0f2fe',
                      textShadow: timerSec <= 5 ? '0 0 20px rgba(251,191,36,0.6)' : '0 0 15px rgba(34,211,238,0.4)',
                      letterSpacing: '0.05em'
                    }}
                  >
                    {timerSec > 0
                      ? `${String(Math.floor(timerSec / 60)).padStart(2, '0')}:${String(
                          timerSec % 60,
                        ).padStart(2, '0')}`
                      : 'STOP'}
                  </div>

                  {/* Progress bar - horizontal */}
                  <div className="w-full max-w-md h-3 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-1000 linear ${
                        timerSec <= 5 ? 'bg-rose-400' : 'bg-cyan-400'
                      }`}
                      style={{
                        width: `${(timerSec / totalSec) * 100}%`,
                        boxShadow: timerSec <= 5 ? '0 0 12px rgba(251,113,133,0.6)' : '0 0 12px rgba(34,211,238,0.6)'
                      }}
                    />
                  </div>

                  {/* Timer status indicator */}
                  <div className="flex items-center gap-2">
                    <span 
                      className={`h-2 w-2 rounded-full ${
                        running ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'
                      }`}
                      style={{
                        boxShadow: running ? '0 0 8px rgba(52,211,153,0.6)' : 'none'
                      }}
                    />
                    <span className="text-sm font-medium text-white/90">
                      {running ? 'Running' : 'Paused'}
                    </span>
                    {timeCriterionEnabled && (
                      <div className="inline-flex items-center gap-1.5 px-2 py-0.5 ml-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 text-emerald-200">
                        <span className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-[10px] uppercase tracking-wider">Time tiebreak</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>


          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-4 flex flex-col gap-4 overflow-y-auto max-h-full">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-cyan-200/80">Preparing</p>
              <h3 className="text-xl font-bold text-white">On deck</h3>
            </div>
            <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs uppercase tracking-[0.2em] text-white/60">
              Queue
            </span>
          </div>
          <ul className="space-y-3 text-lg">
            {preparing.length === 0 && (
              <li className="px-4 py-3 rounded-lg border border-white/5 bg-white/5 text-white/60">No climbers in queue</li>
            )}
            {preparing.map((n, i) => (
              <li
                key={i}
                className="px-4 py-3 rounded-lg border border-white/5 bg-white/10 flex items-center justify-between"
              >
                <span className="font-semibold text-white">{sanitizeCompetitorName(n)}</span>
                <span className="text-xs text-white/60 uppercase tracking-[0.2em]">Next</span>
              </li>
            ))}
          </ul>

          {remaining.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-white/60 mb-2">Waiting</p>
              <div className="flex flex-wrap gap-2">
                {remaining.map((n, idx) => (
                  <span
                    key={idx}
                    className="px-3 py-2 rounded-full border border-white/5 bg-white/5 text-sm text-white/80"
                  >
                    {sanitizeCompetitorName(n)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Route Info - new section */}
          <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs uppercase tracking-[0.24em] text-cyan-200/80">Route Info</p>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-white/80">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400/60" />
                <span className="text-white/60">Route:</span>
                <span className="font-semibold text-white">{routeIdx}</span>
              </div>
              <div className="flex items-center gap-2 text-white/80">
                <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
                <span className="text-white/60">Holds:</span>
                <span className="font-semibold text-white">{holdsCount || 0}</span>
              </div>
              <div className="flex items-center gap-2 text-white/80">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400/60" />
                <span className="text-white/60">Routesetter:</span>
                <span className="font-semibold text-white">{routesetterName}</span>
              </div>
            </div>
          </div>
        </section>
      </main>
      </div>
    </>
  );
};

export default ContestPage;
