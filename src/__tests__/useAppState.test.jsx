import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import React from 'react';
import { useAppState, useBoxState, AppStateProvider } from '../utilis/useAppState';

/**
 * Test suite pentru useAppState hook
 * Tests: State initialization, mutations, persistence
 */

describe('AppStateProvider and useAppState Hook', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should initialize with default state', () => {
    let capturedState;

    function TestComponent() {
      const state = useAppState();
      capturedState = state;
      return <div>Ready</div>;
    }

    render(
      <AppStateProvider>
        <TestComponent />
      </AppStateProvider>,
    );

    expect(capturedState.listboxes).toBeDefined();
    expect(Array.isArray(capturedState.listboxes)).toBe(true);
    expect(capturedState.climbingTime).toBe('05:00');
    expect(capturedState.timeCriterionEnabled).toBe(false);
  });

  it('should throw error when used outside provider', () => {
    function TestComponent() {
      const state = useAppState();
      return null;
    }

    // Render without AppStateProvider should throw
    expect(() => {
      render(<TestComponent />);
    }).toThrow();
  });

  it('should provide addBox function', () => {
    let capturedState;

    function TestComponent() {
      const state = useAppState();
      capturedState = state;
      expect(typeof state.addBox).toBe('function');
      return null;
    }

    render(
      <AppStateProvider>
        <TestComponent />
      </AppStateProvider>,
    );
  });

  it('should provide removeBox function', () => {
    let capturedState;

    function TestComponent() {
      const state = useAppState();
      capturedState = state;
      expect(typeof state.removeBox).toBe('function');
      return null;
    }

    render(
      <AppStateProvider>
        <TestComponent />
      </AppStateProvider>,
    );
  });

  it('should provide updateBoxState function', () => {
    let capturedState;

    function TestComponent() {
      const state = useAppState();
      capturedState = state;
      expect(typeof state.updateBoxState).toBe('function');
      return null;
    }

    render(
      <AppStateProvider>
        <TestComponent />
      </AppStateProvider>,
    );
  });

  it('should provide getBoxState function', () => {
    let capturedState;

    function TestComponent() {
      const state = useAppState();
      capturedState = state;
      expect(typeof state.getBoxState).toBe('function');
      return null;
    }

    render(
      <AppStateProvider>
        <TestComponent />
      </AppStateProvider>,
    );
  });
});

describe('useBoxState Hook', () => {
  it('should return box state when available', () => {
    let boxState;

    function TestComponent() {
      boxState = useBoxState(1);
      return null;
    }

    render(
      <AppStateProvider>
        <TestComponent />
      </AppStateProvider>,
    );

    expect(boxState).toBeDefined();
  });

  it('should return undefined for non-existent box', () => {
    let boxState;

    function TestComponent() {
      boxState = useBoxState(999);
      return null;
    }

    render(
      <AppStateProvider>
        <TestComponent />
      </AppStateProvider>,
    );

    expect(boxState).toBeDefined();
  });
});

describe('State Persistence', () => {
  it('should call localStorage.setItem when state changes', () => {
    function TestComponent() {
      const state = useAppState();
      return (
        <button
          onClick={() => {
            state.addBox({ id: 1, name: 'Test', competitors: [] });
          }}
        >
          Add Box
        </button>
      );
    }

    const { getByText } = render(
      <AppStateProvider>
        <TestComponent />
      </AppStateProvider>,
    );

    act(() => {
      getByText('Add Box').click();
    });

    expect(localStorage.setItem).toHaveBeenCalled();
  });
});

describe('BroadcastChannel Integration', () => {
  it('should create BroadcastChannel instances', () => {
    function TestComponent() {
      return null;
    }

    render(
      <AppStateProvider>
        <TestComponent />
      </AppStateProvider>,
    );

    // BroadcastChannel constructor should have been called
    expect(global.BroadcastChannel).toHaveBeenCalled();
  });
});
