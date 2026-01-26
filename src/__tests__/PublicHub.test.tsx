import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import PublicHub from '../components/PublicHub';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('PublicHub', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
  });

  it('renders Live Rankings and Live Climbing buttons', async () => {
    // Mock token fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ access_token: 'test-token', expires_in: 86400 }),
    });
    // Mock boxes fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ boxes: [] }),
    });

    render(
      <BrowserRouter>
        <PublicHub />
      </BrowserRouter>
    );

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('Live Rankings')).toBeInTheDocument();
      expect(screen.getByText('Live Climbing')).toBeInTheDocument();
    });
  });

  it('shows dropdown with initiated boxes when Live Climbing is clicked', async () => {
    const mockBoxes = [
      { boxId: 0, label: 'Youth', initiated: true, timerState: 'idle' },
      { boxId: 1, label: 'Adults', initiated: true, timerState: 'running', currentClimber: 'Alex' },
    ];

    // Mock token fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ access_token: 'test-token', expires_in: 86400 }),
    });
    // Mock boxes fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ boxes: mockBoxes }),
    });

    render(
      <BrowserRouter>
        <PublicHub />
      </BrowserRouter>
    );

    // Wait for boxes to load
    await waitFor(() => {
      expect(screen.getByText(/2 active categor/i)).toBeInTheDocument();
    });

    // Click Live Climbing
    const liveClimbingButton = screen.getByText('Live Climbing').closest('button');
    fireEvent.click(liveClimbingButton!);

    // Should show dropdown with categories
    await waitFor(() => {
      expect(screen.getByText('Choose a category:')).toBeInTheDocument();
      expect(screen.getByText('Youth')).toBeInTheDocument();
      expect(screen.getByText('Adults')).toBeInTheDocument();
    });
  });

  it('shows error when no boxes are initiated', async () => {
    // Mock token fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ access_token: 'test-token', expires_in: 86400 }),
    });
    // Mock boxes fetch - empty
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ boxes: [] }),
    });

    render(
      <BrowserRouter>
        <PublicHub />
      </BrowserRouter>
    );

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText(/0 active categor/i)).toBeInTheDocument();
    });

    // Click Live Climbing
    const liveClimbingButton = screen.getByText('Live Climbing').closest('button');
    fireEvent.click(liveClimbingButton!);

    // Should show error message
    await waitFor(() => {
      expect(screen.getByText(/hasn't started yet/i)).toBeInTheDocument();
    });
  });

  it('fetches and caches spectator token', async () => {
    // Mock token fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ access_token: 'new-token', expires_in: 86400 }),
    });
    // Mock boxes fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ boxes: [] }),
    });

    render(
      <BrowserRouter>
        <PublicHub />
      </BrowserRouter>
    );

    await waitFor(() => {
      // Token should be stored
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'escalada_spectator_token',
        'new-token'
      );
    });
  });

  it('uses cached token if not expired', async () => {
    // Set cached token that expires in the future
    const futureExpiry = Date.now() + 12 * 60 * 60 * 1000; // 12 hours from now
    localStorageMock.getItem.mockImplementation((key: string) => {
      if (key === 'escalada_spectator_token') return 'cached-token';
      if (key === 'escalada_spectator_token_expires') return futureExpiry.toString();
      return null;
    });

    // Mock boxes fetch only (no token fetch needed)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ boxes: [] }),
    });

    render(
      <BrowserRouter>
        <PublicHub />
      </BrowserRouter>
    );

    await waitFor(() => {
      // Should use cached token in boxes fetch
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('token=cached-token')
      );
    });

    // Should NOT have fetched a new token
    expect(mockFetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/token'),
      expect.objectContaining({ method: 'POST' })
    );
  });
});
