import React, { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sanitizeBoxName, sanitizeCompetitorName } from '../utilis/sanitize';

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
  raw: Array<number | null | undefined>;
  rawTimes: Array<number | null | undefined>;
  total: number;
};

type RankInfo = {
  nume: string;
  score: number;
};

const API_PROTOCOL = window.location.protocol === 'https:' ? 'https' : 'http';
const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss' : 'ws';
const API_BASE = `${API_PROTOCOL}://${window.location.hostname}:8000/api/public`;
const WS_URL = `${WS_PROTOCOL}://${window.location.hostname}:8000/api/public/ws`;
const POLL_INTERVAL_MS = 5000;

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

const normalizeBox = (box: PublicBox): PublicBox => ({
  ...box,
  routesCount: box.routesCount ?? box.routeIndex ?? 1,
  holdsCounts: Array.isArray(box.holdsCounts) ? box.holdsCounts : [],
  scoresByName: normalizeNumericRecord(box.scoresByName),
  timesByName: normalizeNumericRecord(box.timesByName),
  currentClimber: box.currentClimber || '',
  preparingClimber: box.preparingClimber || '',
  timerState: box.timerState || 'idle',
  remaining: typeof box.remaining === 'number' ? box.remaining : null,
  timeCriterionEnabled: !!box.timeCriterionEnabled,
});

const formatSeconds = (sec: number | null | undefined): string => {
  if (typeof sec !== 'number' || Number.isNaN(sec)) return '--:--';
  const m = Math.floor(sec / 60)
    .toString()
    .padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
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
  const times = box.timesByName || {};
  const { rankPoints, nCompetitors } = calcRankPointsPerRoute(scores, routesCount);
  const baseRows = Object.keys(rankPoints).map((nume) => {
    const rp = rankPoints[nume];
    const raw = (scores[nume] || []).map((value) =>
      typeof value === 'number' ? value : undefined,
    );
    const rawTimes = (times[nume] || []).map((value) =>
      typeof value === 'number' ? value : undefined,
    );
    const total = geomMean(rp, routesCount, nCompetitors);
    return { nume, raw, rawTimes, total };
  });

  baseRows.sort((a, b) => {
    if (a.total !== b.total) return a.total - b.total;
    return a.nume.localeCompare(b.nume, undefined, { sensitivity: 'base' });
  });

  const withRank: RankingRow[] = [];
  let prevTotal: number | null = null;
  let prevRank = 0;
  baseRows.forEach((row, idx) => {
    const rank = row.total === prevTotal ? prevRank : idx + 1;
    withRank.push({ ...row, rank });
    prevTotal = row.total;
    prevRank = rank;
  });

  return withRank;
};

