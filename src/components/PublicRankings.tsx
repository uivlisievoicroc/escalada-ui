import React, { FC, useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSpectatorToken, clearSpectatorToken } from './PublicHub';

const API_PROTOCOL = window.location.protocol === 'https:' ? 'https' : 'http';
const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss' : 'ws';
const API_BASE = `${API_PROTOCOL}://${window.location.hostname}:8000/api/public`;
const WS_URL = `${WS_PROTOCOL}://${window.location.hostname}:8000/api/public/ws`;

const MAX_RECONNECT_ATTEMPTS = 10;

type PublicBox = {
  boxId: number;
  categorie: string;
  initiated: boolean;
  routeIndex: number;
  routesCount?: number | null;
  holdsCount?: number | null;
  holdsCounts?: number[] | null;
  currentClimber?: string | null;
  preparingClimber?: string | null;
  timerState?: string | null;
  remaining?: number | null;
  timeCriterionEnabled?: boolean | null;
  scoresByName?: Record<string, Array<number | null | undefined>>;
  timesByName?: Record<string, Array<number | null | undefined>>;
};

type RankingRow = {
  rank: number;
  nume: string;
  total: number;
  scores: Array<number | undefined>;
};

type RankInfo = {
  nume: string;
  score: number;
};

const normalizeNumericArray = (
  arr: Array<number | null | undefined>,
): Array<number | undefined> =>
  Array.isArray(arr) ? arr.map((value) => (typeof value === 'number' ? value : undefined)) : [];

const normalizeNumericRecord = (
  record?: Record<string, Array<number | null | undefined>>,
): Record<string, Array<number | undefined>> => {
  if (!record || typeof record !== 'object') return {};
  const normalized: Record<string, Array<number | undefined>> = {};
  Object.entries(record).forEach(([key, arr]) => {
    normalized[key] = normalizeNumericArray(arr);
  });
  return normalized;
};

const calcRankPointsPerRoute = (
  scoresByName: Record<string, Array<number | null | undefined>>,
  nRoutes: number,
): { rankPoints: Record<string, (number | undefined)[]>; nCompetitors: number } => {
  const rankPoints: Record<string, (number | undefined)[]> = {};
  let nCompetitors = 0;

  for (let r = 0; r < nRoutes; r++) {
    const list: RankInfo[] = [];
    Object.entries(scoresByName).forEach(([nume, arr]) => {
      const score = arr?.[r];
      if (typeof score !== 'number' || !Number.isFinite(score)) return;
      list.push({ nume, score });
    });

    list.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.nume.localeCompare(b.nume, undefined, { sensitivity: 'base' });
    });

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
      const avgRank = (first + last) / 2;
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

const geomMean = (arr: (number | undefined)[], nRoutes: number, nCompetitors: number): number => {
  const filled = arr.map((v) => v ?? nCompetitors + 1);
  if (filled.length < nRoutes) {
    while (filled.length < nRoutes) filled.push(nCompetitors + 1);
  }
  const prod = filled.reduce((p, x) => p * x, 1);
  return Number(Math.pow(prod, 1 / nRoutes).toFixed(3));
};

const buildRankingRows = (box: PublicBox): RankingRow[] => {
  const routesCount = Math.max(
    1,
    Number(box.routesCount || 0),
    Number(box.routeIndex || 0),
    Array.isArray(box.holdsCounts) ? box.holdsCounts.length : 0,
  );
  const scores = box.scoresByName || {};
  const { rankPoints, nCompetitors } = calcRankPointsPerRoute(scores, routesCount);

  const baseRows = Object.keys(rankPoints).map((nume) => {
    const rp = rankPoints[nume];
    const raw = (scores[nume] || []).map((value) =>
      typeof value === 'number' ? value : undefined,
    );
    return {
      rank: 0,
      nume,
      total: geomMean(rp, routesCount, nCompetitors),
      scores: raw,
    };
  });

  baseRows.sort((a, b) => a.total - b.total);
  baseRows.forEach((row, idx) => {
    row.rank = idx + 1;
  });

  return baseRows;
};

