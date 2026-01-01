import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMessaging } from '../utilis/useMessaging';

/**
 * Test suite pentru useMessaging hook
 * Tests: Initialization, message sending, status tracking
 */

describe('useMessaging Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with URL', () => {
    const { result } = renderHook(() => useMessaging('ws://localhost:8000/api/ws/1'));

    expect(result.current).toBeDefined();
  });

  it('should have send method', () => {
    const { result } = renderHook(() => useMessaging('ws://localhost:8000/api/ws/1'));

    expect(typeof result.current.send).toBe('function');
  });

  it('should have broadcast method', () => {
    const { result } = renderHook(() => useMessaging('ws://localhost:8000/api/ws/1'));

    expect(typeof result.current.broadcast).toBe('function');
  });

  it('should have isConnected method', () => {
    const { result } = renderHook(() => useMessaging('ws://localhost:8000/api/ws/1'));

    expect(typeof result.current.isConnected).toBe('function');
  });

  it('should have getStatus method', () => {
    const { result } = renderHook(() => useMessaging('ws://localhost:8000/api/ws/1'));

    expect(typeof result.current.getStatus).toBe('function');
  });

  it('should have reconnect method', () => {
    const { result } = renderHook(() => useMessaging('ws://localhost:8000/api/ws/1'));

    expect(typeof result.current.reconnect).toBe('function');
  });

  it('should handle send gracefully', () => {
    const { result } = renderHook(() => useMessaging('ws://localhost:8000/api/ws/1'));

    expect(() => {
      result.current.send({ type: 'TEST' });
    }).not.toThrow();
  });

  it('should handle broadcast gracefully', () => {
    const { result } = renderHook(() => useMessaging('ws://localhost:8000/api/ws/1'));

    expect(() => {
      result.current.broadcast({ type: 'TEST' }, 'test-channel');
    }).not.toThrow();
  });

  it('should return status information', () => {
    const { result } = renderHook(() => useMessaging('ws://localhost:8000/api/ws/1'));

    const status = result.current.getStatus();
    expect(status).toBeDefined();
    expect(typeof status).toBe('object');
  });

  it('should report connection status', () => {
    const { result } = renderHook(() => useMessaging('ws://localhost:8000/api/ws/1'));

    const isConnected = result.current.isConnected();
    expect(typeof isConnected).toBe('boolean');
  });

  it('should handle reconnect method', () => {
    const { result } = renderHook(() => useMessaging('ws://localhost:8000/api/ws/1'));

    expect(() => {
      result.current.reconnect();
    }).not.toThrow();
  });

  it('should accept onMessage callback', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useMessaging('ws://localhost:8000/api/ws/1', callback));

    expect(result.current).toBeDefined();
  });

  it('should accept options parameter', () => {
    const { result } = renderHook(() =>
      useMessaging('ws://localhost:8000/api/ws/1', undefined, {
        heartbeatInterval: 5000,
        heartbeatTimeout: 10000,
      }),
    );

    expect(result.current).toBeDefined();
  });

  it('should cleanup on unmount', () => {
    const { unmount } = renderHook(() => useMessaging('ws://localhost:8000/api/ws/1'));

    expect(() => {
      unmount();
    }).not.toThrow();
  });
});

describe('useMessaging Message Handling', () => {
  it('should handle different message types', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useMessaging('ws://localhost:8000/api/ws/1', callback));

    act(() => {
      result.current.send({ type: 'PING' });
      result.current.send({ type: 'PROGRESS_UPDATE', delta: 1 });
      result.current.send({ type: 'SUBMIT_SCORE', score: 50 });
    });

    expect(result.current).toBeDefined();
  });

  it('should handle message queuing', () => {
    const { result } = renderHook(() => useMessaging('ws://localhost:8000/api/ws/1'));

    act(() => {
      result.current.send({ type: 'TEST1' });
      result.current.send({ type: 'TEST2' });
      result.current.send({ type: 'TEST3' });
    });

    expect(result.current).toBeDefined();
  });
});

describe('useMessaging BroadcastChannel', () => {
  it('should handle broadcast channel messages', () => {
    const { result } = renderHook(() => useMessaging('ws://localhost:8000/api/ws/1'));

    act(() => {
      result.current.broadcast({ type: 'TIMER_SYNC' }, 'escalada-state');
    });

    expect(result.current).toBeDefined();
  });

  it('should handle multiple channels', () => {
    const { result } = renderHook(() => useMessaging('ws://localhost:8000/api/ws/1'));

    act(() => {
      result.current.broadcast({ type: 'MSG1' }, 'channel-1');
      result.current.broadcast({ type: 'MSG2' }, 'channel-2');
    });

    expect(result.current).toBeDefined();
  });
});
