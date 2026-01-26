import React, { FC, useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const API_PROTOCOL = window.location.protocol === 'https:' ? 'https' : 'http';
const API_BASE = `${API_PROTOCOL}://${window.location.hostname}:8000/api/public`;

// Storage key for spectator token
const SPECTATOR_TOKEN_KEY = 'escalada_spectator_token';
const SPECTATOR_TOKEN_EXPIRES_KEY = 'escalada_spectator_token_expires';

type PublicBoxInfo = {
  boxId: number;
  label: string;
  initiated: boolean;
  timerState?: string | null;
  currentClimber?: string | null;
  categorie?: string | null;
};

/**
 * Get or refresh spectator token.
 * Token is stored in memory + localStorage with expiry check.
 */
export async function getSpectatorToken(): Promise<string> {
  // Check if we have a valid cached token
  const cached = localStorage.getItem(SPECTATOR_TOKEN_KEY);
  const expiresStr = localStorage.getItem(SPECTATOR_TOKEN_EXPIRES_KEY);
  
  if (cached && expiresStr) {
    const expires = parseInt(expiresStr, 10);
    // Refresh if less than 1 hour remaining
    if (Date.now() < expires - 60 * 60 * 1000) {
      return cached;
    }
  }

  // Fetch new token
  const response = await fetch(`${API_BASE}/token`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error('Failed to get spectator token');
  }

  const data = await response.json();
  const token = data.access_token;
  const expiresIn = data.expires_in || 24 * 60 * 60; // default 24h

  // Store token and expiry
  localStorage.setItem(SPECTATOR_TOKEN_KEY, token);
  localStorage.setItem(SPECTATOR_TOKEN_EXPIRES_KEY, String(Date.now() + expiresIn * 1000));

  return token;
}

/**
 * Clear spectator token (for logout or error recovery).
 */
export function clearSpectatorToken(): void {
  localStorage.removeItem(SPECTATOR_TOKEN_KEY);
  localStorage.removeItem(SPECTATOR_TOKEN_EXPIRES_KEY);
}

const PublicHub: FC = () => {
  const navigate = useNavigate();
  const [boxes, setBoxes] = useState<PublicBoxInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBox, setSelectedBox] = useState<number | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  const fetchBoxes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const token = await getSpectatorToken();
      const response = await fetch(`${API_BASE}/boxes?token=${encodeURIComponent(token)}`);

      if (response.status === 401) {
        // Token expired, clear and retry
        clearSpectatorToken();
        const newToken = await getSpectatorToken();
        const retryResponse = await fetch(`${API_BASE}/boxes?token=${encodeURIComponent(newToken)}`);
        if (!retryResponse.ok) {
          throw new Error('Failed to fetch boxes');
        }
        const data = await retryResponse.json();
        setBoxes(data.boxes || []);
      } else if (!response.ok) {
        throw new Error('Failed to fetch boxes');
      } else {
        const data = await response.json();
        setBoxes(data.boxes || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBoxes();
    // Refresh boxes list every 30 seconds
    const interval = setInterval(fetchBoxes, 30000);
    return () => clearInterval(interval);
  }, [fetchBoxes]);

  const handleLiveRankings = () => {
    navigate('/public/rankings');
  };

  const handleLiveClimbing = () => {
    if (boxes.length === 0) {
      setError("The competition hasn't started yet. Please check back later.");
      return;
    }
    setShowDropdown(true);
  };

  const handleSelectBox = (boxId: number) => {
    setSelectedBox(boxId);
    setShowDropdown(false);
    navigate(`/public/live-climbing/${boxId}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center p-6">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-white mb-2">🧗 Escalada Live</h1>
        <p className="text-slate-400">Follow the competition live</p>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-6 p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-200 max-w-md text-center">
          {error}
          <button
            onClick={() => {
              setError(null);
              fetchBoxes();
            }}
            className="ml-4 underline hover:text-red-100"
          >
            Retry
          </button>
        </div>
      )}

      {/* Main buttons */}
      <div className="flex flex-col sm:flex-row gap-6 w-full max-w-lg">
        {/* Live Rankings */}
        <button
          onClick={handleLiveRankings}
          className="flex-1 p-8 bg-gradient-to-br from-cyan-600 to-cyan-700 hover:from-cyan-500 hover:to-cyan-600 text-white rounded-2xl shadow-xl transition-all duration-200 transform hover:scale-105 active:scale-95"
        >
          <div className="text-5xl mb-4">🏆</div>
          <div className="text-2xl font-semibold">Live Rankings</div>
          <div className="text-cyan-200 mt-2 text-sm">Real-time leaderboard</div>
        </button>

        {/* Live Climbing */}
        <div className="flex-1 relative">
          <button
            onClick={handleLiveClimbing}
            disabled={loading}
            className="w-full p-8 bg-gradient-to-br from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white rounded-2xl shadow-xl transition-all duration-200 transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="text-5xl mb-4">🧗</div>
            <div className="text-2xl font-semibold">Live Climbing</div>
            <div className="text-emerald-200 mt-2 text-sm">
              {loading
                ? 'Loading...'
                : `${boxes.length} active ${boxes.length === 1 ? 'category' : 'categories'}`}
            </div>
          </button>

          {/* Dropdown for box selection */}
          {showDropdown && boxes.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl z-50 overflow-hidden">
              <div className="p-3 border-b border-slate-700 text-slate-300 text-sm font-medium">
                Choose a category:
              </div>
              <div className="max-h-64 overflow-y-auto">
                {boxes.map((box) => (
                  <button
                    key={box.boxId}
                    onClick={() => handleSelectBox(box.boxId)}
                    className="w-full p-4 text-left hover:bg-slate-700 transition-colors border-b border-slate-700 last:border-b-0"
                  >
                    <div className="text-white font-medium">{box.label}</div>
                    {box.currentClimber && (
                      <div className="text-slate-400 text-sm mt-1">
                        🧗 {box.currentClimber}
                        {box.timerState === 'running' && (
                          <span className="ml-2 inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                        )}
                      </div>
                    )}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowDropdown(false)}
                className="w-full p-3 text-slate-400 hover:text-white hover:bg-slate-700 text-sm"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-12 text-slate-500 text-sm">
        {loading ? (
          <span className="flex items-center gap-2">
            <span className="animate-spin">⟳</span> Loading...
          </span>
        ) : (
          <span>Auto-updating</span>
        )}
      </div>
    </div>
  );
};

export default PublicHub;
