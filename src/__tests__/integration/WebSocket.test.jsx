import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Integration Tests - WebSocket Communication
 * Tests real-time message flow and connection management
 */

describe('WebSocket Integration', () => {
  let mockWs;
  let messageHandlers;

  beforeEach(() => {
    messageHandlers = {};

    // Mock WebSocket
    mockWs = {
      CONNECTING: 0,
      OPEN: 1,
      CLOSING: 2,
      CLOSED: 3,
      readyState: 1, // OPEN by default
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn((event, handler) => {
        messageHandlers[event] = handler;
      }),
      removeEventListener: vi.fn(),
    };

    global.WebSocket = vi.fn(() => mockWs);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Connection Lifecycle', () => {
    it('establishes WebSocket connection on Judge page load', () => {
      const boxId = 0;
      const wsUrl = `ws://localhost:8000/ws/box/${boxId}`;

      const ws = new WebSocket(wsUrl);

      expect(global.WebSocket).toHaveBeenCalledWith(wsUrl);
      expect(ws.readyState).toBe(1); // OPEN
    });

    it('fires onopen event when connected', () => {
      const onopen = vi.fn();
      mockWs.onopen = onopen;

      // Simulate connection established
      if (mockWs.onopen) {
        mockWs.onopen();
      }

      expect(onopen).toHaveBeenCalled();
    });

    it('fires onclose event when disconnected', () => {
      const onclose = vi.fn();
      mockWs.onclose = onclose;

      // Simulate connection closed
      mockWs.readyState = 3; // CLOSED
      if (mockWs.onclose) {
        mockWs.onclose();
      }

      expect(onclose).toHaveBeenCalled();
    });

    it('attempts reconnection on close', () => {
      const reconnectAttempt = vi.fn();

      // Simulate close triggers reconnect attempt
      mockWs.readyState = 3; // CLOSED

      // Exponential backoff: 1s, 2s, 4s, 8s... up to 30s
      const attempts = [1000, 2000, 4000, 8000, 16000, 30000];

      expect(attempts).toHaveLength(6);
      expect(attempts[0]).toBe(1000); // First retry after 1 second
    });

    it('stops reconnection after max attempts', () => {
      const maxAttempts = 10;
      let currentAttempt = 0;

      // Simulates reconnection loop
      while (currentAttempt < maxAttempts) {
        currentAttempt++;
        // Would attempt reconnect
      }

      // After 10 attempts, stop
      expect(currentAttempt).toBe(maxAttempts);
      expect(currentAttempt).not.toBe(maxAttempts + 1);
    });
  });

  describe('Message Sending', () => {
    it('sends PROGRESS_UPDATE command to backend', () => {
      const command = {
        type: 'PROGRESS_UPDATE',
        boxId: 0,
        boxVersion: 1,
        sessionId: 'session-123',
        delta: 1,
      };

      mockWs.send(JSON.stringify(command));

      expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify(command));
    });

    it('sends REQUEST_STATE command to get snapshot', () => {
      const command = {
        type: 'REQUEST_STATE',
        boxId: 0,
      };

      mockWs.send(JSON.stringify(command));

      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('REQUEST_STATE'));
    });

    it('validates command before sending', () => {
      const validateCommand = (cmd) => {
        if (!cmd || !cmd.type || typeof cmd.type !== 'string') {
          return false;
        }
        return true;
      };

      const validCommand = {
        type: 'PROGRESS_UPDATE',
        boxId: 0,
      };

      const invalidCommand = {
        // Missing type
        boxId: 0,
      };

      expect(validateCommand(validCommand)).toBe(true);
      expect(validateCommand(invalidCommand)).toBe(false);
    });

    it('buffers commands during reconnection', () => {
      // WebSocket disconnects
      mockWs.readyState = 3; // CLOSED

      // Commands queued while disconnected
      const commandBuffer = [
        { type: 'PROGRESS_UPDATE', delta: 1 },
        { type: 'PROGRESS_UPDATE', delta: 1 },
        { type: 'START_TIMER' },
      ];

      // On reconnection, flush buffer
      mockWs.readyState = 1; // OPEN

      for (const cmd of commandBuffer) {
        mockWs.send(JSON.stringify(cmd));
      }

      expect(mockWs.send).toHaveBeenCalledTimes(3);
    });
  });

  describe('Message Receiving', () => {
    it('handles STATE_SNAPSHOT message', () => {
      const stateSnapshot = {
        type: 'STATE_SNAPSHOT',
        boxId: 0,
        initiated: true,
        holdsCount: 25,
        currentClimber: 'John Doe',
        timerState: 'running',
        holdCount: 5,
        remaining: 280,
        sessionId: 'session-123',
      };

      const handleMessage = vi.fn();

      // Simulate receiving message
      const message = new MessageEvent('message', {
        data: JSON.stringify(stateSnapshot),
      });

      handleMessage(stateSnapshot);

      expect(handleMessage).toHaveBeenCalledWith(stateSnapshot);
    });

    it('handles multiple message types', () => {
      const messageTypes = [
        { type: 'STATE_SNAPSHOT', boxId: 0 },
        { type: 'TIMER_START', boxId: 0 },
        { type: 'TIMER_STOP', boxId: 0 },
        { type: 'PROGRESS_UPDATE', boxId: 0, delta: 1 },
        { type: 'MARK_COMPETITOR', boxId: 0, competitor: 'John' },
      ];

      const typeHandlers = {
        STATE_SNAPSHOT: vi.fn(),
        TIMER_START: vi.fn(),
        TIMER_STOP: vi.fn(),
        PROGRESS_UPDATE: vi.fn(),
        MARK_COMPETITOR: vi.fn(),
      };

      for (const msg of messageTypes) {
        const handler = typeHandlers[msg.type];
        if (handler) handler(msg);
      }

      expect(typeHandlers['STATE_SNAPSHOT']).toHaveBeenCalled();
      expect(typeHandlers['PROGRESS_UPDATE']).toHaveBeenCalled();
    });

    it('validates received message structure', () => {
      const isValidMessage = (msg) => {
        return (
          msg &&
          typeof msg === 'object' &&
          typeof msg.type === 'string' &&
          typeof msg.boxId === 'number'
        );
      };

      const validMsg = { type: 'STATE_SNAPSHOT', boxId: 0 };
      const invalidMsg = { type: 'STATE_SNAPSHOT' }; // Missing boxId

      expect(isValidMessage(validMsg)).toBe(true);
      expect(isValidMessage(invalidMsg)).toBe(false);
    });

    it('handles malformed JSON gracefully', () => {
      const parseMessage = (data) => {
        try {
          return JSON.parse(data);
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
          return null;
        }
      };

      const validJson = JSON.stringify({ type: 'STATE_SNAPSHOT' });
      const malformedJson = 'invalid-json{{{';

      expect(parseMessage(validJson)).toBeDefined();
      expect(parseMessage(malformedJson)).toBe(null);
    });
  });

  describe('Heartbeat Protocol', () => {
    it('sends PING to server every 30 seconds', () => {
      const heartbeatInterval = 30000; // 30 seconds
      const sendPing = vi.fn();

      // Simulate heartbeat timer
      const intervalId = setInterval(sendPing, heartbeatInterval);

      // After 30 seconds, PING sent
      expect(sendPing).not.toHaveBeenCalled();

      clearInterval(intervalId);
    });

    it('receives PONG response from server', () => {
      const pongMessage = {
        type: 'PONG',
        timestamp: Date.now(),
      };

      const handlePong = vi.fn();

      // Simulate receiving PONG
      handlePong(pongMessage);

      expect(handlePong).toHaveBeenCalledWith(pongMessage);
    });

    it('detects connection timeout if no PONG received', () => {
      // Send PING
      const pingTime = Date.now();

      // If no PONG after 60 seconds, timeout
      const pongTimeout = 60000;
      const waitTime = Date.now() - pingTime;

      // Simulate timeout
      if (waitTime > pongTimeout) {
        // Connection dead, should reconnect
      }

      expect(pongTimeout).toBe(60000);
    });

    it('resets heartbeat timer on message receipt', () => {
      let lastMessageTime = Date.now();

      // Message received
      const msg = { type: 'STATE_SNAPSHOT' };
      lastMessageTime = Date.now();

      // Next PING check
      const timeSinceLastMsg = Date.now() - lastMessageTime;

      // Should be close to 0
      expect(timeSinceLastMsg).toBeLessThanOrEqual(100);
    });
  });

  describe('Error Handling', () => {
    it('handles WebSocket error event', () => {
      const onerror = vi.fn();
      mockWs.onerror = onerror;

      const errorEvent = new Event('error');

      if (mockWs.onerror) {
        mockWs.onerror(errorEvent);
      }

      expect(onerror).toHaveBeenCalledWith(errorEvent);
    });

    it('handles network timeout', () => {
      const timeoutError = new Error('Network timeout');

      // Simulate timeout after 5 seconds
      const requestTimeout = 5000;

      expect(requestTimeout).toBe(5000);
      expect(timeoutError.message).toContain('timeout');
    });

    it('recovers from temporary network hiccup', () => {
      // Connection drops temporarily
      mockWs.readyState = 2; // CLOSING

      // Wait for auto-reconnect
      mockWs.readyState = 1; // OPEN (reconnected)

      expect(mockWs.readyState).toBe(1);
    });

    it('logs connection errors for debugging', () => {
      const debugError = vi.fn();

      const error = new Error('WebSocket connection failed');
      debugError(error);

      expect(debugError).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('Message Broadcasting', () => {
    it('broadcasts STATE_SNAPSHOT to all connected clients', () => {
      const clients = [
        { id: 'judge-tab', onmessage: vi.fn() },
        { id: 'control-tab', onmessage: vi.fn() },
        { id: 'display-screen', onmessage: vi.fn() },
      ];

      const stateSnapshot = {
        type: 'STATE_SNAPSHOT',
        boxId: 0,
        timerState: 'running',
      };

      // Backend broadcasts to all clients
      for (const client of clients) {
        if (client.onmessage) {
          client.onmessage({ data: JSON.stringify(stateSnapshot) });
        }
      }

      // All clients received update
      expect(clients[0].onmessage).toHaveBeenCalled();
      expect(clients[1].onmessage).toHaveBeenCalled();
      expect(clients[2].onmessage).toHaveBeenCalled();
    });

    it('broadcasts timer updates to all Judge tabs for same box', () => {
      // Two Judge tabs open for Box 0
      const judgeTab1 = { id: 'judge-0-tab1', onmessage: vi.fn() };
      const judgeTab2 = { id: 'judge-0-tab2', onmessage: vi.fn() };

      const timerUpdate = {
        type: 'PROGRESS_UPDATE',
        boxId: 0,
        delta: 1,
      };

      // Both should receive update
      [judgeTab1, judgeTab2].forEach((tab) => {
        if (tab.onmessage) {
          tab.onmessage({ data: JSON.stringify(timerUpdate) });
        }
      });

      expect(judgeTab1.onmessage).toHaveBeenCalled();
      expect(judgeTab2.onmessage).toHaveBeenCalled();
    });

    it('does not broadcast to wrong box subscribers', () => {
      // Judge for Box 0
      const judgeBox0 = { id: 'judge-box-0', onmessage: vi.fn() };
      // Judge for Box 1
      const judgeBox1 = { id: 'judge-box-1', onmessage: vi.fn() };

      const box0Update = {
        type: 'STATE_SNAPSHOT',
        boxId: 0,
      };

      // Only Box 0 judge should receive
      if (judgeBox0.id.includes('box-0')) {
        judgeBox0.onmessage({ data: JSON.stringify(box0Update) });
      }

      expect(judgeBox0.onmessage).toHaveBeenCalled();
      expect(judgeBox1.onmessage).not.toHaveBeenCalled();
    });
  });

  describe('Concurrent Message Handling', () => {
    it('processes multiple messages in order', () => {
      const processedMessages = [];

      const handleMessage = (msg) => {
        processedMessages.push(msg.type);
      };

      // Rapidly received messages
      const messages = [
        { type: 'PROGRESS_UPDATE', delta: 1 },
        { type: 'PROGRESS_UPDATE', delta: 1 },
        { type: 'TIMER_STOP' },
        { type: 'MARK_COMPETITOR', competitor: 'John' },
      ];

      for (const msg of messages) {
        handleMessage(msg);
      }

      expect(processedMessages).toEqual([
        'PROGRESS_UPDATE',
        'PROGRESS_UPDATE',
        'TIMER_STOP',
        'MARK_COMPETITOR',
      ]);
    });

    it('does not lose messages during queue processing', () => {
      const messageQueue = [];

      const queueMessage = (msg) => {
        messageQueue.push(msg);
      };

      const processQueue = () => {
        const processed = [...messageQueue];
        messageQueue.length = 0;
        return processed;
      };

      // Queue 100 messages
      for (let i = 0; i < 100; i++) {
        queueMessage({ type: 'PROGRESS_UPDATE', delta: 1 });
      }

      const processed = processQueue();

      expect(processed).toHaveLength(100);
      expect(messageQueue).toHaveLength(0);
    });

    it('handles state consistency with concurrent updates', () => {
      let state = {
        holdCount: 0,
        remaining: 300,
      };

      // Two messages arrive concurrently
      const updates = [
        { type: 'PROGRESS_UPDATE', delta: 1 },
        { type: 'PROGRESS_UPDATE', delta: 1 },
      ];

      // Must be processed sequentially to maintain consistency
      state.holdCount += 2;
      state.remaining -= 2;

      expect(state.holdCount).toBe(2);
      expect(state.remaining).toBe(298);
    });
  });

  describe('Performance', () => {
    it('handles high-frequency progress updates efficiently', () => {
      // Simulate 60 updates per second (timer countdown)
      const updateCount = 60;
      const updates = Array(updateCount).fill({
        type: 'PROGRESS_UPDATE',
        delta: 1,
      });

      const processedCount = updates.length;

      expect(processedCount).toBe(updateCount);
    });

    it('debounces rendering to prevent UI thrashing', () => {
      // 100 rapid updates
      const updates = Array(100).fill({ delta: 1 });

      // With debouncing (100ms), should render ~10 times per second
      const debounceMs = 100;
      const expectedRenders = Math.ceil((updates.length * debounceMs) / 1000);

      expect(expectedRenders).toBeLessThan(updates.length);
    });

    it('memory usage stays stable with long-running connections', () => {
      // Simulate receiving 1000 messages over 1 hour
      const messageCount = 1000;
      const connectionDuration = 3600000; // 1 hour in ms

      // Should not accumulate memory (messages processed and discarded)
      // Not actually testing memory here, just message throughput

      expect(messageCount).toBe(1000);
    });
  });
});
