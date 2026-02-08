import React, { FC, useCallback, useEffect, useRef, useState } from 'react';
import { RankingsPageSkeleton } from './Skeleton';  // Loading placeholder during initial fetch
import RankingsBoard, { PublicBox, RankingsHeaderCard, normalizeBox } from './RankingsBoard';  // Main ranking display components

/**
 * API Configuration - Environment-Aware Endpoints
 * 
 * Protocol Detection:
 * - Matches page protocol (http/https) for API calls
 * - Uses wss:// for WebSocket when page is https:// (required for secure contexts)
 * - Falls back to ws:// for development (localhost)
 * 
 * Endpoints:
 * - API_BASE: HTTP REST endpoint for polling fallback (/api/public/rankings)
 * - WS_URL: WebSocket endpoint for live updates (/api/public/ws)
 * 
 * Port 8000:
 * - Backend API runs on separate port (not served with frontend)
 * - Production: Reverse proxy (nginx) handles routing
 * - Development: Direct connection to backend server
 */
const API_PROTOCOL = window.location.protocol === 'https:' ? 'https' : 'http';  // Match page protocol
const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss' : 'ws';  // Secure WebSocket if HTTPS
const API_BASE = `${API_PROTOCOL}://${window.location.hostname}:8000/api/public`;  // REST API base URL
const WS_URL = `${WS_PROTOCOL}://${window.location.hostname}:8000/api/public/ws`;  // WebSocket URL for live updates

/**
 * POLL_INTERVAL_MS - Fallback Polling Frequency
 * 
 * Value: 5000ms (5 seconds)
 * 
 * Why 5 seconds:
 * - Balance between freshness and server load
 * - Rankings don't change rapidly (climbers take minutes per route)
 * - WebSocket is primary mechanism (polling only used on connection failure)
 * 
 * When Polling Activates:
 * - Initial page load (until WebSocket connects)
 * - WebSocket error or disconnect
 * - Network issues preventing WebSocket establishment
 * 
 * Performance:
 * - Single request fetches all boxes (efficient, no N+1 problem)
 * - Stops immediately when WebSocket reconnects
 * - No polling storms (single interval per component instance)
 */
const POLL_INTERVAL_MS = 5000;  // Poll every 5 seconds as fallback when WebSocket unavailable

/**
 * RankingsPage Component - Public Live Rankings Display
 * 
 * Purpose:
 * - Shows live rankings for all active competition boxes
 * - Real-time updates via WebSocket with HTTP polling fallback
 * - Public spectator view (no authentication required for viewing)
 * 
 * Data Flow:
 * 1. Initial Load:
 *    - Show RankingsPageSkeleton (prevents layout shift)
 *    - Establish WebSocket connection to /api/public/ws
 *    - Send REQUEST_STATE to fetch initial rankings
 *    - Or fallback to HTTP poll if WebSocket fails
 * 
 * 2. Live Updates (WebSocket connected):
 *    - Receive PUBLIC_STATE_SNAPSHOT (full state, all boxes)
 *    - Receive BOX_STATUS_UPDATE (timer state, current climber)
 *    - Receive BOX_FLOW_UPDATE (competitor queue changes)
 *    - Receive BOX_RANKING_UPDATE (scores, ranking changes)
 *    - Handle PING messages (send PONG to keep connection alive)
 * 
 * 3. Fallback Mode (WebSocket disconnected):
 *    - Start HTTP polling (every 5 seconds)
 *    - Fetch /api/public/rankings (returns PUBLIC_STATE_SNAPSHOT)
 *    - Stop polling when WebSocket reconnects
 * 
 * State Management:
 * - boxes: Record<boxId, PublicBox> - Normalized box states keyed by ID
 * - selectedBoxId: Currently selected box (for mobile dropdown, null = all boxes)
 * - isWsConnected: WebSocket connection status (shows indicator in header)
 * - isInitialLoading: First load flag (shows skeleton, hides after first data)
 * 
 * WebSocket Lifecycle:
 * - onopen: Stop polling, request initial state
 * - onmessage: Process PING, snapshots, updates
 * - onerror/onclose: Start polling, schedule reconnect (2s delay)
 * - cleanup: Stop polling, clear reconnect timer, close WebSocket
 * 
 * Performance Considerations:
 * - Normalized state (boxes keyed by ID) for O(1) updates
 * - Skeleton prevents layout shift on initial load
 * - Polling stops when WebSocket active (no redundant requests)
 * - Single WebSocket connection (multiplexed for all boxes)
 * 
 * Accessibility:
 * - Skeleton includes sr-only "Loading..." text
 * - Rankings rendered in semantic order (rank 1 first)
 * - High contrast colors for visibility at distance
 * 
 * Layout:
 * - Full-screen gradient background (dark theme reduces eye strain)
 * - Responsive: Single column mobile, multi-column desktop
 * - RankingsBoard handles box selection and rendering
 */
