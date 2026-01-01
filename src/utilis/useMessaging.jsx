import { useCallback, useRef, useEffect } from 'react';
import { debugLog, debugWarn, debugError } from './debug';

/**
 * Unified messaging hook for WebSocket + BroadcastChannel
 * Provides a single API for sending messages across:
 * 1. WebSocket (server communication)
 * 2. BroadcastChannel (cross-tab communication)
 *
 * Usage:
 * const messaging = useMessaging(wsUrl, onMessage, options);
 * messaging.send({ type: 'PROGRESS_UPDATE', delta: 1 });
 * messaging.broadcast({ type: 'TIMER_STATE', state: 'running' });
 */

export function useMessaging(wsUrl, onMessage, options = {}) {
  const {
    broadcastChannels = ['escalada-state', 'timer-cmd'],
    reconnectDelay = 2000,
    heartbeatInterval = 30000,
  } = options;

  const wsRef = useRef(null);
  const bcRefs = useRef({});
  const messageQueueRef = useRef([]);
  const reconnectTimeoutRef = useRef(null);

  // ==================== WEBSOCKET MANAGEMENT ====================
  const connectWebSocket = useCallback(() => {
    if (!wsUrl) return;

    try {
      const ws = new WebSocket(wsUrl);
      let lastPong = Date.now();
      let heartbeatInterval = null;

      ws.onopen = () => {
        debugLog('📡 Messaging WebSocket connected:', wsUrl);

        // Flush message queue
        while (messageQueueRef.current.length > 0) {
          const msg = messageQueueRef.current.shift();
          try {
            ws.send(JSON.stringify(msg));
          } catch (err) {
            debugError('Failed to send queued message:', err);
          }
        }

        // Start heartbeat monitoring
        lastPong = Date.now();
        heartbeatInterval = setInterval(() => {
          const now = Date.now();
          const timeSinceLastPong = now - lastPong;

          if (timeSinceLastPong > heartbeatInterval * 2) {
            debugWarn('⏱️  Messaging heartbeat timeout');
            ws.close();
            return;
          }

          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(JSON.stringify({ type: 'PONG', timestamp: now }));
            } catch (err) {
              debugError('Failed to send PONG:', err);
            }
          }
        }, heartbeatInterval);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          // Handle PING from server
          if (msg.type === 'PING') {
            lastPong = Date.now();
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'PONG', timestamp: msg.timestamp }));
            }
            return;
          }

          // Route to user handler
          if (onMessage) {
            onMessage(msg, ws);
          }
        } catch (err) {
          debugError('Messaging: Failed to parse message:', err);
        }
      };

      ws.onerror = (error) => {
        debugError('❌ Messaging WebSocket error:', error);
      };

      ws.onclose = () => {
        debugLog('🔌 Messaging WebSocket closed');

        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
        }

        // Auto-reconnect
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }

        reconnectTimeoutRef.current = setTimeout(() => {
          debugLog('🔄 Reconnecting messaging WebSocket...');
          connectWebSocket();
        }, reconnectDelay);
      };

      wsRef.current = ws;
    } catch (err) {
      debugError('Failed to create messaging WebSocket:', err);
    }
  }, [wsUrl, onMessage, reconnectDelay, heartbeatInterval]);

  // ==================== BROADCAST CHANNEL MANAGEMENT ====================
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;

    // Initialize broadcast channels
    broadcastChannels.forEach((channelName) => {
      try {
        const bc = new BroadcastChannel(channelName);
        bc.onmessage = (event) => {
          if (onMessage) {
            onMessage(event.data, null, { source: 'broadcast', channel: channelName });
          }
        };
        bcRefs.current[channelName] = bc;
      } catch (err) {
        debugError(`Failed to create BroadcastChannel ${channelName}:`, err);
      }
    });

    return () => {
      Object.values(bcRefs.current).forEach((bc) => {
        try {
          bc.close();
        } catch (err) {
          debugError('Failed to close BroadcastChannel:', err);
        }
      });
      bcRefs.current = {};
    };
  }, [broadcastChannels, onMessage]);

  // ==================== WEBSOCKET CONNECTION ====================
  useEffect(() => {
    connectWebSocket();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connectWebSocket]);

  // ==================== MESSAGE SENDING ====================
  const send = useCallback((message) => {
    const ws = wsRef.current;

    if (!ws) {
      // Queue message if WebSocket not connected
      messageQueueRef.current.push(message);
      return false;
    }

    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
        return true;
      } catch (err) {
        debugError('Failed to send message via WebSocket:', err);
        messageQueueRef.current.push(message);
        return false;
      }
    } else {
      // Queue message if WebSocket not open
      messageQueueRef.current.push(message);
      return false;
    }
  }, []);

  const broadcast = useCallback((message, channelName = null) => {
    const channels = channelName
      ? bcRefs.current[channelName]
        ? [bcRefs.current[channelName]]
        : []
      : Object.values(bcRefs.current);

    let success = true;
    channels.forEach((bc) => {
      try {
        bc.postMessage(message);
      } catch (err) {
        debugError('Failed to broadcast message:', err);
        success = false;
      }
    });

    return success;
  }, []);

  const sendAndBroadcast = useCallback(
    (message, broadcastChannels = null) => {
      const wsSent = send(message);
      const bcSent = broadcast(message, broadcastChannels);
      return wsSent || bcSent;
    },
    [send, broadcast],
  );

  // ==================== STATUS AND UTILITIES ====================
  const getStatus = useCallback(
    () => ({
      ws: wsRef.current?.readyState || WebSocket.CLOSED,
      wsConnected: wsRef.current?.readyState === WebSocket.OPEN,
      broadcastChannels: Object.keys(bcRefs.current),
      messageQueueLength: messageQueueRef.current.length,
    }),
    [],
  );

  const isConnected = useCallback(() => wsRef.current?.readyState === WebSocket.OPEN, []);

  const reconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    connectWebSocket();
  }, [connectWebSocket]);

  return {
    // Sending
    send,
    broadcast,
    sendAndBroadcast,

    // Status
    isConnected,
    getStatus,
    reconnect,

    // Refs (for advanced usage)
    wsRef,
    bcRefs,
  };
}

export default useMessaging;
