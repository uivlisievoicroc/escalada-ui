/**
 * PublicLiveClimbing Component
 *
 * Real-time spectator view for individual box climbing action.
 * Shows the current climber, timer countdown, holds progress, and next competitor.
 *
 * **Key Features:**
 * - Live WebSocket updates: Timer, climber changes, holds progress
 * - Client-side timer ticking: Smooth countdown between server snapshots (250ms intervals)
 * - Exponential backoff reconnection: Up to 10 attempts (1s, 2s, 4s, ..., 512s)
 * - Token refresh: Handles 4401 close code by clearing expired spectator JWT
 * - Dynamic timer color: Green (normal), yellow (<30s or paused), red (overtime)
 * - Progress visualization: Gradient bar showing holds completed / total holds
 *
 * **Architecture:**
 * - Route: `/public/live-climbing/:boxId`
 * - WebSocket: `/api/public/ws/{boxId}?token=...` (spectator JWT, 24h TTL)
 * - Messages: STATE_SNAPSHOT (full state), PING/PONG (heartbeat), REQUEST_STATE (manual refresh)
 * - Timer Engine: Calculates `displayRemaining = baseRemaining - elapsedSinceSnapshot` when running
 *   - Server sends `remaining` in STATE_SNAPSHOT, client interpolates between updates
 *   - Local tick every 250ms for smooth UI, syncs on new snapshot
 *
 * **Use Case:**
 * Spectators watching a specific box/category in real-time (linked from PublicHub).
 * Displays current action, countdown timer, holds progress, and queue visibility.
 *
 * @component
 * @example
 * // Navigated from PublicHub:
 * // <Link to={`/public/live-climbing/${boxId}`}>Watch Box 1</Link>
 */
import React, { FC, useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSpectatorToken, clearSpectatorToken } from './PublicHub';

/**
 * WebSocket Configuration
 *
 * Protocol Detection:
 * - https: → wss: (secure WebSocket)
 * - http: → ws: (plain WebSocket)
 *
 * Endpoint: `wss://{host}:8000/api/public/ws/{boxId}?token={spectatorJWT}`
 * - Backend: escalada-api/escalada/api/public.py router
 * - Auth: Spectator JWT with 24h TTL (from PublicHub)
 */
const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss' : 'ws';
const WS_BASE = `${WS_PROTOCOL}://${window.location.hostname}:8000/api/public/ws`;

/**
 * Reconnection Configuration
 *
 * MAX_RECONNECT_ATTEMPTS: Stop reconnecting after 10 failures (~17 minutes total)
 * - Exponential backoff: delay = RECONNECT_BASE_DELAY_MS * 2^attempt
 * - Attempt 0: 1s, Attempt 1: 2s, Attempt 2: 4s, ..., Attempt 9: 512s (~8.5min)
 *
 * RECONNECT_BASE_DELAY_MS: Base delay before exponential multiplication (1000ms = 1s)
 */
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