const PublicRankings: FC = () => {
  const navigate = useNavigate();
  const [boxes, setBoxes] = useState<PublicBox[]>([]);
  const [selectedBoxId, setSelectedBoxId] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);

  // Fetch initial data
  const fetchInitialData = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/rankings`);
      if (response.ok) {
        const data = await response.json();
        setBoxes(data.boxes || []);
        setSelectedBoxId((prev) => {
          if (prev != null) return prev;
          const initiated = data.boxes?.find((b: PublicBox) => b.initiated);
          return initiated ? initiated.boxId : null;
        });
      }
    } catch (err) {
      console.error('Failed to fetch rankings:', err);
    }
  }, []);

  // WebSocket connection for live updates
  const connectWs = useCallback(async () => {
    try {
      const token = await getSpectatorToken();
      const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
        setReconnectAttempts(0);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'PING') {
            ws.send(JSON.stringify({ type: 'PONG' }));
            return;
          }

          if (data.type === 'PUBLIC_STATE_SNAPSHOT' && Array.isArray(data.boxes)) {
            setBoxes(data.boxes);
          } else if (
            ['BOX_STATUS_UPDATE', 'BOX_FLOW_UPDATE', 'BOX_RANKING_UPDATE'].includes(data.type) &&
            data.box
          ) {
            setBoxes((prev) => {
              const idx = prev.findIndex((b) => b.boxId === data.box.boxId);
              if (idx >= 0) {
                const updated = [...prev];
                updated[idx] = { ...updated[idx], ...data.box };
                return updated;
              }
              return [...prev, data.box];
            });
          }
        } catch (err) {
          console.error('Failed to parse WS message:', err);
        }
      };

      ws.onerror = () => {
        // Some browsers fire transient WS error events during reconnects.
        // Avoid flashing an error banner unless we actually give up reconnecting.
        console.warn('Public rankings WS error');
      };

      ws.onclose = (ev) => {
        console.log(ev.code, ev.reason);
        setConnected(false);
        const attempt = reconnectAttemptsRef.current;
        if (attempt < MAX_RECONNECT_ATTEMPTS) {
          const delay = 1000 * Math.pow(2, attempt);
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current = reconnectAttemptsRef.current + 1;
            setReconnectAttempts(reconnectAttemptsRef.current);
            connectWs();
          }, delay);
        } else {
          setError('Connection lost. Please refresh the page.');
        }
      };
    } catch (err) {
      if (err instanceof Error && err.message?.includes('token')) {
        clearSpectatorToken();
      }
      setError('Unable to connect.');
    }
  }, []);

  useEffect(() => {
    fetchInitialData();
    connectWs();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [fetchInitialData, connectWs]);

  const initiatedBoxes = boxes.filter((b) => b.initiated);
  const selectedBox = initiatedBoxes.find((b) => b.boxId === selectedBoxId);
  const rankings = selectedBox ? buildRankingRows(selectedBox) : [];

  const handleBack = () => {
    navigate('/public');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-slate-900/95 backdrop-blur border-b border-slate-800 p-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
          >
            <span>←</span>
            <span>Înapoi</span>
          </button>

          <h1 className="text-xl font-bold text-white">🏆 Live Rankings</h1>

          <div className="flex items-center gap-3">
            <span
              className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-red-500'} ${connected ? 'animate-pulse' : ''}`}
            />
            <span className="text-slate-400 text-sm">{connected ? 'Live' : 'Offline'}</span>
          </div>
        </div>
      </header>

      {/* Category tabs */}
      {initiatedBoxes.length > 0 && (
        <div className="border-b border-slate-800 bg-slate-900/50">
          <div className="max-w-6xl mx-auto px-4 flex gap-2 overflow-x-auto py-2">
            {initiatedBoxes.map((box) => (
              <button
                key={box.boxId}
                onClick={() => setSelectedBoxId(box.boxId)}
                className={`px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${
                  selectedBoxId === box.boxId
                    ? 'bg-cyan-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {box.categorie || `Box ${box.boxId}`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-900/50 border-b border-red-500 p-4 text-center text-red-200">
          {error}
        </div>
      )}

      {/* Main content */}
      <main className="max-w-6xl mx-auto p-6">
        {initiatedBoxes.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-slate-400">
            <div className="text-6xl mb-4">🏔️</div>
            <p className="text-xl">Nicio categorie activă momentan</p>
          </div>
        ) : !selectedBox ? (
          <div className="text-center text-slate-400">
            Selectează o categorie pentru a vedea clasamentul
          </div>
        ) : rankings.length === 0 ? (
          <div className="text-center text-slate-400 py-12">
            <p>Niciun rezultat încă pentru această categorie</p>
          </div>
        ) : (
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-700/50 text-left">
                  <th className="px-4 py-3 text-slate-300 font-medium w-16">#</th>
                  <th className="px-4 py-3 text-slate-300 font-medium">Nume</th>
                  <th className="px-4 py-3 text-slate-300 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {rankings.map((row, idx) => (
                  <tr
                    key={row.nume}
                    className={`border-t border-slate-700 ${idx < 3 ? 'bg-yellow-900/10' : ''}`}
                  >
                    <td className="px-4 py-3">
                      {row.rank === 1 && <span className="text-2xl">🥇</span>}
                      {row.rank === 2 && <span className="text-2xl">🥈</span>}
                      {row.rank === 3 && <span className="text-2xl">🥉</span>}
                      {row.rank > 3 && <span className="text-slate-400">{row.rank}</span>}
                    </td>
                    <td className="px-4 py-3 text-white font-medium">{row.nume}</td>
                    <td className="px-4 py-3 text-right text-cyan-400 font-mono">
                      {row.total.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
};

export default PublicRankings;
