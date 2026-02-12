import React, { FC, useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSpectatorToken, clearSpectatorToken } from './PublicHub';

/**
 * PublicRankings Module - Simplified Live Rankings Display (Legacy)
 *
 * Purpose:
 * - Displays live rankings for climbing competitions
 * - Simplified UI: Table view with rank, name, and total score
 * - WebSocket-based with exponential backoff reconnection
 * - Spectator token authentication
 *
 * Note:
 * - This is a legacy component, superseded by RankingsPage + RankingsBoard
 * - RankingsPage has pagination, auto-rotation, per-route scores, mobile detection
 * - This component kept for backwards compatibility
 *
 * Key Differences from RankingsPage/RankingsBoard:
 * - No pagination (all competitors shown in single table)
 * - No per-route score display (only final geometric mean total)
 * - No auto-rotation for public displays
 * - Simpler mobile UI (no responsive grid layout)
 * - Exponential backoff reconnection (vs fixed 2s delay)
 *
 * Architecture:
 * - WebSocket: Real-time updates via /api/public/ws
 * - Token: Spectator JWT from PublicHub (24h TTL)
 * - Reconnection: Exponential backoff up to 10 attempts
 * - Fallback: Initial HTTP fetch if WebSocket fails
 */

/**
 * API Configuration
 *
 * Protocol Detection:
 * - API_PROTOCOL: Matches page protocol (http/https for same-origin)
 * - WS_PROTOCOL: wss for https (secure WebSocket), ws for http
 *
 * Endpoints:
 * - API_BASE: HTTP REST for initial rankings fetch
 * - WS_URL: WebSocket for live updates
 *
 * Port 8000:
 * - Backend API on separate port (not served with frontend)
 * - Production: Reverse proxy (nginx) handles routing
 * - Development: Direct connection to backend
 */
const API_PROTOCOL = window.location.protocol === 'https:' ? 'https' : 'http';
const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss' : 'ws';
const API_BASE = `${API_PROTOCOL}://${window.location.hostname}:8000/api/public`;
const WS_URL = `${WS_PROTOCOL}://${window.location.hostname}:8000/api/public/ws`;

/**
 * MAX_RECONNECT_ATTEMPTS - Reconnection Limit
 *
 * Purpose:
 * - Prevents infinite reconnection loops
 * - After 10 failed attempts, show error and stop
 *
 * Exponential Backoff:
 * - Attempt 0: 1s delay (2^0 * 1000ms)
 * - Attempt 1: 2s delay
 * - Attempt 2: 4s delay
 * - Attempt 3: 8s delay
 * - ...
 * - Attempt 9: 512s delay (~8.5 minutes)
 */
const MAX_RECONNECT_ATTEMPTS = 10;

/**
 * PublicBox - Box State from Backend API
 *
 * Same structure as RankingsBoard.tsx for consistency.
 * Contains all box state fields (scores, times, timer, current climber).
 */
type PublicBox = {
  boxId: number;  // Unique box identifier
  categorie: string;  // Category name (Youth, Seniors, Adults)
  initiated: boolean;  // Whether route is configured and ready
  routeIndex: number;  // Current route number (1-based)
  routesCount?: number | null;  // Total number of routes
  holdsCount?: number | null;  // Legacy: Single route holds
  holdsCounts?: number[] | null;  // Per-route holds counts
  currentClimber?: string | null;  // Name of climber on wall
  preparingClimber?: string | null;  // Next climber preparing
  timerState?: string | null;  // Timer state (idle/running/paused)
  remaining?: number | null;  // Timer remaining seconds
  timeCriterionEnabled?: boolean | null;  // Use time for ranking
  scoresByName?: Record<string, Array<number | null | undefined>>;  // Scores per competitor per route
  timesByName?: Record<string, Array<number | null | undefined>>;  // Times per competitor per route
  timeTiebreakPreference?: 'yes' | 'no' | null;
  timeTiebreakDecisions?: Record<string, 'yes' | 'no'>;
  timeTiebreakResolvedFingerprint?: string | null;
  timeTiebreakResolvedDecision?: 'yes' | 'no' | null;
  prevRoundsTiebreakPreference?: 'yes' | 'no' | null;
  prevRoundsTiebreakDecisions?: Record<string, 'yes' | 'no'>;
  prevRoundsTiebreakOrders?: Record<string, string[]>;
  prevRoundsTiebreakResolvedFingerprint?: string | null;
  prevRoundsTiebreakResolvedDecision?: 'yes' | 'no' | null;
  timeTiebreakCurrentFingerprint?: string | null;
  timeTiebreakHasEligibleTie?: boolean;
  timeTiebreakIsResolved?: boolean;
  leadRankingRows?: Array<{
    name: string;
    rank: number;
    score?: number | null;
    total?: number | null;
    tb_time?: boolean;
    tb_prev?: boolean;
    raw_scores?: Array<number | null | undefined>;
  }>;
};