const RankingsPage: FC = () => {
  const [boxes, setBoxes] = useState<Record<number, PublicBox>>({});
  const [selectedBoxId, setSelectedBoxId] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<number | null>(null);
  const pollingRef = useRef<number | null>(null);
  const closedRef = useRef(false);

  const applySnapshot = useCallback((payloadBoxes: PublicBox[]) => {
    const next: Record<number, PublicBox> = {};
    payloadBoxes.forEach((box) => {
      if (typeof box?.boxId !== 'number') return;
      next[box.boxId] = normalizeBox(box);
    });
    setBoxes(next);
  }, []);

  const applyBoxUpdate = useCallback((box: PublicBox) => {
    if (typeof box?.boxId !== 'number') return;
    setBoxes((prev) => ({
      ...prev,
      [box.boxId]: normalizeBox(box),
    }));
  }, []);

  const fetchSnapshot = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/rankings`);
      if (!res.ok) return;
      const data = await res.json();
      if (data?.type === 'PUBLIC_STATE_SNAPSHOT' && Array.isArray(data.boxes)) {
        applySnapshot(data.boxes);
      }
    } catch {
      // ignore poll errors
    }
  }, [applySnapshot]);

  const startPolling = useCallback(() => {
    if (pollingRef.current) return;
    fetchSnapshot();
    pollingRef.current = window.setInterval(fetchSnapshot, POLL_INTERVAL_MS);
  }, [fetchSnapshot]);

  const stopPolling = useCallback(() => {
    if (!pollingRef.current) return;
    window.clearInterval(pollingRef.current);
    pollingRef.current = null;
  }, []);

  const connectWs = useCallback(() => {
    if (closedRef.current) return;
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // ignore
      }
    }
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      stopPolling();
      try {
        ws.send(JSON.stringify({ type: 'REQUEST_STATE' }));
      } catch {
        // ignore
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg?.type === 'PING') {
          ws.send(JSON.stringify({ type: 'PONG', timestamp: msg.timestamp }));
          return;
        }
        if (msg?.type === 'PUBLIC_STATE_SNAPSHOT' && Array.isArray(msg.boxes)) {
          applySnapshot(msg.boxes);
          return;
        }
        if (
          (msg?.type === 'BOX_STATUS_UPDATE' ||
            msg?.type === 'BOX_FLOW_UPDATE' ||
            msg?.type === 'BOX_RANKING_UPDATE') &&
          msg.box
        ) {
          applyBoxUpdate(msg.box);
        }
      } catch {
        // ignore malformed
      }
    };

    ws.onerror = () => {
      startPolling();
    };

    ws.onclose = () => {
      startPolling();
      if (!closedRef.current) {
        reconnectRef.current = window.setTimeout(connectWs, 2000);
      }
    };
  }, [applyBoxUpdate, applySnapshot, startPolling, stopPolling]);

  useEffect(() => {
    closedRef.current = false;
    connectWs();
    return () => {
      closedRef.current = true;
      stopPolling();
      if (reconnectRef.current) {
        window.clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // ignore
        }
      }
    };
  }, [connectWs, stopPolling]);

  const initiatedBoxes = useMemo(
    () =>
      Object.values(boxes)
        .filter((box) => box.initiated)
        .sort((a, b) => a.boxId - b.boxId),
    [boxes],
  );

  useEffect(() => {
    if (initiatedBoxes.length === 0) {
      setSelectedBoxId(null);
      return;
    }
    const stillValid = selectedBoxId != null && initiatedBoxes.some((b) => b.boxId === selectedBoxId);
    if (!stillValid) {
      setSelectedBoxId(initiatedBoxes[0].boxId);
    }
  }, [initiatedBoxes, selectedBoxId]);

  const selectedBox = selectedBoxId != null ? boxes[selectedBoxId] : null;
  const rankingRows = useMemo(() => {
    if (!selectedBox) return [];
    return buildRankingRows(selectedBox);
  }, [selectedBox]);

  const totalRoutes = Math.max(
    1,
    Number(selectedBox?.routesCount || 0),
    Number(selectedBox?.routeIndex || 0),
    Array.isArray(selectedBox?.holdsCounts) ? selectedBox?.holdsCounts?.length : 0,
  );

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto space-y-4">
        <header className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
          <div className="text-2xl font-semibold">Rankings</div>
          <div className="text-sm text-slate-600">Live standings for initiated categories.</div>
        </header>

        {selectedBox ? (
          <section className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold">
                  {sanitizeBoxName(selectedBox.categorie || `Box ${selectedBox.boxId}`)}
                </div>
                <div className="text-xs text-slate-500">
                  Route {selectedBox.routeIndex}/{selectedBox.routesCount || totalRoutes} •
                  Preparing for climbing: {sanitizeCompetitorName(selectedBox.preparingClimber || '—')}
                </div>
              </div>
              <div className="text-sm text-slate-600">
                Timer: <span className="font-mono">{formatSeconds(selectedBox.remaining)}</span> (
                {selectedBox.timerState || 'idle'})
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Current climber</div>
                <div className="text-xl font-semibold">
                  {selectedBox.currentClimber || '—'}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Time display</div>
                <div className="text-sm text-slate-700">
                  {selectedBox.timeCriterionEnabled ? 'Shown for top 3' : 'Hidden'}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <div
                className="grid gap-2 divide-x divide-gray-200 font-semibold border-b border-gray-200 pb-2 mb-2"
                style={{ gridTemplateColumns: `1fr repeat(${totalRoutes}, 1fr) 90px` }}
              >
                <span className="px-2">Ranking</span>
                {Array.from({ length: totalRoutes }).map((_, i) => (
                  <span key={i} className="px-2 text-right">
                    Score(T{i + 1})
                  </span>
                ))}
                <span className="px-2 text-right text-red-600">Total</span>
              </div>
              <div className="max-h-[65vh] overflow-y-auto">
                {rankingRows.length === 0 ? (
                  <div className="text-sm text-slate-500 px-2 py-3">No scores yet.</div>
                ) : (
                  rankingRows.map((row, rowIndex) => {
                    const showTime = !!selectedBox.timeCriterionEnabled && rowIndex < 3;
                    return (
                      <div
                        key={row.nume}
                        className="grid gap-2 divide-x divide-gray-100 py-2 text-sm"
                        style={{ gridTemplateColumns: `1fr repeat(${totalRoutes}, 1fr) 90px` }}
                      >
                        <span className="px-2 font-medium">
                          {row.rank}. {sanitizeCompetitorName(row.nume)}
                        </span>
                        {Array.from({ length: totalRoutes }).map((_, i) => {
                          const scoreVal = row.raw[i];
                          const timeVal = row.rawTimes[i];
                          const maxHolds = Array.isArray(selectedBox.holdsCounts)
                            ? selectedBox.holdsCounts?.[i]
                            : undefined;
                          const isScoreNumber =
                            typeof scoreVal === 'number' && Number.isFinite(scoreVal);
                          const isTop =
                            isScoreNumber &&
                            typeof maxHolds === 'number' &&
                            scoreVal === Number(maxHolds);
                          return (
                            <span key={i} className="px-2 text-right flex flex-col items-end leading-tight">
                              {isScoreNumber ? (isTop ? 'Top' : scoreVal.toFixed(1)) : '—'}
                              {showTime && typeof timeVal === 'number' && (
                                <span className="text-xs text-slate-500">
                                  {formatSeconds(timeVal)}
                                </span>
                              )}
                            </span>
                          );
                        })}
                        <span className="px-2 text-right font-mono text-red-600">
                          {row.total.toFixed(3)}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </section>
        ) : (
          <section className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
            <div className="text-sm text-slate-500">No initiated categories yet.</div>
          </section>
        )}

        <section className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
          <div className="text-sm font-semibold text-slate-700 mb-3">Initiated categories</div>
          {initiatedBoxes.length === 0 ? (
            <div className="text-sm text-slate-500">No initiated categories yet.</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {initiatedBoxes.map((box) => {
                const active = selectedBoxId === box.boxId;
                return (
                  <button
                    key={box.boxId}
                    type="button"
                    onClick={() => setSelectedBoxId(box.boxId)}
                    className={`px-3 py-2 rounded-lg border text-sm transition ${
                      active
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {sanitizeBoxName(box.categorie || `Box ${box.boxId}`)}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default RankingsPage;
