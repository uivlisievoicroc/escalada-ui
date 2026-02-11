import React, { FC, useEffect, useMemo, useState } from 'react';
import { sanitizeBoxName, sanitizeCompetitorName } from '../utilis/sanitize';

/**
 * RankingsBoard Module - Live Competition Rankings Display
 *
 * Purpose:
 * - Displays real-time competition rankings for climbing competitions
 * - Supports multi-route competitions with geometric mean ranking
 * - Responsive layout (mobile single column, desktop paginated grid)
 * - Auto-cycling pagination for public display (12-second intervals)
 *
 * Ranking Algorithm:
 * 1. Per-Route Ranking: Sort by score, handle ties with average rank
 * 2. Geometric Mean: Aggregate per-route ranks (penalizes inconsistency)
 * 3. Final Ranking: Sort by geometric mean, handle ties in final positions
 *
 * Why Geometric Mean:
 * - Penalizes inconsistency (one bad route significantly impacts rank)
 * - Standard IFSC method (International Federation of Sport Climbing)
 */

/**
 * PublicBox - Box State from Backend API
 *
 * Fields:
 * - boxId: Unique box identifier (0, 1, 2, ...)
 * - categorie: Category name (Youth, Seniors, Adults)
 * - initiated: Whether route is configured and ready
 * - routeIndex: Current route number (1-based)
 * - routesCount: Total number of routes in competition
 * - holdsCounts: Holds count per route (array, multi-route)
 * - currentClimber: Name of climber currently on wall
 * - timeCriterionEnabled: Whether time is used for ranking (top 3 tiebreaker)
 * - scoresByName: Record<name, [route1Score, route2Score, ...]>
 * - timesByName: Record<name, [route1Time, route2Time, ...]>
 */
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

/**
 * RankingRow - Computed Ranking for Single Competitor
 *
 * Fields:
 * - rank: Final rank position (1 = first place, ties have same rank)
 * - nume: Competitor name (Romanian key for legacy compatibility)
 * - raw: Array of scores per route (undefined = not yet climbed)
 * - rawTimes: Array of times per route (undefined = not yet climbed)
 * - total: Geometric mean of per-route ranks (lower is better)
 */
type RankingRow = {
  rank: number;
  nume: string;
  raw: Array<number | null | undefined>;
  rawTimes: Array<number | null | undefined>;
  total: number;
};

/**
 * RankInfo - Intermediate Per-Route Ranking
 *
 * Used internally by calcRankPointsPerRoute for sorting competitors by score.
 */
type RankInfo = {
  nume: string;
  score: number;
};

/**
 * normalizeNumericArray - Convert Mixed Array to Number | Undefined
 *
 * Purpose:
 * - Backend may send null, undefined, or non-number values
 * - Normalizes to Array<number | undefined> for consistent handling
 * - Prevents NaN issues in calculations
 */
const normalizeNumericArray = (
  arr: Array<number | null | undefined>,
): Array<number | undefined> =>
  Array.isArray(arr) ? arr.map((value) => (typeof value === 'number' ? value : undefined)) : [];

/**
 * normalizeNumericRecord - Normalize All Competitor Scores/Times
 *
 * Purpose:
 * - Applies normalizeNumericArray to all competitors in record
 * - Ensures consistent data structure for ranking calculations
 */
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

/**
 * normalizeBox - Ensure PublicBox Has Consistent Default Values
 *
 * Purpose:
 * - Backend may send null/undefined for optional fields
 * - Provides safe defaults to prevent undefined errors
 * - Normalizes scores/times to Array<number | undefined>
 *
 * Defaults Applied:
 * - routesCount: Falls back to routeIndex or 1
 * - holdsCounts: Empty array if not provided
 * - scoresByName/timesByName: Normalized via normalizeNumericRecord
 * - currentClimber/preparingClimber: Empty string instead of null
 * - timerState: 'idle' instead of null
 * - timeCriterionEnabled: Coerced to boolean
 */
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

/**
 * formatSeconds - Convert Seconds to MM:SS Format
 *
 * Purpose:
 * - Display timer values and completion times
 * - Handles invalid inputs gracefully (null, undefined, NaN)
 *
 * Format:
 * - Input: 65 → Output: "01:05"
 * - Input: 5 → Output: "00:05"
 * - Input: null → Output: "--:--"
 */
