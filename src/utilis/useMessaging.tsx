import { useCallback, useRef, useEffect } from 'react';

/**
 * Type definitions for useMessaging hook
 */

export interface MessagingOptions {
  broadcastChannels?: string[];
  reconnectDelay?: number;
  heartbeatInterval?: number;
}

export interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

export interface BroadcastChannelMessage extends WebSocketMessage {
  source?: 'broadcast';
  channel?: string;
}

export interface MessagingStatus {
  ws: number;
  wsConnected: boolean;
  broadcastChannels: string[];
  messageQueueLength: number;
}

export interface UseMessagingReturn {
  // Sending
  send: (message: WebSocketMessage) => boolean;
  broadcast: (message: any, channelName?: string | null) => boolean;
  sendAndBroadcast: (message: any, broadcastChannels?: string | null) => boolean;

  // Status
  isConnected: () => boolean;
  getStatus: () => MessagingStatus;
  reconnect: () => void;

  // Refs (for advanced usage)
  wsRef: React.MutableRefObject<WebSocket | null>;
  bcRefs: React.MutableRefObject<Record<string, BroadcastChannel>>;
}

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
export function useMessaging(
  wsUrl: string,
  onMessage?: (msg: any, ws: WebSocket | null, meta?: { source: string; channel?: string }) => void,
  options: MessagingOptions = {},
): UseMessagingReturn {
  const {
    broadcastChannels = ['escalada-state', 'timer-cmd'],
    reconnectDelay = 2000,
    heartbeatInterval = 30000,
  } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const bcRefs = useRef<Record<string, BroadcastChannel>>({});
  const messageQueueRef = useRef<WebSocketMessage[]>([]);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ==================== WEBSOCKET MANAGEMENT ====================
  const connectWebSocket = useCallback(() => {
    if (!wsUrl) return;

    try {
      const ws = new WebSocket(wsUrl);
      let lastPong = Date.now();
      let hbInterval: ReturnType<typeof setInterval> | null = null;

      ws.onopen = () => {
        console.log('📡 Messaging WebSocket connected:', wsUrl);

        // Flush message queue
        while (messageQueueRef.current.length > 0) {
          const msg = messageQueueRef.current.shift();
          if (msg) {
            try {
              ws.send(JSON.stringify(msg));
            } catch (err) {
              console.error('Failed to send queued message:', err);
            }
          }
        }

        // Start heartbeat monitoring
        lastPong = Date.now();
        hbInterval = setInterval(() => {
          const now = Date.now();
          const timeSinceLastPong = now - lastPong;

          if (timeSinceLastPong > heartbeatInterval * 2) {
            console.warn('⏱️  Messaging heartbeat timeout');
            ws.close();
            return;
          }

          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(JSON.stringify({ type: 'PONG', timestamp: now }));
            } catch (err) {
              console.error('Failed to send PONG:', err);
            }
          }
        }, heartbeatInterval);
      };

      ws.onmessage = (event: MessageEvent<string>) => {
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
          console.error('Messaging: Failed to parse message:', err);
        }
      };

      ws.onerror = (_error: Event) => {
        console.error('❌ Messaging WebSocket error');
      };

      ws.onclose = () => {
        console.log('🔌 Messaging WebSocket closed');

        if (hbInterval) {
          clearInterval(hbInterval);
        }

        // Auto-reconnect
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }

        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('🔄 Reconnecting messaging WebSocket...');
          connectWebSocket();
        }, reconnectDelay);
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('Failed to create messaging WebSocket:', err);
    }
  }, [wsUrl, onMessage, reconnectDelay, heartbeatInterval]);

  // ==================== BROADCAST CHANNEL MANAGEMENT ====================
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;

    // Initialize broadcast channels
    broadcastChannels.forEach((channelName) => {
      try {
        const bc = new BroadcastChannel(channelName);
        bc.onmessage = (event: MessageEvent<any>) => {
          if (onMessage) {
            onMessage(event.data, null, { source: 'broadcast', channel: channelName });
          }
        };
        bcRefs.current[channelName] = bc;
      } catch (err) {
        console.error(`Failed to create BroadcastChannel ${channelName}:`, err);
      }
    });

    return () => {
      Object.values(bcRefs.current).forEach((bc) => {
        try {
          bc.close();
        } catch (err) {
          console.error('Failed to close BroadcastChannel:', err);
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
  const send = useCallback((message: WebSocketMessage): boolean => {
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
        console.error('Failed to send message via WebSocket:', err);
        messageQueueRef.current.push(message);
        return false;
      }
    } else {
      // Queue message if WebSocket not open
      messageQueueRef.current.push(message);
      return false;
    }
  }, []);

  const broadcast = useCallback((message: any, channelName: string | null = null): boolean => {
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
        console.error('Failed to broadcast message:', err);
        success = false;
      }
    });

    return success;
  }, []);

  const sendAndBroadcast = useCallback(
    (message: any, broadcastChannelName: string | null = null): boolean => {
      const wsSent = send(message);
      const bcSent = broadcast(message, broadcastChannelName);
      return wsSent || bcSent;
    },
    [send, broadcast],
  );

  // ==================== STATUS AND UTILITIES ====================
  const getStatus = useCallback((): MessagingStatus => {
    const wsState = wsRef.current?.readyState ?? WebSocket.CLOSED;
    return {
      ws: wsState,
      wsConnected: wsState === WebSocket.OPEN,
      broadcastChannels: Object.keys(bcRefs.current),
      messageQueueLength: messageQueueRef.current.length,
    };
  }, []);

  const isConnected = useCallback((): boolean => wsRef.current?.readyState === WebSocket.OPEN, []);

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
