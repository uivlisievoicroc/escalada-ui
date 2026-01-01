import { useEffect, useRef, useState } from 'react';
import { debugLog, debugError } from './debug';

const logger = console;
const MAX_RECONNECT_ATTEMPTS = 10; // Circuit breaker threshold

export function useWebSocketWithHeartbeat(url, onMessage) {
  const [connected, setConnected] = useState(false);
  const [wsInstance, setWsInstance] = useState(null);
  const [wsError, setWsError] = useState(''); // Circuit breaker error message
  const wsRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const onMessageRef = useRef(onMessage);
  const isConnectingRef = useRef(false);
  const generationRef = useRef(0); // ignore late events from stale effects

  // Keep latest handler without recreating the socket
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    const currentGen = ++generationRef.current;
    let cleanupCalled = false; // Track cleanup state to prevent StrictMode churn
    let reconnectTimeoutId = null;

    const connect = () => {
      // Guard against StrictMode re-entry
      if (cleanupCalled) {
        logger.debug('[WebSocket] Cleanup already called, skipping connect');
        return;
      }
      if (currentGen !== generationRef.current) return;

      // Avoid duplicate attempts while handshake is in progress
      if (isConnectingRef.current) {
        logger.debug('[WebSocket] Already connecting, skipping duplicate attempt');
        return;
      }

      // Skip if an open/connecting socket already exists
      if (wsRef.current) {
        const state = wsRef.current.readyState;
        if (state === WebSocket.CONNECTING || state === WebSocket.OPEN) {
          logger.debug('[WebSocket] Connection already exists, skipping');
          return;
        }
      }

      isConnectingRef.current = true;

      try {
        const ws = new WebSocket(url);

        ws.onopen = () => {
          isConnectingRef.current = false;

          // Check cleanup state BEFORE processing open event (StrictMode protection)
          if (cleanupCalled) {
            console.debug('[Hook onopen] Cleanup called before open (StrictMode), closing');
            ws.close();
            return;
          }

          debugLog(
            '🟢 [Hook onopen] TRIGGERED for',
            url,
            'readyState:',
            ws.readyState,
            'timestamp:',
            new Date().toISOString(),
          );
          logger.log(`[WebSocket] Connected to ${url}`);
          debugLog('🟢 [Hook onopen] Setting connected=true and wsInstance');
          setConnected(true);
          setWsError(''); // Clear error on successful connection
          reconnectAttemptsRef.current = 0;
          wsRef.current = ws;
          setWsInstance(ws);
        };

        ws.onmessage = (event) => {
          if (currentGen !== generationRef.current) return;

          try {
            const msg = JSON.parse(event.data);

            // Heartbeat handling: reply immediately
            if (msg.type === 'PING') {
              if (ws.readyState === WebSocket.OPEN) {
                try {
                  ws.send(JSON.stringify({ type: 'PONG', timestamp: msg.timestamp }));
                } catch (e) {
                  logger.warn(`[WebSocket] Failed to send PONG: ${e}`);
                }
              }
              return;
            }

            if (onMessageRef.current) {
              try {
                onMessageRef.current(msg);
              } catch (e) {
                logger.error(`[WebSocket] onMessage handler error: ${e}`);
              }
            }
          } catch (e) {
            logger.warn(`[WebSocket] Parse error: ${e}`);
          }
        };

        ws.onclose = () => {
          isConnectingRef.current = false;
          debugLog('🔌 [Hook onclose] CLOSED for', url, 'timestamp:', new Date().toISOString());

          // Check cleanup state before reconnecting
          if (cleanupCalled) {
            console.debug('[Hook onclose] Component unmounted or cleanup called, not reconnecting');
            return;
          }

          logger.log(`[WebSocket] Disconnected from ${url}`);
          setConnected(false);
          setWsInstance(null);

          // Circuit breaker: stop reconnecting after max attempts
          if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
            const errorMsg = `Connection to server failed after ${MAX_RECONNECT_ATTEMPTS} attempts. Please check your network and refresh the page.`;
            debugLog('🔴 [Hook onclose] Circuit breaker triggered:', errorMsg);
            logger.error('[WebSocket] Max reconnect attempts reached');
            setWsError(errorMsg);
            setConnected(false);
            setWsInstance(null);
            return; // Stop reconnect loop
          }

          // Exponential backoff: 1s, 2s, 4s, ... max 30s
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current || 0), 30000);
          reconnectAttemptsRef.current = (reconnectAttemptsRef.current || 0) + 1;
          debugLog(
            `🔄 [Hook onclose] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`,
          );
          logger.log(
            `[WebSocket] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`,
          );
          reconnectTimeoutId = setTimeout(connect, delay);
        };

        ws.onerror = (event) => {
          isConnectingRef.current = false;

          // Suppress expected error after cleanup (StrictMode double-mount)
          // When cleanup is called before socket opens, this error is expected and not actionable
          if (cleanupCalled && reconnectAttemptsRef.current === 0) {
            logger.debug('[Hook onerror] Suppressing expected StrictMode error during cleanup');
            return;
          }

          debugError(
            '🔴 [Hook onerror] ERROR for',
            url,
            'event:',
            event,
            'timestamp:',
            new Date().toISOString(),
          );
          logger.error('[WebSocket] Error:', event);
        };

        wsRef.current = ws;
      } catch (e) {
        isConnectingRef.current = false;
        logger.error(`[WebSocket] Connection failed: ${e}`);
      }
    };

    connect();

    return () => {
      cleanupCalled = true; // Mark cleanup as executed FIRST to prevent race conditions

      // Invalidate this generation so late events are ignored
      if (currentGen === generationRef.current) {
        generationRef.current += 1;
      }
      // Reset connecting flag so a StrictMode cleanup doesn't block next connect
      isConnectingRef.current = false;
      if (reconnectTimeoutId) clearTimeout(reconnectTimeoutId);

      // Only close if not in handshake; avoids "closed before established"
      if (wsRef.current && !isConnectingRef.current) {
        const state = wsRef.current.readyState;
        if (state !== WebSocket.CLOSED && state !== WebSocket.CLOSING) {
          wsRef.current.close();
        }
      }
      wsRef.current = null;
      setWsInstance(null);
      setConnected(false);
    };
  }, [url]);

  return {
    ws: wsInstance,
    connected,
    wsError, // Expose error to caller for user feedback
    reconnect: () => {
      // Force reconnect by closing existing socket; connect loop will re-open
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.close();
        } catch {}
      }
    },
    send: (msg) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(msg));
      }
    },
  };
}

export default useWebSocketWithHeartbeat;
