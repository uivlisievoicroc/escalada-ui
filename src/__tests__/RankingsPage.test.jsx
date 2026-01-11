import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, within } from '@testing-library/react';
import RankingsPage from '../components/RankingsPage';

vi.mock('../utilis/sanitize', () => ({
  sanitizeBoxName: (text) => text,
  sanitizeCompetitorName: (text) => text,
}));

describe('RankingsPage', () => {
  let wsInstances = [];

  beforeEach(() => {
    wsInstances = [];
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        type: 'PUBLIC_STATE_SNAPSHOT',
        boxes: [
          {
            boxId: 0,
            categorie: 'U16',
            initiated: true,
            routeIndex: 2,
            routesCount: 2,
            holdsCounts: [10, 10],
            currentClimber: 'Alice',
            preparingClimber: 'Bob',
            timerState: 'idle',
            scoresByName: { Alice: [null, 6.0] },
            timesByName: { Alice: [null, 12.0] },
          },
        ],
      }),
    });

    global.WebSocket = vi.fn().mockImplementation(() => {
      const ws = {
        send: vi.fn(),
        close: vi.fn(),
      };
      wsInstances.push(ws);
      return ws;
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders null scores without crashing', async () => {
    render(<RankingsPage />);
    const ws = wsInstances[0];

    await act(async () => {
      if (ws && typeof ws.onerror === 'function') {
        ws.onerror();
      }
    });

    await screen.findByText('Score(T1)');
    const rowLabel = await screen.findByText('1. Alice');
    const row = rowLabel.closest('div');
    expect(row).not.toBeNull();
    if (row) {
      expect(within(row).getByText('—')).toBeInTheDocument();
      expect(within(row).getByText('6.0')).toBeInTheDocument();
    }
  });
});