/**
 * RankingRow - Computed Ranking for Display
 *
 * Simplified compared to RankingsBoard (no rawTimes displayed in UI).
 *
 * Fields:
 * - rank: Final rank position (1 = first place)
 * - nume: Competitor name
 * - total: Geometric mean of per-route ranks
 * - scores: Array of raw scores per route (for future expansion)
 */
type RankingRow = {
  rank: number;  // Final rank (1, 2, 3, ...)
  nume: string;  // Competitor name
  total: number;  // Geometric mean rank
  scores: Array<number | undefined>;  // Raw scores per route
  tbTime: boolean;
  tbPrev: boolean;
};

/**
 * buildRankingRows - Build Rankings Table
 *
 * Purpose:
 * - Combines per-route rankings into final sorted table
 * - Simpler than RankingsBoard: No tie handling in final ranks
 *
 * Note:
 * - Final ranks assigned sequentially (1, 2, 3, ...) without tie detection
 * - This differs from RankingsBoard which handles ties in final ranking
 * - Consider aligning with RankingsBoard behavior in future refactor
 */
const buildRankingRows = (box: PublicBox): RankingRow[] => {
  const rows = Array.isArray(box.leadRankingRows) ? box.leadRankingRows : [];
  return rows
    .map((row) => ({
      rank: Math.max(1, Number(row.rank || 1)),
      nume: typeof row.name === 'string' ? row.name : '',
      total:
        typeof row.total === 'number'
          ? row.total
          : typeof row.score === 'number'
          ? row.score
          : 0,
      scores: Array.isArray(row.raw_scores) ? row.raw_scores : [],
      tbTime: !!row.tb_time,
      tbPrev: !!row.tb_prev,
    }))
    .filter((row) => !!row.nume)
    .sort((a, b) => a.rank - b.rank || a.nume.localeCompare(b.nume));
};

/**
 * PublicRankings Component - Legacy Live Rankings Display
 *
 * Purpose:
 * - Shows live rankings for climbing competitions
 * - Simple table view: rank, name, total
 * - WebSocket-based with exponential backoff reconnection
 *
 * State Management:
 * - boxes: Array of all box states from WebSocket
 * - selectedBoxId: Currently selected box for display
 * - connected: WebSocket connection status
 * - error: Error message for display
 * - reconnectAttempts: Current reconnection attempt count (for UI feedback)
 *
 * Refs (Lifecycle Management):
 * - wsRef: WebSocket instance (persistent across renders)
 * - reconnectTimeoutRef: Reconnection timer ID (for cleanup)
 * - reconnectAttemptsRef: Attempt count (used in async callbacks, avoids stale closures)
 *
 * Why reconnectAttemptsRef + reconnectAttempts state:
 * - reconnectAttemptsRef: Used in onclose callback (avoids stale closure)
 * - reconnectAttempts state: For UI display (triggers re-render)
 */