/**
 * PublicLiveClimbing Component
 *
 * Real-time spectator view for a specific box with live timer ticking.
 * Uses WebSocket for state updates and client-side timer interpolation.
 *
 * **State Management:**
 * - `state`: Full box snapshot from WebSocket (null until first STATE_SNAPSHOT)
 * - `displayRemaining`: Client-calculated countdown (ticked locally when running)
 * - `connected`: WebSocket connection status (drives status indicator)
 * - `error`: Connection error message (null when OK)
 * - `reconnectAttempts`: Current reconnection attempt count (0-10)
 *
 * **Refs (Lifecycle Management):**
 * - `wsRef`: WebSocket instance (persistent across re-renders)
 * - `reconnectTimeoutRef`: Timer ID for scheduled reconnection (cleared on unmount)
 * - `isConnectingRef`: Connection guard (prevents duplicate connect() calls)
 * - `remainingBaseRef`: Timer baseline for local ticking
 *   - Stores `{ atMs: Date.now(), remaining: serverValue }` on STATE_SNAPSHOT
 *   - Used to calculate `displayRemaining = baseline.remaining - elapsedSinceSnapshot`
 *
 * **Why Separate displayRemaining from state.remaining?**
 * - `state.remaining`: Server-provided value (updated every snapshot, ~1s intervals)
 * - `displayRemaining`: Client-interpolated value (updated every 250ms for smooth countdown)
 * - When running: `displayRemaining` ticks down independently, syncs on new snapshot
 * - When idle/paused: `displayRemaining` shows `state.remaining` as-is (no ticking)
 */
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

  /**
   * Establish WebSocket Connection with Exponential Backoff
   *
   * Connects to `/api/public/ws/{boxId}?token={spectatorJWT}` and sets up handlers.
   * Uses `isConnectingRef` guard to prevent duplicate connection attempts.
   *
   * **Flow:**
   * 1. Fetch spectator token (24h TTL JWT from PublicHub)
   * 2. Close existing WebSocket if any
   * 3. Create new WebSocket with token query param
   * 4. Set up event handlers (onopen, onmessage, onerror, onclose)
   *
   * **Reconnection Strategy:**
   * - On close (network issue, server restart, token expiry), schedule reconnect
   * - Exponential backoff: delay = 1000ms * 2^attempt (up to 10 attempts)
   * - If code 4401 (token expired), clear cached token before retry
   * - After 10 failures, show error and stop (user must reload page)
   *
   * **Why useCallback?**
   * - Memoized to avoid re-creating on every render
   * - Depends on `boxId` and `reconnectAttempts` (recalculates when these change)
   * - Called from useEffect mount and onclose handler (needs stable reference)
   */
  const connect = useCallback(async () => {
    // Guard: Prevent duplicate connection attempts
    if (isConnectingRef.current || !boxId) return;
    isConnectingRef.current = true;

    try {
      // Fetch spectator token (cached in localStorage, 24h TTL)
      const token = await getSpectatorToken();
      const url = `${WS_BASE}/${boxId}?token=${encodeURIComponent(token)}`;

      // Close existing WebSocket if any (reconnection scenario)
      if (wsRef.current) {
        wsRef.current.close();
      }

      // Create new WebSocket connection
      const ws = new WebSocket(url);
      wsRef.current = ws;

      /**
       * onopen: Connection established successfully
       *
       * Actions:
       * - Set connected state (UI shows green status indicator)
       * - Clear error message
       * - Reset reconnection attempt counter
       * - Clear connection guard (allow future reconnects)
       */
      ws.onopen = () => {
        setConnected(true);
        setError(null);
        setReconnectAttempts(0);
        isConnectingRef.current = false;
      };

      /**
       * onmessage: Handle incoming WebSocket messages
       *
       * Message Types:
       * 1. **PING**: Heartbeat from server (every 30s)
       *    - Action: Reply with PONG to keep connection alive
       *    - Why: Prevents idle connection timeout, detects network issues
       *
       * 2. **STATE_SNAPSHOT**: Full box state update
       *    - Payload: Complete StateSnapshot with all fields
       *    - Triggers: Initial connection, after REQUEST_STATE, on state changes
       *    - Actions:
       *      a) Update state (full replace, not merge)
       *      b) Update timer baseline for local ticking:
       *         - If `remaining` is valid number, store `{ atMs: now, remaining: serverValue }`
       *         - Used by tick effect to calculate `displayRemaining = baseline - elapsed`
       *      c) Set initial displayRemaining (syncs with server immediately)
       *         - If no valid remaining, set null (shows "--:--")
       *
       * **Why store remainingBaseRef on STATE_SNAPSHOT?**
       * - Server sends snapshots at ~1s intervals (not every 250ms)
       * - Client needs to interpolate between snapshots for smooth countdown
       * - Baseline captures "at this moment (atMs), remaining was X seconds"
       * - Tick effect calculates: `current = baseline.remaining - (now - baseline.atMs) / 1000`
       *
       * **Error Handling:**
       * - Silently logs parse errors (malformed JSON)
       * - Connection continues (doesn't close on bad message)
       */
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Heartbeat: Reply to PING with PONG
          if (data.type === 'PING') {
            ws.send(JSON.stringify({ type: 'PONG' }));
            return;
          }

          // State update: Full snapshot from server
          if (data.type === 'STATE_SNAPSHOT') {
            setState(data);

            // Update timer baseline for local ticking (if valid remaining)
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

      /**
       * onerror: WebSocket error occurred
       *
       * Triggered on network issues, DNS failures, refused connections.
       * Note: `onclose` always follows `onerror`, so reconnection is handled there.
       *
       * Actions:
       * - Show error message to user
       * - Clear connection guard (allow onclose to schedule reconnect)
       */
      ws.onerror = () => {
        setError('Eroare de conexiune');
        isConnectingRef.current = false;
      };

      /**
       * onclose: WebSocket connection closed
       *
       * Triggered on:
       * - Network failure (after onerror)
       * - Server shutdown/restart
       * - Token expiry (code 4401)
       * - Manual close (component unmount)
       *
       * **Reconnection Strategy:**
       * 1. Check close code:
       *    - 4401: Token expired → Clear cached token (forces fresh fetch on reconnect)
       * 2. Check attempt count:
       *    - < 10: Schedule reconnect with exponential backoff
       *      - delay = 1000ms * 2^attempt (1s, 2s, 4s, 8s, ..., 512s)
       *      - Increment attempt counter
       *      - Call connect() after delay
       *    - >= 10: Give up, show permanent error (user must reload page)
       *
       * **Why exponential backoff?**
       * - Reduces server load during outages (not all clients reconnect simultaneously)
       * - Gives network time to recover
       * - Avoids "thundering herd" problem
       *
       * **Why clear token on 4401?**
       * - Server explicitly rejected token (expired or invalid)
       * - Fetching cached token again would fail the same way
       * - Clearing forces getSpectatorToken() to fetch fresh JWT
       */
      ws.onclose = (event) => {
        setConnected(false);
        isConnectingRef.current = false;

        // Handle token expiry: Clear cached token
        if (event.code === 4401) {
          clearSpectatorToken();
        }

        // Attempt reconnect with exponential backoff (up to 10 attempts)
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          const delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, reconnectAttempts);
          reconnectTimeoutRef.current = setTimeout(() => {
            setReconnectAttempts((prev) => prev + 1);
            connect();
          }, delay);
        } else {
          setError('Connection failed. Reload the page.');
        }
      };
    } catch (err) {
      // Token fetch failed (network issue or PublicHub error)
      setError('Could not obtain token');
      isConnectingRef.current = false;
    }
  }, [boxId, reconnectAttempts]);

  /**
   * Effect: Mount and Unmount Lifecycle
   *
   * **Mount:**
   * - Establish WebSocket connection on component mount
   *
   * **Unmount:**
   * - Clear pending reconnection timer (prevents reconnect after navigation away)
   * - Close WebSocket gracefully (avoids memory leak)
   *
   * **Why cleanup is critical:**
   * - Without clearing timeout, reconnect would trigger after unmount (memory leak)
   * - Without closing WebSocket, connection stays open (server resources wasted)
   *
   * **Dependency: [connect]**
   * - Recalculates when `connect` callback changes (boxId or reconnectAttempts change)
   * - Ensures effect uses latest connection logic
   */
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

  /**
   * Effect: Client-Side Timer Ticking
   *
   * Provides smooth countdown display between server snapshots (250ms tick rate).
   * Syncs with server on each STATE_SNAPSHOT, interpolates locally when timer is running.
   *
   * **Behavior by Timer State:**
   *
   * 1. **No State:** `displayRemaining = null` (shows "--:--")
   *
   * 2. **Idle or Paused:** Display server value as-is (no ticking)
   *    - `displayRemaining = state.remaining` (static display)
   *    - Why: Timer not counting down, no interpolation needed
   *
   * 3. **Running:** Local ticking with elapsed time calculation
   *    - Every 250ms: `displayRemaining = baseline.remaining - elapsedSec`
   *    - `elapsedSec = (Date.now() - baseline.atMs) / 1000`
   *    - Why 250ms: Balance between smooth UI and performance
   *    - Fallback: If no baseline, use `state.remaining` directly
   *
   * **Timer Baseline Sync:**
   * - Set on STATE_SNAPSHOT: `remainingBaseRef = { atMs: Date.now(), remaining: serverValue }`
   * - Used for calculation: `current = baseline.remaining - (now - baseline.atMs) / 1000`
   * - Why needed: Server sends snapshots at ~1s intervals, client ticks every 250ms
   *
   * **Cleanup:**
   * - Clear interval on effect re-run or unmount (prevents memory leak)
   *
   * **Dependency: [state]**
   * - Re-runs when state changes (new STATE_SNAPSHOT from WebSocket)
   * - Ensures tick calculation uses latest timerState and baseline
   */
  useEffect(() => {
    if (!state) {
      setDisplayRemaining(null);
      return;
    }

    // When idle/paused, display the last server value as-is (no ticking)
    if (state.timerState !== 'running') {
      if (typeof state.remaining === 'number' && Number.isFinite(state.remaining)) {
        setDisplayRemaining(state.remaining);
      } else {
        setDisplayRemaining(null);
      }
      return;
    }

    // Running: Tick based on elapsed time since last snapshot
    const tick = () => {
      const base = remainingBaseRef.current;
      if (!base) {
        // Fallback: No baseline, use server value directly
        if (typeof state.remaining === 'number' && Number.isFinite(state.remaining)) {
          setDisplayRemaining(state.remaining);
        } else {
          setDisplayRemaining(null);
        }
        return;
      }
      // Calculate: current = baseline - elapsed
      const elapsedSec = (Date.now() - base.atMs) / 1000;
      setDisplayRemaining(base.remaining - elapsedSec);
    };

    // Immediate tick + interval (250ms for smooth countdown)
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [state]);

  /**
   * Handle Back Navigation
   *
   * Navigates back to Public Hub (/public) where spectators can choose another box.
   * Cleanup (WebSocket close) is handled by unmount effect.
   */
  const handleBack = () => {
    navigate('/public');
  };

  /**
   * Handle Manual Refresh
   *
   * Sends REQUEST_STATE message to server to force immediate STATE_SNAPSHOT.
   * Useful when spectators suspect stale data or want to re-sync.
   *
   * **Safety:**
   * - Only sends if WebSocket is OPEN (prevents error on closed connection)
   * - No-op if not connected (silent failure, UI shows "Disconnected")
   */
  const handleRefresh = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'REQUEST_STATE' }));
    }
  };

  /**
   * Render Holds Progress Bar
   *
   * Displays visual progress: completed holds / total holds.
   * Gradient bar fills from left to right as holdCount increases.
   *
   * **Features:**
   * - Percentage calculation: `(holdCount / holdsCount) * 100`
   * - Clamped to 100% (handles edge case where holdCount > holdsCount)
   * - Smooth animation: `transition-all duration-300` on width change
   * - Gradient colors: emerald-500 → cyan-500 (green to blue)
   *
   * **Example:**
   * - holdsCount = 30, holdCount = 15 → 50% width (15 / 30 = 0.5)
   * - holdsCount = 30, holdCount = 30.5 → 100% width (half-hold support, clamped)
   *
   * @returns {JSX.Element|null} Progress bar component or null if no state
   */
  const renderHoldsProgress = () => {
    if (!state) return null;
    const { holdCount, holdsCount } = state;
    const percentage = holdsCount > 0 ? (holdCount / holdsCount) * 100 : 0;

    return (
      <div className="w-full">
        <div className="flex justify-between text-sm text-slate-400 mb-2">
          <span>Progress</span>
          <span>
            {holdCount} / {holdsCount} holds
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

  /**
   * Get Timer Display Color
   *
   * Returns dynamic Tailwind class based on timer state and remaining time.
   * Provides visual feedback for timer urgency.
   *
   * **Color Logic:**
   * 1. **No state:** `text-slate-400` (gray, waiting for connection)
   * 2. **Running:**
   *    - Overtime (remaining < 0): `text-red-500` (red, alert)
   *    - Low time (remaining < 30s): `text-yellow-500` (yellow, warning)
   *    - Normal: `text-emerald-500` (green, OK)
   * 3. **Paused:** `text-yellow-500` (yellow, waiting to resume)
   * 4. **Idle:** `text-slate-400` (gray, waiting to start)
   *
   * **effectiveRemaining:**
   * - Prefers `displayRemaining` (client-interpolated, most current)
   * - Falls back to `state.remaining` (server value, less current)
   * - Why: displayRemaining is null when not ticking, need fallback
   *
   * @returns {string} Tailwind color class (e.g., "text-emerald-500")
   */
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

  /**
   * Render: Main UI Structure
   *
   * **Layout:**
   * 1. Header: Back button, connection status indicator
   * 2. Error banner: Connection errors with retry button (conditional)
   * 3. Main content:
   *    - Loading state: Spinner animation
   *    - Not initiated: Category waiting to start (with manual refresh)
   *    - Live climbing: Category title, current climber card, timer, progress, next climber
   *
   * **Empty States:**
   * - No state: Loading spinner (waiting for first STATE_SNAPSHOT)
   * - Not initiated: Mountain emoji + "has not started yet" message + Refresh button
   *
   * **Live Climbing Display:**
   * - Category title: Name + route progress ("Route 2 / 4")
   * - Current climber card:
   *   - Climber name with emoji 🧗
   *   - Large timer display (color-coded by urgency)
   *   - Timer state badge (In Progress / Paused / Waiting)
   *   - Holds progress bar with percentage
   * - Preparing climber: Next in queue (conditional, only if preparingClimber exists)
   * - Time criterion indicator: Shows "⏱️ Times are recorded" if enabled
   */
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      {/* Header: Sticky navigation bar with back button and connection status */}
      <header className="sticky top-0 z-50 bg-slate-900/95 backdrop-blur border-b border-slate-800 p-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          {/* Back button: Navigate to Public Hub */}
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
          >
            <span>←</span>
            <span>Back</span>
          </button>

          {/* Connection status: Green dot when live, red when disconnected */}
          <div className="flex items-center gap-3">
            <span
              className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-red-500'} ${connected ? 'animate-pulse' : ''}`}
            />
            <span className="text-slate-400 text-sm">{connected ? 'Live' : 'Disconnected'}</span>
          </div>
        </div>
      </header>

      {/* Error banner: Connection failures with manual retry */}
      {error && (
        <div className="bg-red-900/50 border-b border-red-500 p-4 text-center text-red-200">
          {error}
          {/* Retry button: Reset attempts and reconnect */}
          <button
            onClick={() => {
              setError(null);
              setReconnectAttempts(0);
              connect();
            }}
            className="ml-4 underline hover:text-red-100"
          >
            Retry
          </button>
        </div>
      )}

      {/* Main content: Loading / Not initiated / Live climbing */}
      <main className="max-w-4xl mx-auto p-6">
        {!state ? (
          // Loading state: Waiting for first STATE_SNAPSHOT
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-slate-400">
            <div className="animate-spin text-4xl mb-4">⟳</div>
            <p>Loading...</p>
          </div>
        ) : !state.initiated ? (
          // Not initiated: Category waiting to start
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-slate-400">
            <div className="text-6xl mb-4">🏔️</div>
            <p className="text-xl">This category has not started yet</p>
            {/* Manual refresh: Send REQUEST_STATE to re-check */}
            <button
              onClick={handleRefresh}
              className="mt-6 px-6 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
            >
              Refresh
            </button>
          </div>
        ) : (
          // Live climbing: Current climber, timer, progress, next competitor
          <div className="space-y-8">
            {/* Category title: Name and route progress indicator */}
            <div className="text-center">
              <h1 className="text-3xl font-bold text-white">
                {state.categorie || `Box ${boxId}`}
              </h1>
              {/* Route indicator: Shows "Route 2 / 4" for multi-route categories */}
              <p className="text-slate-400 mt-1">
                Route {state.routeIndex}
                {state.routesCount && state.routesCount > 1 && ` / ${state.routesCount}`}
              </p>
            </div>

            {/* Current climber card: Main focus of spectator view */}
            <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-8">
              <div className="text-center">
                {/* Climber name with emoji */}
                <div className="text-slate-400 text-sm mb-2">Climbing now</div>
                <div className="text-4xl font-bold text-white mb-6">
                  🧗 {state.currentClimber || '—'}
                </div>

                {/* Timer display: Large, color-coded by urgency */}
                <div className={`text-6xl font-mono font-bold ${getTimerColor()} mb-6`}>
                  {formatTime(
                    typeof displayRemaining === 'number' && Number.isFinite(displayRemaining)
                      ? displayRemaining
                      : state.remaining,
                  )}
                </div>

                {/* Timer state badge: Visual indicator of timer status */}
                <div className="mb-6">
                  {/* Running: Green badge with pulsing dot */}
                  {state.timerState === 'running' && (
                    <span className="inline-flex items-center gap-2 px-4 py-1 bg-emerald-900/50 text-emerald-400 rounded-full text-sm">
                      <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                      In Progress
                    </span>
                  )}
                  {/* Paused: Yellow badge */}
                  {state.timerState === 'paused' && (
                    <span className="px-4 py-1 bg-yellow-900/50 text-yellow-400 rounded-full text-sm">
                      Paused
                    </span>
                  )}
                  {/* Idle: Gray badge */}
                  {state.timerState === 'idle' && (
                    <span className="px-4 py-1 bg-slate-700 text-slate-400 rounded-full text-sm">
                      Waiting
                    </span>
                  )}
                </div>

                {/* Holds progress: Gradient bar visualization */}
                {renderHoldsProgress()}
              </div>
            </div>

            {/* Preparing climber: Next in queue (only shown if exists) */}
            {state.preparingClimber && (
              <div className="bg-slate-800/30 rounded-xl border border-slate-700 p-6 text-center">
                <div className="text-slate-400 text-sm mb-1">Next</div>
                <div className="text-xl text-white">👤 {state.preparingClimber}</div>
              </div>
            )}

            {/* Time criterion indicator: Shows if times are recorded for tiebreaking */}
            {state.timeCriterionEnabled && (
              <div className="text-center text-slate-400 text-sm">
                ⏱️ Times are recorded for tiebreaking
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default PublicLiveClimbing;
