import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { createHash } from 'node:crypto';
import PublicRankings from '../components/PublicRankings';

const buildLineageKey = (hold: number): string => {
  const payload =
    '{"context":"overall","performance":{"hold":' +
    hold +
    ',"plus":false,"topped":false},"round":"Final|route:1"}';
  const digest = createHash('sha1').update(payload).digest('hex');
  return `tb-lineage:${digest}`;
};

const buildSnapshotBoxes = () => {
  const prevLineageKey = buildLineageKey(20);
  return [
    {
      boxId: 0,
      categorie: 'Seniori',
      initiated: true,
      routeIndex: 1,
      holdsCount: 40,
      holdsCounts: [40],
      scoresByName: {
        Alice: [30],
        Bob: [30],
        Cara: [20],
        Dan: [20],
      },
      timesByName: {
        Alice: [100],
        Bob: [120],
        Cara: [140],
        Dan: [160],
      },
      prevRoundsTiebreakLineageRanks: {
        [prevLineageKey]: {
          Cara: 1,
          Dan: 2,
        },
      },
      leadRankingRows: [
        { name: 'Alice', rank: 1, total: 30, tb_time: true, tb_prev: false },
        { name: 'Bob', rank: 2, total: 30, tb_time: true, tb_prev: false },
        { name: 'Cara', rank: 3, total: 20, tb_time: false, tb_prev: true },
        { name: 'Dan', rank: 4, total: 20, tb_time: false, tb_prev: false },
      ],
    },
    {
      boxId: 1,
      categorie: 'Juniori',
      initiated: true,
      routeIndex: 1,
      holdsCount: 35,
      holdsCounts: [35],
      scoresByName: {
        Eva: [15],
        Florin: [15],
      },
      timesByName: {
        Eva: [95],
        Florin: [100],
      },
      // Missing lineage data on purpose (fallback case)
      leadRankingRows: [
        { name: 'Eva', rank: 1, total: 15, tb_time: false, tb_prev: true },
        { name: 'Florin', rank: 2, total: 15, tb_time: false, tb_prev: false },
      ],
    },
  ];
};

describe('PublicRankings TB interactive badges', () => {
  beforeEach(() => {
    if (typeof localStorage?.getItem === 'function') {
      (localStorage.getItem as any).mockReturnValue(null);
    }

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes('/api/public/rankings')) {
        return {
          ok: true,
          json: async () => ({ boxes: buildSnapshotBoxes() }),
        };
      }
      if (String(url).includes('/api/public/token')) {
        return {
          ok: true,
          json: async () => ({ access_token: 'spectator-token', expires_in: 86400 }),
        };
      }
      return {
        ok: false,
        status: 404,
        json: async () => ({}),
      };
    });

    global.WebSocket = vi.fn().mockImplementation(() => {
      return {
        send: vi.fn(),
        close: vi.fn(),
      };
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('opens TB Time popover with tie reason, members, holds and times', async () => {
    render(
      <BrowserRouter>
        <PublicRankings />
      </BrowserRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'TB Time details for Alice' }));

    await waitFor(() => {
      expect(screen.getByText(/Time tie-break for rank 1/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Athletes are tied on current-route performance. Tie was resolved by recorded time/i),
      ).toBeInTheDocument();
      expect(screen.getAllByText(/Holds 30/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Time 01:40/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Time 02:00/).length).toBeGreaterThan(0);
    });
  });

  it('opens TB Prev popover with previous-rank details', async () => {
    render(
      <BrowserRouter>
        <PublicRankings />
      </BrowserRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Cara')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'TB Prev details for Cara' }));

    await waitFor(() => {
      expect(screen.getByText(/Previous-rounds tie-break for rank 3/i)).toBeInTheDocument();
      expect(screen.getByText(/Prev rank 1/i)).toBeInTheDocument();
      expect(screen.getByText(/Prev rank 2/i)).toBeInTheDocument();
    });
  });

  it('shows fallback when TB Prev lineage data is missing', async () => {
    render(
      <BrowserRouter>
        <PublicRankings />
      </BrowserRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Juniori')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Juniori/i }));
    fireEvent.click(screen.getByRole('button', { name: 'TB Prev details for Eva' }));

    await waitFor(() => {
      expect(
        screen.getByText(/Historical tie-break data is not available in this snapshot\./i),
      ).toBeInTheDocument();
    });
  });

  it('closes helper on outside click and Escape key', async () => {
    render(
      <BrowserRouter>
        <PublicRankings />
      </BrowserRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'TB Time details for Alice' }));
    await waitFor(() => {
      expect(screen.getByText(/Time tie-break for rank 1/i)).toBeInTheDocument();
    });

    fireEvent.mouseDown(document.body);
    await waitFor(() => {
      expect(screen.queryByText(/Time tie-break for rank 1/i)).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'TB Time details for Alice' }));
    await waitFor(() => {
      expect(screen.getByText(/Time tie-break for rank 1/i)).toBeInTheDocument();
    });

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByText(/Time tie-break for rank 1/i)).not.toBeInTheDocument();
    });
  });

  it('closes helper when category selection changes', async () => {
    render(
      <BrowserRouter>
        <PublicRankings />
      </BrowserRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'TB Time details for Alice' }));
    await waitFor(() => {
      expect(screen.getByText(/Time tie-break for rank 1/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Juniori/i }));
    await waitFor(() => {
      expect(screen.queryByText(/Time tie-break for rank 1/i)).not.toBeInTheDocument();
    });
  });
});