const PublicRankings: FC = () => {
  const navigate = useNavigate();  // For navigation back to /public
  
  // State: Box data and selection
  const [boxes, setBoxes] = useState<PublicBox[]>([]);  // All boxes from WebSocket
  const [selectedBoxId, setSelectedBoxId] = useState<number | null>(null);  // Selected box
  
  // State: Connection and error
  const [connected, setConnected] = useState(false);  // WebSocket connected
  const [error, setError] = useState<string | null>(null);  // Error message
  const [reconnectAttempts, setReconnectAttempts] = useState(0);  // For UI (not used currently)

  // Refs: Lifecycle management (persistent across renders, no re-render on change)
  const wsRef = useRef<WebSocket | null>(null);  // WebSocket instance
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);  // Reconnect timer
  const reconnectAttemptsRef = useRef(0);  // Attempt count (for async callbacks)

  /**
   * fetchInitialData - HTTP Fallback for Initial Rankings
   *
   * Purpose:
   * - Fetches rankings via HTTP GET before WebSocket connects
   * - Provides immediate data while WebSocket establishes connection
   * - Silent failure (no error shown, WebSocket will take over)
   *
   * Auto-Selection Logic:
   * - If no box selected, auto-select first initiated box
   * - Preserves existing selection if present
   */
  const fetchInitialData = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/rankings`);
      if (response.ok) {
        const data = await response.json();
        setBoxes(data.boxes || []);  // Update boxes state
        
        // Auto-select first initiated box if none selected
        setSelectedBoxId((prev) => {
          if (prev != null) return prev;  // Preserve existing selection
          const initiated = data.boxes?.find((b: PublicBox) => b.initiated);
          return initiated ? initiated.boxId : null;  // Auto-select first initiated
        });
      }
    } catch (err) {
      console.error('Failed to fetch rankings:', err);  // Log but don't show error
    }
  }, []);

  /**
   * connectWs - Establish WebSocket Connection with Exponential Backoff
   *
   * Purpose:
   * - Creates WebSocket connection to /api/public/ws
   * - Fetches spectator token (24h TTL, stored in localStorage)
   * - Handles all WebSocket lifecycle events (open, message, error, close)
   * - Implements exponential backoff reconnection (up to 10 attempts)
   *
   * Token Management:
   * - Calls getSpectatorToken() to fetch or retrieve cached token
   * - On token error: Clears cached token, shows error (requires page refresh)
   *
   * Reconnection Strategy:
   * - Exponential backoff: delay = 1000ms * 2^attempt
   * - Attempt 0: 1s, Attempt 1: 2s, Attempt 2: 4s, ..., Attempt 9: 512s
   * - After 10 failed attempts: Show error, stop reconnecting
   *
   * Why Exponential Backoff:
   * - Reduces server load during outages (vs fixed delay)
   * - Gives time for transient network issues to resolve
   * - Standard practice for resilient WebSocket clients
   */
  const connectWs = useCallback(async () => {
    try {
      // Fetch spectator token (may use cached token from localStorage)
      const token = await getSpectatorToken();
      const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
      wsRef.current = ws;  // Store for cleanup

      /**
       * onopen - WebSocket Connection Established
       *
       * Actions:
       * - Set connected state (show green indicator)
       * - Clear error message
       * - Reset reconnection attempt counter
       */
      ws.onopen = () => {
        setConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;  // Reset attempt counter
        setReconnectAttempts(0);  // Update UI state
      };

      /**
       * onmessage - Handle Incoming WebSocket Messages
       *
       * Message Types:
       * - PING: Heartbeat from server → Reply with PONG
       * - PUBLIC_STATE_SNAPSHOT: Full state for all boxes → Replace boxes array
       * - BOX_STATUS_UPDATE: Timer state changed → Merge box update
       * - BOX_FLOW_UPDATE: Competitor queue changed → Merge box update
       * - BOX_RANKING_UPDATE: Scores updated → Merge box update
       *
       * State Merging:
       * - Find existing box by boxId
       * - If found: Merge update into existing box (preserves other fields)
       * - If not found: Append new box (shouldn't happen, but handled)
       */
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Heartbeat: Reply with PONG to keep connection alive
          if (data.type === 'PING') {
            ws.send(JSON.stringify({ type: 'PONG' }));
            return;
          }

          // Full state snapshot: Replace entire boxes array
          if (data.type === 'PUBLIC_STATE_SNAPSHOT' && Array.isArray(data.boxes)) {
            setBoxes(data.boxes);
          } 
          // Incremental update: Merge into existing box
          else if (
            ['BOX_STATUS_UPDATE', 'BOX_FLOW_UPDATE', 'BOX_RANKING_UPDATE'].includes(data.type) &&
            data.box
          ) {
            setBoxes((prev) => {
              const idx = prev.findIndex((b) => b.boxId === data.box.boxId);
              if (idx >= 0) {
                // Found: Merge update into existing box
                const updated = [...prev];
                updated[idx] = { ...updated[idx], ...data.box };
                return updated;
              }
              // Not found: Append new box
              return [...prev, data.box];
            });
          }
        } catch (err) {
          console.error('Failed to parse WS message:', err);
        }
      };

      /**
       * onerror - WebSocket Error
       *
       * Note: Errors are typically followed by onclose event
       * Just log the error, onclose will handle reconnection
       */
      ws.onerror = () => {
        console.warn('Public rankings WS error');
      };

      /**
       * onclose - WebSocket Connection Closed
       *
       * Reconnection Logic:
       * - Check attempt count (reconnectAttemptsRef.current)
       * - If < MAX_RECONNECT_ATTEMPTS (10): Schedule reconnection with exponential backoff
       * - If >= 10 attempts: Show error, stop reconnecting
       *
       * Why reconnectAttemptsRef:
       * - Closure captures current attempt count (avoids stale state)
       * - Ref persists across reconnections (state would reset)
       */
      ws.onclose = (ev) => {
        console.log(ev.code, ev.reason);  // Log close reason for debugging
        setConnected(false);  // Update UI (red indicator)
        
        const attempt = reconnectAttemptsRef.current;
        if (attempt < MAX_RECONNECT_ATTEMPTS) {
          // Calculate exponential backoff delay: 1s * 2^attempt
          const delay = 1000 * Math.pow(2, attempt);
          
          // Schedule reconnection
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current = reconnectAttemptsRef.current + 1;  // Increment attempt
            setReconnectAttempts(reconnectAttemptsRef.current);  // Update UI
            connectWs();  // Reconnect
          }, delay);
        } else {
          // Max attempts reached: Show error, stop reconnecting
          setError('Connection lost. Please refresh the page.');
        }
      };
    } catch (err) {
      // Token error: Clear cached token (forces new token on page refresh)
      if (err instanceof Error && err.message?.includes('token')) {
        clearSpectatorToken();
      }
      setError('Unable to connect.');  // Show generic error
    }
  }, []);

  /**
   * Lifecycle Effect - Mount and Cleanup
   *
   * Mount:
   * - Fetch initial rankings via HTTP (immediate data)
   * - Connect WebSocket (real-time updates)
   *
   * Unmount:
   * - Clear reconnection timer (prevents reconnect after unmount)
   * - Close WebSocket gracefully
   *
   * Why Separate Fetch and WebSocket:
   * - Fetch provides immediate data (no waiting for WebSocket handshake)
   * - WebSocket takes over for real-time updates once connected
   */
  useEffect(() => {
    fetchInitialData();  // Initial HTTP fetch
    connectWs();  // WebSocket connection

    // Cleanup on unmount
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);  // Cancel pending reconnection
      }
      if (wsRef.current) {
        wsRef.current.close();  // Close WebSocket
      }
    };
  }, [fetchInitialData, connectWs]);

  // Compute derived state for render
  const initiatedBoxes = boxes.filter((b) => b.initiated);  // Only show initiated boxes
  const selectedBox = initiatedBoxes.find((b) => b.boxId === selectedBoxId);  // Current box
  const rankings = selectedBox ? buildRankingRows(selectedBox) : [];  // Rankings for selected box

  // Navigation handler
  const handleBack = () => {
    navigate('/public');  // Return to Public Hub
  };

  // Render: Header + Box Selector + Rankings Table

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      {/* Sticky header: Back button, title, connection status */}
      <header className="sticky top-0 z-50 bg-slate-900/95 backdrop-blur border-b border-slate-800 p-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          {/* Back button: Navigate to /public */}
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
          >
            <span>←</span>
            <span>Back</span>
          </button>

          {/* Page title */}
          <h1 className="text-xl font-bold text-white">🏆 Live Rankings</h1>

          {/* Connection status indicator */}
          <div className="flex items-center gap-3">
            {/* Status dot: Green when connected, red when offline */}
            <span
              className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-red-500'} ${connected ? 'animate-pulse' : ''}`}
            />
            <span className="text-slate-400 text-sm">{connected ? 'Live' : 'Offline'}</span>
          </div>
        </div>
      </header>

      {/* Box selector: Horizontal scrolling list of initiated boxes */}
      {initiatedBoxes.length > 0 && (
        <div className="border-b border-slate-800 bg-slate-900/50">
          <div className="max-w-6xl mx-auto px-4 flex gap-2 overflow-x-auto py-2">
            {initiatedBoxes.map((box) => (
              <button
                key={box.boxId}
                onClick={() => setSelectedBoxId(box.boxId)}
                className={`px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${
                  selectedBoxId === box.boxId
                    ? 'bg-cyan-600 text-white'  // Active: Cyan
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'  // Inactive: Slate
                }`}
              >
                {box.categorie || `Box ${box.boxId}`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error banner: Connection errors or reconnection failures */}
      {error && (
        <div className="bg-red-900/50 border-b border-red-500 p-4 text-center text-red-200">
          {error}
        </div>
      )}

      {/* Main content area: Rankings table or empty states */}
      <main className="max-w-6xl mx-auto p-6">
        {initiatedBoxes.length === 0 ? (
          // Empty state 1: No initiated boxes at all
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-slate-400">
            <div className="text-6xl mb-4">🏔️</div>
            <p className="text-xl">No active category at the moment</p>
          </div>
        ) : !selectedBox ? (
          // Empty state 2: Have boxes but none selected
          <div className="text-center text-slate-400">
            Select a category to see the rankings
          </div>
        ) : rankings.length === 0 ? (
          // Empty state 3: Box selected but no rankings yet
          <div className="text-center text-slate-400 py-12">
            <p>No results yet for this category</p>
          </div>
        ) : (
          // Rankings table: Display all competitors with geometric mean totals
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
            <table className="w-full">
              {/* Table header: 3 columns (rank, name, total) */}
              <thead>
                <tr className="bg-slate-700/50 text-left">
                  <th className="px-4 py-3 text-slate-300 font-medium w-16">#</th>
                  <th className="px-4 py-3 text-slate-300 font-medium">Nume</th>
                  <th className="px-4 py-3 text-slate-300 font-medium text-right">Total</th>
                </tr>
              </thead>
              {/* Table body: One row per competitor */}
              <tbody>
                {rankings.map((row, idx) => (
                  <tr
                    key={row.nume}
                    className={`border-t border-slate-700 ${idx < 3 ? 'bg-yellow-900/10' : ''}`}  // Highlight top 3
                  >
                    {/* Rank cell: Medals for top 3, numeric for rest */}
                    <td className="px-4 py-3">
                      {row.rank === 1 && <span className="text-2xl">🥇</span>}  {/* Gold medal for 1st place */}
                      {row.rank === 2 && <span className="text-2xl">🥈</span>}  {/* Silver medal for 2nd place */}
                      {row.rank === 3 && <span className="text-2xl">🥉</span>}  {/* Bronze medal for 3rd place */}
                      {row.rank > 3 && <span className="text-slate-400">{row.rank}</span>}  {/* Numeric rank for 4th+ */}
                    </td>
                    {/* Name cell */}
                    <td className="px-4 py-3 text-white font-medium">
                      <div className="flex items-center gap-2">
                        <span>{row.nume}</span>
                        {row.tbTime && (
                          <span className="inline-flex items-center rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-200">
                            TB Time
                          </span>
                        )}
                        {row.tbPrev && (
                          <span className="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                            TB Prev
                          </span>
                        )}
                      </div>
                    </td>
                    {/* Total cell: Geometric mean with 2 decimals */}
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