const RankingsPage: FC = () => {
  // Box state: Normalized record keyed by boxId for O(1) lookups and updates
  const [boxes, setBoxes] = useState<Record<number, PublicBox>>({});
  
  // Selected box ID for mobile view (null = show all boxes, number = show single box)
  const [selectedBoxId, setSelectedBoxId] = useState<number | null>(null);
  
  // WebSocket connection status (displayed in header, informs user of live updates)
  const [isWsConnected, setIsWsConnected] = useState(false);
  
  // Initial loading flag (true until first data arrives, shows skeleton)
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  
  // Refs for lifecycle management (persist across renders, no re-render on change)
  const wsRef = useRef<WebSocket | null>(null);  // WebSocket instance
  const reconnectRef = useRef<number | null>(null);  // Reconnect timer ID
  const pollingRef = useRef<number | null>(null);  // Polling interval ID
  const closedRef = useRef(false);  // Component unmounted flag (prevents reconnect after cleanup)

  /**
   * applySnapshot - Replace All Box States
   * 
   * Purpose:
   * - Processes PUBLIC_STATE_SNAPSHOT messages (full state for all boxes)
   * - Replaces entire boxes state (not merged, full replacement)
   * - Normalizes each box via normalizeBox() for consistent structure
   * 
   * When Called:
   * - Initial WebSocket connection (REQUEST_STATE response)
   * - Polling fallback (HTTP GET /api/public/rankings)
   * - Page visibility change (background tab returns)
   * 
   * Data Flow:
   * 1. Receive array of PublicBox objects
   * 2. Validate each box has numeric boxId
   * 3. Normalize box structure (adds defaults, sorts competitors)
   * 4. Build new Record<boxId, PublicBox> object
   * 5. Replace state atomically (single setState call)
   * 6. Clear isInitialLoading flag (show content, hide skeleton)
   * 
   * Normalization:
   * - Ensures consistent field presence (no undefined fields)
   * - Sorts competitors by ranking (rank 1 first)
   * - Adds default values for optional fields
   * 
   * Performance:
   * - O(n) where n = number of boxes (typically 2-5)
   * - Single state update (no cascading re-renders)
   * - useCallback memoization prevents recreating on every render
   */
  const applySnapshot = useCallback((payloadBoxes: PublicBox[]) => {
    const next: Record<number, PublicBox> = {};  // Build new state object
    payloadBoxes.forEach((box) => {
      if (typeof box?.boxId !== 'number') return;  // Skip invalid boxes (missing ID)
      next[box.boxId] = normalizeBox(box);  // Normalize and add to new state
    });
    setBoxes(next);  // Replace entire state atomically
    setIsInitialLoading(false);  // Hide skeleton, show content
  }, []);

  /**
   * applyBoxUpdate - Update Single Box State
   * 
   * Purpose:
   * - Processes incremental box updates (single box changed)
   * - Merges update into existing boxes state
   * - Used for real-time updates (timer ticks, score submissions, competitor changes)
   * 
   * When Called:
   * - BOX_STATUS_UPDATE: Timer state changed (started, stopped, paused)
   * - BOX_FLOW_UPDATE: Competitor queue changed (next climber, route completed)
   * - BOX_RANKING_UPDATE: Scores updated (new score submitted, ranking reordered)
   * 
   * Data Flow:
   * 1. Receive single PublicBox object
   * 2. Validate box has numeric boxId
   * 3. Normalize box structure
   * 4. Merge into existing state (preserves other boxes)
   * 
   * State Merging:
   * - Uses functional setState with prev state
   * - Spreads existing boxes (keeps all other boxes unchanged)
   * - Overwrites single box at [box.boxId] key
   * - Atomic update (no intermediate states)
   * 
   * Performance:
   * - O(1) update (direct key access, no array iteration)
   * - Only re-renders components consuming updated box
   * - useCallback prevents recreating on every render
   */
  const applyBoxUpdate = useCallback((box: PublicBox) => {
    if (typeof box?.boxId !== 'number') return;  // Skip invalid updates
    setBoxes((prev) => ({
      ...prev,  // Keep all other boxes unchanged
      [box.boxId]: normalizeBox(box),  // Update single box
    }));
  }, []);

  /**
   * fetchSnapshot - HTTP Polling Fallback
   * 
   * Purpose:
   * - Fetches full rankings state via HTTP when WebSocket unavailable
   * - Fallback mechanism ensures data freshness even with network issues
   * - Silent failure (no user-facing errors, retries on next interval)
   * 
   * When Called:
   * - Polling interval (every 5 seconds when WebSocket disconnected)
   * - Manual refresh (user-triggered, not implemented yet)
   * 
   * Endpoint:
   * - GET /api/public/rankings
   * - Returns PUBLIC_STATE_SNAPSHOT with all boxes
   * - No authentication required (public endpoint)
   * 
   * Error Handling:
   * - Network errors: Silently ignored, retry on next interval
   * - HTTP errors (4xx, 5xx): Silently ignored, retry on next interval
   * - Malformed JSON: Caught in applySnapshot, ignored
   * 
   * Why Silent Errors:
   * - Polling is background activity (user not waiting)
   * - Transient network issues are common (mobile, WiFi)
   * - Next poll attempt likely succeeds
   * - WebSocket connection is primary mechanism (polling is backup)
   * 
   * Performance:
   * - Single request fetches all boxes (efficient)
   * - Response cached by browser (Cache-Control headers)
   * - Aborts on component unmount (no memory leaks)
   */
  const fetchSnapshot = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/rankings`);  // HTTP GET all rankings
      if (!res.ok) return;  // Ignore HTTP errors (4xx, 5xx)
      const data = await res.json();  // Parse JSON response
      if (data?.type === 'PUBLIC_STATE_SNAPSHOT' && Array.isArray(data.boxes)) {
        applySnapshot(data.boxes);  // Update state with fetched data
      }
    } catch {
      // Silently ignore errors (network issues, JSON parse failures)
      // Next poll interval will retry
    }
  }, [applySnapshot]);

  /**
   * startPolling - Begin HTTP Polling Fallback
   * 
   * Purpose:
   * - Starts periodic HTTP requests for rankings data
   * - Only activates when WebSocket unavailable (error, disconnect, never connected)
   * 
   * Behavior:
   * - Guard: Returns early if polling already active (prevents multiple intervals)
   * - Immediate fetch: Calls fetchSnapshot() before starting interval (no initial delay)
   * - Interval: Sets 5-second timer for subsequent fetches
   * - Idempotent: Safe to call multiple times (guard prevents duplicates)
   * 
   * Lifecycle:
   * - Started: WebSocket error or close
   * - Stopped: WebSocket successfully connects
   * - Cleaned: Component unmount
   */
  const startPolling = useCallback(() => {
    if (pollingRef.current) return;  // Already polling, exit early
    fetchSnapshot();  // Immediate first fetch (don't wait 5 seconds)
    pollingRef.current = window.setInterval(fetchSnapshot, POLL_INTERVAL_MS);  // Schedule repeating fetches
  }, [fetchSnapshot]);

  /**
   * stopPolling - Stop HTTP Polling
   * 
   * Purpose:
   * - Stops periodic HTTP requests (WebSocket took over)
   * - Prevents redundant requests when live updates available
   * 
   * Behavior:
   * - Guard: Returns early if not polling (idempotent)
   * - Clears interval timer
   * - Resets ref to null (allows startPolling to run again)
   */
  const stopPolling = useCallback(() => {
    if (!pollingRef.current) return;  // Not polling, nothing to stop
    window.clearInterval(pollingRef.current);  // Stop interval timer
    pollingRef.current = null;  // Reset ref (allows restart)
  }, []);

  /**
   * connectWs - Establish WebSocket Connection
   * 
   * Purpose:
   * - Creates WebSocket connection to backend for live rankings updates
   * - Handles all WebSocket lifecycle events (open, message, error, close)
   * - Implements reconnection strategy (2-second delay after disconnect)
   * 
   * Connection Flow:
   * 1. Check closedRef (exit if component unmounted)
   * 2. Close existing WebSocket if present (prevents multiple connections)
   * 3. Create new WebSocket to WS_URL
   * 4. Attach event handlers (onopen, onmessage, onerror, onclose)
   * 
   * Event Handlers:
   * - onopen: Connection established
   *   - Set isWsConnected true (show green indicator)
   *   - Stop HTTP polling (WebSocket takes over)
   *   - Send REQUEST_STATE (fetch initial rankings)
   * 
   * - onmessage: Message received from server
   *   - PING: Heartbeat from server, reply with PONG + timestamp
   *   - PUBLIC_STATE_SNAPSHOT: Full state (all boxes), call applySnapshot
   *   - BOX_STATUS_UPDATE: Timer state changed, call applyBoxUpdate
   *   - BOX_FLOW_UPDATE: Competitor queue changed, call applyBoxUpdate
   *   - BOX_RANKING_UPDATE: Scores updated, call applyBoxUpdate
   * 
   * - onerror: Connection error (network issue, server down)
   *   - Set isWsConnected false (show red indicator)
   *   - Start HTTP polling (fallback mechanism)
   * 
   * - onclose: Connection closed (normal or error)
   *   - Set isWsConnected false
   *   - Start HTTP polling
   *   - Schedule reconnect (2 seconds) unless component unmounted
   * 
   * Reconnection Strategy:
   * - 2-second delay (prevents rapid reconnect storms)
   * - Conditional: Only reconnects if closedRef.current === false
   * - Exponential backoff: Not implemented (2s fixed delay sufficient for typical network issues)
   * 
   * Memory Safety:
   * - closedRef guard prevents reconnect after unmount
   * - wsRef tracks current WebSocket (closed on unmount)
   * - reconnectRef tracks timer (cleared on unmount)
   */
  const connectWs = useCallback(() => {
    if (closedRef.current) return;  // Component unmounted, don't connect
    if (wsRef.current) {
      // Close existing WebSocket (prevents duplicate connections)
      try {
        wsRef.current.close();
      } catch {
        // Ignore close errors (already closed, invalid state)
      }
    }
    const ws = new WebSocket(WS_URL);  // Create new WebSocket connection
    wsRef.current = ws;  // Store reference for cleanup

    // onopen: Connection successfully established
    ws.onopen = () => {
      setIsWsConnected(true);  // Update UI (show green indicator)
      stopPolling();  // Stop HTTP fallback (WebSocket takes over)
      try {
        ws.send(JSON.stringify({ type: 'REQUEST_STATE' }));  // Request initial rankings
      } catch {
        // Ignore send errors (connection may have closed immediately)
      }
    };

    // onmessage: Received message from server
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);  // Parse JSON message
        
        // PING: Heartbeat to keep connection alive
        if (msg?.type === 'PING') {
          ws.send(JSON.stringify({ type: 'PONG', timestamp: msg.timestamp }));  // Reply with PONG
          return;
        }
        
        // PUBLIC_STATE_SNAPSHOT: Full state for all boxes
        if (msg?.type === 'PUBLIC_STATE_SNAPSHOT' && Array.isArray(msg.boxes)) {
          applySnapshot(msg.boxes);  // Replace entire state
          return;
        }
        
        // Incremental box updates: BOX_STATUS_UPDATE, BOX_FLOW_UPDATE, BOX_RANKING_UPDATE
        if (
          (msg?.type === 'BOX_STATUS_UPDATE' ||  // Timer state changed
            msg?.type === 'BOX_FLOW_UPDATE' ||  // Competitor queue changed
            msg?.type === 'BOX_RANKING_UPDATE') &&  // Scores updated
          msg.box  // Message includes box data
        ) {
          applyBoxUpdate(msg.box);  // Update single box
        }
      } catch {
        // Ignore malformed messages (invalid JSON, unexpected structure)
      }
    };

    // onerror: Connection error (network issue, server unreachable)
    ws.onerror = () => {
      setIsWsConnected(false);  // Update UI (show red indicator)
      startPolling();  // Start HTTP fallback
    };

    // onclose: Connection closed (normal close or after error)
    ws.onclose = () => {
      setIsWsConnected(false);  // Update UI
      startPolling();  // Start HTTP fallback
      if (!closedRef.current) {
        // Component still mounted, schedule reconnect (2-second delay)
        reconnectRef.current = window.setTimeout(connectWs, 2000);
      }
    };
  }, [applyBoxUpdate, applySnapshot, startPolling, stopPolling]);

  /**
   * Lifecycle Effect - Connection Management
   * 
   * Purpose:
   * - Establishes WebSocket connection on mount
   * - Cleans up all resources on unmount
   * - Prevents memory leaks and orphaned connections
   * 
   * Mount Behavior:
   * 1. Set closedRef.current = false (component is mounted)
   * 2. Call connectWs() (establish WebSocket, or start polling if fails)
   * 
   * Unmount Behavior (cleanup function):
   * 1. Set closedRef.current = true (prevents reconnect attempts)
   * 2. Stop HTTP polling (clear interval)
   * 3. Clear reconnect timer (cancel pending reconnect)
   * 4. Close WebSocket (graceful disconnect)
   * 
   * Why closedRef:
   * - Prevents race condition: async operations complete after unmount
   * - Guards reconnect attempts: onclose fires after unmount
   * - Memory safety: no setState on unmounted component
   * 
   * Dependencies:
   * - connectWs: Function reference (stable via useCallback)
   * - stopPolling: Function reference (stable via useCallback)
   * - Effect runs once on mount, cleanup on unmount
   */
  useEffect(() => {
    closedRef.current = false;  // Component mounted flag
    connectWs();  // Establish WebSocket connection
    
    // Cleanup function (runs on unmount)
    return () => {
      closedRef.current = true;  // Prevent reconnect after unmount
      stopPolling();  // Stop HTTP polling interval
      
      // Clear reconnect timer (cancel pending reconnect)
      if (reconnectRef.current) {
        window.clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
      
      // Close WebSocket connection (graceful disconnect)
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // Ignore close errors (already closed, invalid state)
        }
      }
    };
  }, [connectWs, stopPolling]);

  // Show skeleton during initial load (until first data arrives)
  // Prevents layout shift, provides visual feedback that data is loading
  if (isInitialLoading) {
    return <RankingsPageSkeleton />;
  }

  // Main render: Full-screen rankings display
  return (
    <div className="min-h-screen overflow-y-auto bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-50 md:h-screen md:overflow-hidden">
      {/* Content container: Max width 1400px, responsive padding and gaps */}
      <div className="mx-auto flex h-full max-w-[1400px] flex-col gap-3 px-3 py-3 md:gap-4 md:px-4 md:py-4">
        {/* Header: Connection status indicator, refresh button (future) */}
        <RankingsHeaderCard isWsConnected={isWsConnected} />
        
        {/* Main rankings board: Box selection (mobile) + ranking tables */}
        <RankingsBoard boxes={boxes} selectedBoxId={selectedBoxId} setSelectedBoxId={setSelectedBoxId} />
      </div>
    </div>
  );
};

// Export for use in router (typically at /rankings or /public/rankings route)
export default RankingsPage;
