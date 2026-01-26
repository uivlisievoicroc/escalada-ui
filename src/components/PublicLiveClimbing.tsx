import React, { FC, useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSpectatorToken, clearSpectatorToken } from './PublicHub';

const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss' : 'ws';
const WS_BASE = `${WS_PROTOCOL}://${window.location.hostname}:8000/api/public/ws`;

const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_BASE_DELAY_MS = 1000;

type StateSnapshot = {
  type: string;
  boxId: number;
  initiated: boolean;
  holdsCount: number;
  routeIndex: number;
  routesCount?: number | null;
  holdsCounts?: number[] | null;
  currentClimber: string;
  preparingClimber?: string;
  timerState: 'idle' | 'running' | 'paused';
  holdCount: number;
  competitors?: Array<{ nume: string; marked?: boolean }>;
  categorie?: string;
  registeredTime?: number | null;
  remaining?: number | null;
  timeCriterionEnabled?: boolean;
  timerPreset?: string | null;
  timerPresetSec?: number | null;
};

const formatTime = (seconds: number | null | undefined): string => {
  if (typeof seconds !== 'number' || Number.isNaN(seconds)) return '--:--';
  const isNegative = seconds < 0;
  const absSeconds = Math.abs(Math.floor(seconds));
  const m = Math.floor(absSeconds / 60);
  const s = absSeconds % 60;
  const formatted = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return isNegative ? `-${formatted}` : formatted;
};

