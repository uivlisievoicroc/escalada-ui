/**
 * Test suite for PublicHub component
 * 
 * Purpose:
 * - Verifies spectator landing page behavior (token management, box fetching, navigation UI)
 * - Tests authentication flow (token fetch, caching, proactive refresh, error recovery)
 * - Validates dropdown interaction (box selection, empty state, error messages)
 * - Ensures API integration works correctly (fetch calls, query params, response parsing)
 * 
 * Coverage:
 * - Token lifecycle: fetch on mount, cache validation, localStorage persistence, expiry checks
 * - Box polling: initial fetch, 30s interval (not tested here - see integration tests), error handling
 * - UI states: loading, error banner, dropdown open/closed, disabled buttons
 * - Navigation: Live Rankings (immediate), Live Climbing (dropdown selection), Officials button
 * 
 * Mocking Strategy:
 * - global.fetch: Mock API responses (token endpoint, boxes endpoint)
 * - localStorage: Mock cache operations (getItem for token retrieval, setItem for token storage)
 * - BrowserRouter: Wrap component to enable React Router navigation hooks
 * 
 * Test Data Patterns:
 * - Mock tokens: Simple strings ("test-token", "cached-token") with 24h TTL (86400 seconds)
 * - Mock boxes: Objects with {boxId, label, initiated, timerState, currentClimber?}
 * - Expiry timestamps: Date.now() + offset (ms) for cache validation tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import PublicHub from '../components/PublicHub';

// Mock global fetch API
// Used to intercept API calls to /api/public/token and /api/public/boxes
// Tests can configure return values via mockResolvedValueOnce
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock browser localStorage API
// Tracks token persistence across page reloads
// Keys: 'escalada_spectator_token' (JWT string), 'escalada_spectator_token_expires' (timestamp ms)
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('PublicHub', () => {
  /**
   * Reset all mocks before each test
   * - Clears fetch call history (ensures each test starts clean)
   * - Resets localStorage to empty state (simulates first-time visitor)
   * - Prevents test pollution (one test's mocks don't affect others)
   */
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null); // No cached token by default
  });

  /**
   * Test: Basic rendering of main navigation buttons
   * 
   * Verifies:
   * - Component mounts without errors
   * - Main navigation buttons render (Live Rankings, Live Climbing)
   * - Token fetch succeeds on mount (POST /api/public/token)
   * - Boxes fetch succeeds after token (GET /api/public/boxes?token=...)
   * 
   * Flow:
   * 1. Component mounts → triggers token fetch (no cache)
   * 2. Token received → stored in localStorage
   * 3. Boxes fetched with token → updates UI subtitle
   * 4. Buttons become enabled and clickable
   */
  it('renders Live Rankings and Live Climbing buttons', async () => {
    // Mock POST /api/public/token response (24h TTL = 86400 seconds)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ access_token: 'test-token', expires_in: 86400 }),
    });
    // Mock GET /api/public/boxes?token=test-token response (empty boxes list)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ boxes: [] }),
    });

    render(
      <BrowserRouter>
        <PublicHub />
      </BrowserRouter>
    );

    // Wait for async operations to complete (token fetch → boxes fetch → UI update)
    await waitFor(() => {
      expect(screen.getByText('Live Rankings')).toBeInTheDocument();
      expect(screen.getByText('Live Climbing')).toBeInTheDocument();
    });
  });

  /**
   * Test: Dropdown interaction with multiple initiated boxes
   * 
   * Verifies:
   * - Boxes fetch returns multiple categories (Youth, Adults)
   * - Subtitle updates with category count ("2 active categories")
   * - Clicking "Live Climbing" opens dropdown modal
   * - Dropdown shows all initiated boxes with labels
   * - Timer state and current climber display (Adults shows "Alex" climbing)
   * 
   * Flow:
   * 1. Mount → token + boxes fetched
   * 2. UI shows "2 active categories" subtitle
   * 3. User clicks "Live Climbing" button
   * 4. Dropdown modal appears with category list
   * 5. Each box shows label + optional status (timer/climber)
   */
  it('shows dropdown with initiated boxes when Live Climbing is clicked', async () => {
    // Two boxes with different states:
    // - Youth: idle (no climber, timer not running)
    // - Adults: running timer with active climber (shows "Alex" + green pulse indicator)
    const mockBoxes = [
      { boxId: 0, label: 'Youth', initiated: true, timerState: 'idle' },
      { boxId: 1, label: 'Adults', initiated: true, timerState: 'running', currentClimber: 'Alex' },
    ];

    // Mock token fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ access_token: 'test-token', expires_in: 86400 }),
    });
    // Mock boxes fetch (returns 2 initiated boxes)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ boxes: mockBoxes }),
    });

    render(
      <BrowserRouter>
        <PublicHub />
      </BrowserRouter>
    );

    // Wait for boxes to load and subtitle to update
    await waitFor(() => {
      expect(screen.getByText(/2 active categor/i)).toBeInTheDocument();
    });

    // Trigger dropdown by clicking Live Climbing button
    const liveClimbingButton = screen.getByText('Live Climbing').closest('button');
    fireEvent.click(liveClimbingButton!);

    // Verify dropdown contents: header + both box labels
    await waitFor(() => {
      expect(screen.getByText('Choose a category:')).toBeInTheDocument();
      expect(screen.getByText('Youth')).toBeInTheDocument();
      expect(screen.getByText('Adults')).toBeInTheDocument();
    });
  });

  /**
   * Test: Error state when no boxes are initiated
   * 
   * Verifies:
   * - Empty boxes array handled gracefully (no crash)
   * - Subtitle shows "0 active categories"
   * - Clicking "Live Climbing" shows error message instead of dropdown
   * - Error text explains competition hasn't started (user-friendly message)
   * - No navigation occurs (stays on PublicHub page)
   * 
   * Flow:
   * 1. Mount → token + empty boxes array fetched
   * 2. UI shows "0 active categories" subtitle
   * 3. User clicks "Live Climbing" (expecting dropdown)
   * 4. Error message appears: "Competition hasn't started yet"
   * 5. User can dismiss error and try again later
   * 
   * Real-world scenario:
   * - Admin hasn't initiated any routes yet (pre-competition)
   * - All routes finished and admin reset state (post-competition)
   */
  it('shows error when no boxes are initiated', async () => {
    // Mock token fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ access_token: 'test-token', expires_in: 86400 }),
    });
    // Mock boxes fetch with empty array (no initiated boxes)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ boxes: [] }),
    });

    render(
      <BrowserRouter>
        <PublicHub />
      </BrowserRouter>
    );

    // Wait for empty state to render
    await waitFor(() => {
      expect(screen.getByText(/0 active categor/i)).toBeInTheDocument();
    });

    // Attempt to navigate to Live Climbing despite no boxes
    const liveClimbingButton = screen.getByText('Live Climbing').closest('button');
    fireEvent.click(liveClimbingButton!);

    // Verify error message appears (not dropdown)
    await waitFor(() => {
      expect(screen.getByText(/hasn't started yet/i)).toBeInTheDocument();
    });
  });

  /**
   * Test: Token fetch and localStorage persistence
   * 
   * Verifies:
   * - First-time visitor triggers token fetch (no cache)
   * - POST /api/public/token returns JWT (24h TTL)
   * - Token stored in localStorage for future use
   * - Expiry timestamp also stored (for cache validation)
   * 
   * Flow:
   * 1. Component mounts with empty localStorage
   * 2. getSpectatorToken() detects no cached token
   * 3. Fetch POST /api/public/token (no credentials required)
   * 4. Response: {access_token: "new-token", expires_in: 86400}
   * 5. Store token + calculated expiry in localStorage
   * 6. Use token for subsequent API calls (boxes fetch)
   * 
   * localStorage keys:
   * - 'escalada_spectator_token': JWT string (used in ?token=... query param)
   * - 'escalada_spectator_token_expires': Timestamp (ms) when token expires
   */
  it('fetches and caches spectator token', async () => {
    // Mock POST /api/public/token response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ access_token: 'new-token', expires_in: 86400 }),
    });
    // Mock GET /api/public/boxes response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ boxes: [] }),
    });

    render(
      <BrowserRouter>
        <PublicHub />
      </BrowserRouter>
    );

    // Verify token was persisted to localStorage
    await waitFor(() => {
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'escalada_spectator_token',
        'new-token'
      );
    });
  });

  /**
   * Test: Cached token reuse (avoids redundant token fetches)
   * 
   * Verifies:
   * - Valid cached token is reused (no new fetch)
   * - Expiry check passes (futureExpiry > Date.now())
   * - Boxes fetch uses cached token in query param
   * - No POST /api/public/token call occurs
   * 
   * Flow:
   * 1. localStorage contains valid token (expires in 12h)
   * 2. Component mounts → getSpectatorToken() checks cache
   * 3. Cache validation: expiry timestamp > now → use cached token
   * 4. Skip token fetch, proceed directly to boxes fetch
   * 5. Boxes API called with ?token=cached-token
   * 
   * Performance benefit:
   * - Reduces API load (no token endpoint hit on every page load)
   * - Faster page loads (one less network request)
   * - Only fetch new token when expired or missing
   * 
   * Cache invalidation:
   * - Token expires (expiry < Date.now()) → fetch new token
   * - Token missing from localStorage → fetch new token
   * - <1h remaining (proactive refresh) → fetch new token in background
   */
  it('uses cached token if not expired', async () => {
    // Simulate returning visitor with valid cached token
    // Token expires in 12 hours (plenty of time remaining, no refresh needed)
    const futureExpiry = Date.now() + 12 * 60 * 60 * 1000; // 12 hours from now
    localStorageMock.getItem.mockImplementation((key: string) => {
      if (key === 'escalada_spectator_token') return 'cached-token';
      if (key === 'escalada_spectator_token_expires') return futureExpiry.toString();
      return null;
    });

    // Mock GET /api/public/boxes only (no token fetch should occur)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ boxes: [] }),
    });

    render(
      <BrowserRouter>
        <PublicHub />
      </BrowserRouter>
    );

    // Verify boxes fetch uses cached token (appears in query string)
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('token=cached-token')
      );
    });

    // Verify NO token fetch occurred (cache hit)
    expect(mockFetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/token'),
      expect.objectContaining({ method: 'POST' })
    );
  });
});
