import React, { FC, useEffect, useMemo, useState } from 'react';
import { sanitizeBoxName, sanitizeCompetitorName } from '../utilis/sanitize';

export type PublicBox = {
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

export const normalizeBox = (box: PublicBox): PublicBox => ({
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
    const raw = (scores[nume] || []).map((value) => (typeof value === 'number' ? value : undefined));
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

export const RankingsHeaderCard: FC<{ isWsConnected: boolean }> = ({ isWsConnected }) => (
  <header className="flex flex-col gap-2 rounded-2xl border border-slate-800 bg-slate-900/40 px-4 py-3 backdrop-blur md:flex-row md:items-center md:justify-between md:gap-4">
    <div className="flex items-end justify-between gap-3 md:block">
      <div className="text-3xl font-semibold tracking-tight md:text-4xl">Rankings</div>
      <div className="text-sm text-slate-400">Public live scoreboard</div>
    </div>

    <div className="flex flex-wrap items-center gap-2">
      <div
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
          isWsConnected
            ? 'border-cyan-400/30 bg-cyan-500/10 text-cyan-200'
            : 'border-amber-400/30 bg-amber-500/10 text-amber-200'
        }`}
      >
        <span
          className={`h-2 w-2 rounded-full ${
            isWsConnected ? 'bg-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.7)]' : 'bg-amber-300'
          }`}
        />
        {isWsConnected ? 'Live (WS)' : 'Polling'}
      </div>
    </div>
  </header>
);

type RankingsBoardProps = {
  boxes: Record<number, PublicBox>;
  selectedBoxId: number | null;
  setSelectedBoxId: React.Dispatch<React.SetStateAction<number | null>>;
};

const RankingsBoard: FC<RankingsBoardProps> = ({ boxes, selectedBoxId, setSelectedBoxId }) => {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    try {
      return window.matchMedia?.('(max-width: 768px)')?.matches ?? false;
    } catch {
      return false;
    }
  });
  const [pageIndex, setPageIndex] = useState(0);

  useEffect(() => {
    let mql: MediaQueryList | null = null;
    try {
      mql = window.matchMedia('(max-width: 768px)');
    } catch {
      mql = null;
    }
    if (!mql) return;

    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mql.matches);
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', onChange);
      return () => mql?.removeEventListener('change', onChange);
    }
    // Safari < 14
    // eslint-disable-next-line deprecation/deprecation
    mql.addListener(onChange);
    return () => {
      // eslint-disable-next-line deprecation/deprecation
      mql?.removeListener(onChange);
    };
  }, []);

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
    const stillValid =
      selectedBoxId != null && initiatedBoxes.some((b) => b.boxId === selectedBoxId);
    if (!stillValid) {
      setSelectedBoxId(initiatedBoxes[0].boxId);
    }
  }, [initiatedBoxes, selectedBoxId, setSelectedBoxId]);

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

  const rowsPerPage = useMemo(() => {
    if (isMobile) return Math.max(1, rankingRows.length);
    return window.innerHeight >= 950 ? 12 : 10;
  }, [isMobile, rankingRows.length]);

  const pageCount = useMemo(() => {
    if (isMobile) return 1;
    return Math.max(1, Math.ceil(rankingRows.length / rowsPerPage));
  }, [isMobile, rankingRows.length, rowsPerPage]);

  useEffect(() => {
    setPageIndex(0);
  }, [selectedBoxId, rowsPerPage]);

  useEffect(() => {
    setPageIndex((prev) => Math.min(prev, Math.max(0, pageCount - 1)));
  }, [pageCount]);

  useEffect(() => {
    if (isMobile) return;
    if (pageCount <= 1) return;

    const id = window.setInterval(() => {
      setPageIndex((prev) => (prev + 1) % pageCount);
    }, 12000);

    return () => window.clearInterval(id);
  }, [isMobile, pageCount]);

  const visibleRows = useMemo(() => {
    if (isMobile) return rankingRows;
    const start = pageIndex * rowsPerPage;
    const end = start + rowsPerPage;
    return rankingRows.slice(start, end);
  }, [isMobile, pageIndex, rankingRows, rowsPerPage]);

  const pageStartIndex = isMobile ? 0 : pageIndex * rowsPerPage;

  const MiniCard: FC<{ label: string; value: React.ReactNode; right?: React.ReactNode }> = ({
    label,
    value,
    right,
  }) => (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/35 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
        {right}
      </div>
      <div className="mt-1 text-sm font-semibold text-slate-50">{value}</div>
    </div>
  );

  return (
    <>
      <section className="rounded-2xl border border-slate-800 bg-slate-900/35 px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Initiated categories
          </div>
          <div className="text-xs text-slate-500">{initiatedBoxes.length} active</div>
        </div>
        {initiatedBoxes.length === 0 ? (
          <div className="mt-2 rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-sm text-slate-300">
            No initiated categories yet.
          </div>
        ) : (
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {initiatedBoxes.map((box) => {
              const active = selectedBoxId === box.boxId;
              return (
                <button
                  key={box.boxId}
                  type="button"
                  onClick={() => setSelectedBoxId(box.boxId)}
                  className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-cyan-400/40 ${
                    active
                      ? 'border-cyan-400/40 bg-cyan-500/15 text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.12)]'
                      : 'border-slate-800 bg-slate-950/20 text-slate-200 hover:bg-slate-900/50'
                  }`}
                >
                  {sanitizeBoxName(box.categorie || `Box ${box.boxId}`)}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {selectedBox ? (
        <main className="flex min-h-0 flex-1 flex-col gap-3 md:grid md:grid-cols-[360px_1fr] md:gap-4">
          <aside className="flex flex-col gap-3 md:min-h-0">
            <div className="grid grid-cols-3 gap-2">
              <MiniCard
                label="Category"
                right={
                  <span className="text-[10px] text-slate-500 font-mono">#{selectedBox.boxId}</span>
                }
                value={
                  <span
                    className="block truncate"
                    title={sanitizeBoxName(selectedBox.categorie || `Box ${selectedBox.boxId}`)}
                  >
                    {sanitizeBoxName(selectedBox.categorie || `Box ${selectedBox.boxId}`)}
                  </span>
                }
              />
              <MiniCard
                label="Current"
                value={
                  <span
                    className="block truncate"
                    title={sanitizeCompetitorName(selectedBox.currentClimber || '—')}
                  >
                    {sanitizeCompetitorName(selectedBox.currentClimber || '—')}
                  </span>
                }
              />
              <MiniCard
                label="Route"
                right={
                  <span className="text-[10px] text-slate-500">
                    {selectedBox.timeCriterionEnabled ? 'Time ON' : 'Time OFF'}
                  </span>
                }
                value={
                  <span className="font-mono text-lg tracking-tight md:text-2xl">
                    {selectedBox.routeIndex}
                    <span className="text-slate-500">/</span>
                    {selectedBox.routesCount || totalRoutes}
                  </span>
                }
              />
            </div>
          </aside>

          <section className="min-h-0 rounded-2xl border border-slate-800 bg-slate-900/35 p-3 md:p-4">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-100">Standings</div>
                <div className="text-xs text-slate-400">
                  {rankingRows.length === 0 ? 'No scores yet' : `${rankingRows.length} competitors`}
                </div>
              </div>
              {!isMobile && pageCount > 1 && (
                <div className="text-xs text-slate-400">
                  Page <span className="font-mono">{pageIndex + 1}</span>
                  <span className="text-slate-600">/</span>
                  <span className="font-mono">{pageCount}</span>
                </div>
              )}
            </div>

            <div className="md:overflow-hidden overflow-x-auto">
              <div
                className="grid gap-2 rounded-xl border border-slate-800 bg-slate-950/40 px-2 py-2 text-xs font-semibold text-slate-200"
                style={{
                  gridTemplateColumns: `minmax(220px, 1.8fr) repeat(${totalRoutes}, minmax(70px, 1fr)) 96px`,
                }}
              >
                <span className="px-2">Ranking</span>
                {Array.from({ length: totalRoutes }).map((_, i) => (
                  <span key={i} className="px-2 text-right">
                    R{i + 1}
                  </span>
                ))}
                <span className="px-2 text-right">
                  <span className="inline-flex items-center gap-2 rounded-full bg-rose-500/10 px-2 py-1 text-rose-200">
                    Total
                  </span>
                </span>
              </div>

              <div className="mt-2 md:overflow-hidden max-h-[65vh] md:max-h-none overflow-y-auto">
                {rankingRows.length === 0 ? (
                  <div className="rounded-xl border border-slate-800 bg-slate-950/30 px-4 py-4 text-sm text-slate-300">
                    No scores yet.
                  </div>
                ) : (
                  visibleRows.map((row, localIndex) => {
                    const globalIndex = pageStartIndex + localIndex;
                    const showTime = !!selectedBox.timeCriterionEnabled && globalIndex < 3;
                    const zebra = globalIndex % 2 === 0;

                    return (
                      <div
                        key={row.nume}
                        className={`grid gap-2 rounded-xl border px-2 py-2 text-sm ${
                          zebra
                            ? 'border-slate-800 bg-slate-950/30'
                            : 'border-slate-800 bg-slate-900/25'
                        }`}
                        style={{
                          gridTemplateColumns: `minmax(220px, 1.8fr) repeat(${totalRoutes}, minmax(70px, 1fr)) 96px`,
                        }}
                      >
                        <div className="px-2">
                          <div className="flex items-baseline gap-2">
                            <span
                              className={`inline-flex w-8 justify-center font-mono text-xs ${
                                row.rank === 1
                                  ? 'text-amber-200'
                                  : row.rank === 2
                                    ? 'text-slate-200'
                                    : row.rank === 3
                                      ? 'text-rose-200'
                                      : 'text-slate-400'
                              }`}
                            >
                              {row.rank}
                            </span>
                            <span className="font-medium text-slate-50">
                              {sanitizeCompetitorName(row.nume)}
                            </span>
                          </div>
                        </div>

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
                            <div
                              key={i}
                              className="px-2 text-right flex flex-col items-end justify-center leading-tight"
                            >
                              {isScoreNumber ? (
                                isTop ? (
                                  <span className="inline-flex items-center rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2 py-0.5 text-xs font-semibold text-cyan-200">
                                    TOP
                                  </span>
                                ) : (
                                  <span className="font-mono text-slate-100">
                                    {scoreVal.toFixed(1)}
                                  </span>
                                )
                              ) : (
                                <span className="text-slate-500">—</span>
                              )}

                              {showTime && typeof timeVal === 'number' && (
                                <span className="mt-0.5 text-xs font-mono text-slate-400">
                                  {formatSeconds(timeVal)}
                                </span>
                              )}
                            </div>
                          );
                        })}

                        <div className="px-2 text-right">
                          <span className="inline-flex w-full justify-end rounded-full bg-rose-500/10 px-2 py-1 font-mono text-rose-200">
                            {row.total.toFixed(3)}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </section>
        </main>
      ) : (
        <section className="rounded-2xl border border-slate-800 bg-slate-900/35 p-4">
          <div className="text-sm text-slate-300">No initiated categories yet.</div>
        </section>
      )}
    </>
  );
};

export default RankingsBoard;