const PublicLiveClimbing: FC = () => {
  const { boxId } = useParams<{ boxId: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<StateSnapshot | null>(null);
  const [displayRemaining, setDisplayRemaining] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isConnectingRef = useRef(false);
  const remainingBaseRef = useRef<{ atMs: number; remaining: number } | null>(null);

  const connect = useCallback(async () => {
    if (isConnectingRef.current || !boxId) return;
    isConnectingRef.current = true;

    try {
      const token = await getSpectatorToken();
      const url = `${WS_BASE}/${boxId}?token=${encodeURIComponent(token)}`;

      if (wsRef.current) {
        wsRef.current.close();
      }

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setError(null);
        setReconnectAttempts(0);
        isConnectingRef.current = false;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'PING') {
            ws.send(JSON.stringify({ type: 'PONG' }));
            return;
          }

          if (data.type === 'STATE_SNAPSHOT') {
            setState(data);

            if (typeof data.remaining === 'number' && Number.isFinite(data.remaining)) {
              remainingBaseRef.current = { atMs: Date.now(), remaining: data.remaining };
              setDisplayRemaining(data.remaining);
            } else {
              remainingBaseRef.current = null;
              setDisplayRemaining(null);
            }
          }
        } catch (err) {
          console.error('Failed to parse WS message:', err);
        }
      };

      ws.onerror = () => {
        setError('Eroare de conexiune');
        isConnectingRef.current = false;
      };

      ws.onclose = (event) => {
        setConnected(false);
        isConnectingRef.current = false;

        // Handle token expiry
        if (event.code === 4401) {
          clearSpectatorToken();
        }

        // Attempt reconnect with exponential backoff
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          const delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, reconnectAttempts);
          reconnectTimeoutRef.current = setTimeout(() => {
            setReconnectAttempts((prev) => prev + 1);
            connect();
          }, delay);
        } else {
          setError('Conexiunea a eșuat. Reîncarcă pagina.');
        }
      };
    } catch (err) {
      setError('Nu s-a putut obține token-ul');
      isConnectingRef.current = false;
    }
  }, [boxId, reconnectAttempts]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  // Local ticking so spectators see time flowing live between snapshots.
  useEffect(() => {
    if (!state) {
      setDisplayRemaining(null);
      return;
    }

    // When idle/paused, display the last server value as-is.
    if (state.timerState !== 'running') {
      if (typeof state.remaining === 'number' && Number.isFinite(state.remaining)) {
        setDisplayRemaining(state.remaining);
      } else {
        setDisplayRemaining(null);
      }
      return;
    }

    // Running: tick based on the time elapsed since we received the last snapshot.
    const tick = () => {
      const base = remainingBaseRef.current;
      if (!base) {
        if (typeof state.remaining === 'number' && Number.isFinite(state.remaining)) {
          setDisplayRemaining(state.remaining);
        } else {
          setDisplayRemaining(null);
        }
        return;
      }
      const elapsedSec = (Date.now() - base.atMs) / 1000;
      setDisplayRemaining(base.remaining - elapsedSec);
    };

    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [state]);

  const handleBack = () => {
    navigate('/public');
  };

  const handleRefresh = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'REQUEST_STATE' }));
    }
  };

  // Render holds progress bar
  const renderHoldsProgress = () => {
    if (!state) return null;
    const { holdCount, holdsCount } = state;
    const percentage = holdsCount > 0 ? (holdCount / holdsCount) * 100 : 0;

    return (
      <div className="w-full">
        <div className="flex justify-between text-sm text-slate-400 mb-2">
          <span>Progres</span>
          <span>
            {holdCount} / {holdsCount} prize
          </span>
        </div>
        <div className="h-4 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all duration-300"
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
      </div>
    );
  };

  // Timer color based on state
  const getTimerColor = () => {
    if (!state) return 'text-slate-400';
    const effectiveRemaining =
      typeof displayRemaining === 'number' && Number.isFinite(displayRemaining)
        ? displayRemaining
        : state.remaining;
    if (state.timerState === 'running') {
      if (typeof effectiveRemaining === 'number' && effectiveRemaining < 0) return 'text-red-500';
      if (typeof effectiveRemaining === 'number' && effectiveRemaining < 30) return 'text-yellow-500';
      return 'text-emerald-500';
    }
    if (state.timerState === 'paused') return 'text-yellow-500';
    return 'text-slate-400';
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-slate-900/95 backdrop-blur border-b border-slate-800 p-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
          >
            <span>←</span>
            <span>Înapoi</span>
          </button>

          <div className="flex items-center gap-3">
            <span
              className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-red-500'} ${connected ? 'animate-pulse' : ''}`}
            />
            <span className="text-slate-400 text-sm">{connected ? 'Live' : 'Deconectat'}</span>
          </div>
        </div>
      </header>

      {/* Error banner */}
      {error && (
        <div className="bg-red-900/50 border-b border-red-500 p-4 text-center text-red-200">
          {error}
          <button
            onClick={() => {
              setError(null);
              setReconnectAttempts(0);
              connect();
            }}
            className="ml-4 underline hover:text-red-100"
          >
            Reîncearcă
          </button>
        </div>
      )}

      {/* Main content */}
      <main className="max-w-4xl mx-auto p-6">
        {!state ? (
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-slate-400">
            <div className="animate-spin text-4xl mb-4">⟳</div>
            <p>Se încarcă...</p>
          </div>
        ) : !state.initiated ? (
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-slate-400">
            <div className="text-6xl mb-4">🏔️</div>
            <p className="text-xl">Această categorie nu a început încă</p>
            <button
              onClick={handleRefresh}
              className="mt-6 px-6 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
            >
              Actualizează
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Category title */}
            <div className="text-center">
              <h1 className="text-3xl font-bold text-white">
                {state.categorie || `Box ${boxId}`}
              </h1>
              <p className="text-slate-400 mt-1">
                Ruta {state.routeIndex}
                {state.routesCount && state.routesCount > 1 && ` / ${state.routesCount}`}
              </p>
            </div>

            {/* Current climber card */}
            <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-8">
              <div className="text-center">
                <div className="text-slate-400 text-sm mb-2">Catără acum</div>
                <div className="text-4xl font-bold text-white mb-6">
                  🧗 {state.currentClimber || '—'}
                </div>

                {/* Timer */}
                <div className={`text-6xl font-mono font-bold ${getTimerColor()} mb-6`}>
                  {formatTime(
                    typeof displayRemaining === 'number' && Number.isFinite(displayRemaining)
                      ? displayRemaining
                      : state.remaining,
                  )}
                </div>

                {/* Timer state badge */}
                <div className="mb-6">
                  {state.timerState === 'running' && (
                    <span className="inline-flex items-center gap-2 px-4 py-1 bg-emerald-900/50 text-emerald-400 rounded-full text-sm">
                      <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                      În desfășurare
                    </span>
                  )}
                  {state.timerState === 'paused' && (
                    <span className="px-4 py-1 bg-yellow-900/50 text-yellow-400 rounded-full text-sm">
                      Pauză
                    </span>
                  )}
                  {state.timerState === 'idle' && (
                    <span className="px-4 py-1 bg-slate-700 text-slate-400 rounded-full text-sm">
                      În așteptare
                    </span>
                  )}
                </div>

                {/* Holds progress */}
                {renderHoldsProgress()}
              </div>
            </div>

            {/* Preparing climber */}
            {state.preparingClimber && (
              <div className="bg-slate-800/30 rounded-xl border border-slate-700 p-6 text-center">
                <div className="text-slate-400 text-sm mb-1">Urmează</div>
                <div className="text-xl text-white">👤 {state.preparingClimber}</div>
              </div>
            )}

            {/* Time criterion indicator */}
            {state.timeCriterionEnabled && (
              <div className="text-center text-slate-400 text-sm">
                ⏱️ Timpii sunt înregistrați pentru departajare
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default PublicLiveClimbing;