const formatSeconds = (sec: number | null | undefined): string => {
  if (typeof sec !== 'number' || Number.isNaN(sec)) return '--:--';
  const m = Math.floor(sec / 60)
    .toString()
    .padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

/**
 * calcRankPointsPerRoute - Calculate Per-Route Rankings with Tie Handling
 *
 * Purpose:
 * - Ranks competitors for each route individually
 * - Handles ties using average rank method (IFSC standard)
 * - Returns rank points for geometric mean calculation
 *
 * Tie Handling Example:
 * - Scores: [100, 90, 90, 80]
 * - Ranks: [1, 2.5, 2.5, 4] (two tied for 2nd → average of 2 and 3 = 2.5)
 *
 * Why Average Rank:
 * - Fair: Tied competitors get same advantage
 * - Standard: Used by IFSC (International Federation of Sport Climbing)
 * - Geometric mean compatible: Fractional ranks allowed
 */
const calcRankPointsPerRoute = (
  scoresByName: Record<string, Array<number | null | undefined>>,
  nRoutes: number,
): { rankPoints: Record<string, (number | undefined)[]>; nCompetitors: number } => {
  const rankPoints: Record<string, (number | undefined)[]> = {};
  let nCompetitors = 0;

  // Process each route individually
  for (let r = 0; r < nRoutes; r++) {
    const list: RankInfo[] = [];
    Object.entries(scoresByName).forEach(([nume, arr]) => {
      const score = arr?.[r];
      if (typeof score !== 'number' || !Number.isFinite(score)) return;
      list.push({ nume, score });
    });

    // Sort by score descending (highest score = rank 1)
    list.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.nume.localeCompare(b.nume, undefined, { sensitivity: 'base' });
    });

    // Assign ranks with tie handling
    let pos = 1;
    for (let i = 0; i < list.length; ) {
      const current = list[i];
      let j = i;
      // Find all competitors with same score (tie group)
      while (j < list.length && list[j].score === current.score) {
        j++;
      }
      const tieCount = j - i;
      const first = pos;
      const last = pos + tieCount - 1;
      const avgRank = (first + last) / 2;  // Average rank for ties

      // Assign average rank to all tied competitors
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

/**
 * geomMean - Calculate Geometric Mean of Per-Route Ranks
 *
 * Purpose:
 * - Aggregates per-route rankings into single total score
 * - Penalizes inconsistency (one bad route significantly impacts total)
 * - Standard IFSC ranking method
 *
 * Formula:
 * - Geometric Mean = (r1 * r2 * ... * rN)^(1/N)
 * - Example: Routes [2, 3, 4] → (2*3*4)^(1/3) = 2.884
 *
 * Missing Score Handling:
 * - undefined ranks replaced with (nCompetitors + 1)
 * - Severe penalty: Ensures missing routes rank below all present competitors
 *
 * Why Geometric Mean (vs Arithmetic):
 * - Rewards consistent performance, penalizes outliers
 * - Example: [1,1,10] geo=2.15 vs [2,3,4] geo=2.88 (consistent ranks better)
 */
const geomMean = (arr: (number | undefined)[], nRoutes: number, nCompetitors: number): number => {
  const filled = arr.map((v) => v ?? nCompetitors + 1);
  if (filled.length < nRoutes) {
    while (filled.length < nRoutes) filled.push(nCompetitors + 1);
  }
  const prod = filled.reduce((p, x) => p * x, 1);
  return Number(Math.pow(prod, 1 / nRoutes).toFixed(3));
};

/**
 * buildRankingRows - Build Complete Rankings Table
 *
 * Purpose:
 * - Combines per-route rankings into final sorted ranking table
 * - Handles ties in final ranking (same total → same rank)
 * - Returns RankingRow[] ready for display
 *
 * Steps:
 * 1. Determine total routes (max of routesCount, routeIndex, holdsCounts.length)
 * 2. Calculate per-route ranks (calcRankPointsPerRoute)
 * 3. Calculate geometric mean for each competitor (geomMean)
 * 4. Sort by geometric mean ascending (lower = better)
 * 5. Assign final ranks with tie handling
 *
 * Tie Handling in Final Ranking:
 * - Same total → same rank
 * - Example: totals [1.5, 2.2, 2.2, 3.0] → ranks [1, 2, 2, 4]
 */
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

/**
 * RankingsHeaderCard - Page Header with Connection Status
 *
 * Purpose:
 * - Displays page title ("Rankings") and subtitle
 * - Shows WebSocket connection status indicator
 * - Informs users whether data is live or polling fallback
 *
 * Connection Indicator:
 * - Live (WS): Cyan badge with glow effect (WebSocket connected)
 * - Polling: Amber badge (HTTP fallback, 5-second intervals)
 */
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

/**
 * RankingsBoardProps - Props for Main Rankings Component
 *
 * Props:
 * - boxes: All box states from WebSocket/polling
 * - selectedBoxId: Currently selected box for display (null = none)
 * - setSelectedBoxId: State setter for box selection
 */
type RankingsBoardProps = {
  boxes: Record<number, PublicBox>;
  selectedBoxId: number | null;
  setSelectedBoxId: React.Dispatch<React.SetStateAction<number | null>>;
};

/**
 * RankingsBoard Component - Main Rankings Display
 *
 * Purpose:
 * - Displays rankings table for selected competition box
 * - Responsive layout (mobile single column, desktop paginated)
 * - Auto-cycling pagination for public display (12-second intervals)
 * - Box selection via horizontal scrolling button list
 *
 * Responsive Behavior:
 * - Mobile (≤768px): Single column, all competitors visible, no pagination
 * - Desktop (>768px): Grid layout, pagination (10-12 rows), auto-cycling
 *
 * State Management:
 * - isMobile: MediaQuery listener for responsive behavior
 * - pageIndex: Current pagination page (0-based)
 * - rankingRows: Computed rankings via buildRankingRows (memoized)
 */
const RankingsBoard: FC<RankingsBoardProps> = ({ boxes, selectedBoxId, setSelectedBoxId }) => {
  // Mobile detection via MediaQuery (updates on window resize)
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    try {
      return window.matchMedia?.('(max-width: 768px)')?.matches ?? false;
    } catch {
      return false;
    }
  });
  const [pageIndex, setPageIndex] = useState(0);

  /**
   * MediaQuery Effect - Track Mobile vs Desktop Layout
   *
   * Purpose:
   * - Listens for viewport width changes
   * - Updates isMobile state (triggers layout/pagination changes)
   * - Handles Safari <14 compatibility (deprecated addListener/removeListener)
   */
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
    // Safari < 14 fallback
    // eslint-disable-next-line deprecation/deprecation
    mql.addListener(onChange);
    return () => {
      // eslint-disable-next-line deprecation/deprecation
      mql?.removeListener(onChange);
    };
  }, []);

  /**
   * Initiated Boxes - Filter and Sort
   *
   * Purpose:
   * - Only show boxes with initiated=true (configured and ready)
   * - Sort by boxId ascending (consistent order)
   */
  const initiatedBoxes = useMemo(
    () =>
      Object.values(boxes)
        .filter((box) => box.initiated)
        .sort((a, b) => a.boxId - b.boxId),
    [boxes],
  );

  /**
   * Auto-Selection Effect - Ensure Valid Box Selected
   *
   * Purpose:
   * - Auto-selects first box if none selected
   * - Resets selection if selected box becomes unavailable
   */
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
  // Compute rankings for selected box (memoized)
  const rankingRows = useMemo(() => {
    if (!selectedBox) return [];
    return buildRankingRows(selectedBox);
  }, [selectedBox]);

  // Calculate total routes for selected box
  const totalRoutes = Math.max(
    1,
    Number(selectedBox?.routesCount || 0),
    Number(selectedBox?.routeIndex || 0),
    Array.isArray(selectedBox?.holdsCounts) ? selectedBox?.holdsCounts?.length : 0,
  );

  /**
   * Rows Per Page - Responsive Pagination
   *
   * Mobile: All rows visible (no pagination)
   * Desktop: 12 rows (height ≥950px) or 10 rows (height <950px)
   */
  const rowsPerPage = useMemo(() => {
    if (isMobile) return Math.max(1, rankingRows.length);
    return window.innerHeight >= 950 ? 12 : 10;
  }, [isMobile, rankingRows.length]);

  /**
   * Page Count - Total Number of Pages
   *
   * Mobile: Always 1 page (all rows visible)
   * Desktop: Ceiling of (total rows / rows per page)
   */
  const pageCount = useMemo(() => {
    if (isMobile) return 1;
    return Math.max(1, Math.ceil(rankingRows.length / rowsPerPage));
  }, [isMobile, rankingRows.length, rowsPerPage]);

  // Reset to page 0 when box changes or rowsPerPage changes
  useEffect(() => {
    setPageIndex(0);
  }, [selectedBoxId, rowsPerPage]);

  // Clamp pageIndex to valid range when pageCount changes
  useEffect(() => {
    setPageIndex((prev) => Math.min(prev, Math.max(0, pageCount - 1)));
  }, [pageCount]);

  /**
   * Auto-Cycling Pagination - Effect
   *
   * Purpose:
   * - Automatically cycles through pages every 12 seconds
   * - Only active on desktop with multiple pages
   */
  useEffect(() => {
    if (isMobile) return;
    if (pageCount <= 1) return;

    const id = window.setInterval(() => {
      setPageIndex((prev) => (prev + 1) % pageCount);
    }, 12000);  // 12 seconds per page

    return () => window.clearInterval(id);
  }, [isMobile, pageCount]);

  // Slice rankings for current page
  const visibleRows = useMemo(() => {
    if (isMobile) return rankingRows;
    const start = pageIndex * rowsPerPage;
    const end = start + rowsPerPage;
    return rankingRows.slice(start, end);
  }, [isMobile, pageIndex, rankingRows, rowsPerPage]);

  // Global start index for zebra striping
  const pageStartIndex = isMobile ? 0 : pageIndex * rowsPerPage;

  // Render: Standings + initiated categories selector (under standings)
  return (
    <>
      <main className="flex min-h-0 flex-1 flex-col gap-3 md:gap-4">
        {/* Standings (hidden until a box is selected) */}
        {selectedBox && (
          <section className="min-h-0 rounded-2xl border border-slate-800 bg-slate-900/35 p-3 md:p-4">
            {/* Table header - Title + pagination info */}
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-100">Standings</div>
                <div className="text-xs text-slate-400">
                  {rankingRows.length === 0 ? 'No scores yet' : `${rankingRows.length} competitors`}
                </div>
              </div>
              {/* Pagination indicator (desktop only, multiple pages only) */}
              {!isMobile && pageCount > 1 && (
                <div className="text-xs text-slate-400">
                  Page <span className="font-mono">{pageIndex + 1}</span>
                  <span className="text-slate-600">/</span>
                  <span className="font-mono">{pageCount}</span>
                </div>
              )}
            </div>

            {/* Rankings table container (horizontal scroll on mobile) */}
            <div className="md:overflow-hidden overflow-x-auto">
              {/* Table header row - Column labels */}
              <div
                className="grid gap-2 rounded-xl border border-slate-800 bg-slate-950/40 px-2 py-2 text-xs font-semibold text-slate-200"
                style={{
                  gridTemplateColumns: `minmax(220px, 1.8fr) repeat(${totalRoutes}, minmax(70px, 1fr)) 96px`,
                }}
              >
                <span className="px-2">Ranking</span>
                {/* Route columns: R1, R2, R3, ... */}
                {Array.from({ length: totalRoutes }).map((_, i) => (
                  <span key={i} className="px-2 text-right">
                    R{i + 1}
                  </span>
                ))}
                {/* Total column: Geometric mean */}
                <span className="px-2 text-right">
                  <span className="inline-flex items-center gap-2 rounded-full bg-rose-500/10 px-2 py-1 text-rose-200">
                    Total
                  </span>
                </span>
              </div>

              {/* Table body - Ranking rows */}
              <div className="mt-2 md:overflow-hidden max-h-[65vh] md:max-h-none overflow-y-auto">
                {rankingRows.length === 0 ? (
                  <div className="rounded-xl border border-slate-800 bg-slate-950/30 px-4 py-4 text-sm text-slate-300">
                    No scores yet.
                  </div>
                ) : (
                  visibleRows.map((row, localIndex) => {
                    const globalIndex = pageStartIndex + localIndex;  // Global index for zebra striping
                    const showTime = !!selectedBox.timeCriterionEnabled && globalIndex < 3;  // Show time for top 3
                    const zebra = globalIndex % 2 === 0;  // Zebra striping (alternating colors)

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
                        {/* Rank + Name column */}
                        <div className="px-2">
                          <div className="flex items-baseline gap-2">
                            {/* Rank number - Colored for top 3 */}
                            <span
                              className={`inline-flex w-8 justify-center font-mono text-xs ${
                                row.rank === 1
                                  ? 'text-amber-200'  // Gold for 1st
                                  : row.rank === 2
                                    ? 'text-slate-200'  // Silver for 2nd
                                    : row.rank === 3
                                      ? 'text-rose-200'  // Bronze for 3rd
                                      : 'text-slate-400'  // Gray for others
                              }`}
                            >
                              {row.rank}
                            </span>
                            {/* Competitor name */}
                            <span className="font-medium text-slate-50">
                              {sanitizeCompetitorName(row.nume)}
                            </span>
                          </div>
                        </div>

                        {/* Per-route score columns */}
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
                            scoreVal === Number(maxHolds);  // Check if TOP (all holds)

                          return (
                            <div
                              key={i}
                              className="px-2 text-right flex flex-col items-end justify-center leading-tight"
                            >
                              {/* Score display */}
                              {isScoreNumber ? (
                                isTop ? (
                                  // TOP badge - Completed route (all holds)
                                  <span className="inline-flex items-center rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2 py-0.5 text-xs font-semibold text-cyan-200">
                                    TOP
                                  </span>
                                ) : (
                                  // Numeric score - Partial completion
                                  <span className="font-mono text-slate-100">
                                    {scoreVal.toFixed(1)}
                                  </span>
                                )
                              ) : (
                                // No score yet - Em dash
                                <span className="text-slate-500">—</span>
                              )}

                              {/* Time display (top 3 only if time criterion enabled) */}
                              {showTime && typeof timeVal === 'number' && (
                                <span className="mt-0.5 text-xs font-mono text-slate-400">
                                  {formatSeconds(timeVal)}
                                </span>
                              )}
                            </div>
                          );
                        })}

                        {/* Total column - Geometric mean */}
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
        )}

        {/* Initiated categories selector (moved under Standings) */}
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
      </main>
    </>
  );
};

export default RankingsBoard;
