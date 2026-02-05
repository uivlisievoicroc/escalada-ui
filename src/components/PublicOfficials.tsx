import React, { FC, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSpectatorToken, clearSpectatorToken } from './PublicHub';

const API_PROTOCOL = window.location.protocol === 'https:' ? 'https' : 'http';
const API_BASE = `${API_PROTOCOL}://${window.location.hostname}:8000/api/public`;

type Officials = {
  judgeChief: string;
  competitionDirector: string;
  chiefRoutesetter: string;
};

const PublicOfficials: FC = () => {
  const navigate = useNavigate();
  const [officials, setOfficials] = useState<Officials>({
    judgeChief: '',
    competitionDirector: '',
    chiefRoutesetter: '',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOfficials = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getSpectatorToken();
      const res = await fetch(`${API_BASE}/officials?token=${encodeURIComponent(token)}`);
      if (res.status === 401) {
        clearSpectatorToken();
        const newToken = await getSpectatorToken();
        const retry = await fetch(`${API_BASE}/officials?token=${encodeURIComponent(newToken)}`);
        if (!retry.ok) throw new Error('Failed to fetch officials');
        const data = await retry.json();
        setOfficials({
          judgeChief: data.judgeChief || '',
          competitionDirector: data.competitionDirector || '',
          chiefRoutesetter: data.chiefRoutesetter || '',
        });
        return;
      }
      if (!res.ok) throw new Error('Failed to fetch officials');
      const data = await res.json();
      setOfficials({
        judgeChief: data.judgeChief || '',
        competitionDirector: data.competitionDirector || '',
        chiefRoutesetter: data.chiefRoutesetter || '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOfficials();
  }, [fetchOfficials]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      <header className="sticky top-0 z-50 bg-slate-900/95 backdrop-blur border-b border-slate-800 p-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <button
            onClick={() => navigate('/public')}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
          >
            <span>←</span>
            <span>Înapoi</span>
          </button>
          <h1 className="text-xl font-bold text-white">👥 Competition Officials</h1>
          <button
            onClick={fetchOfficials}
            className="text-slate-400 hover:text-white transition-colors text-sm"
            type="button"
          >
            Refresh
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-6">
        {error && (
          <div className="mb-4 p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-200">
            {error}
          </div>
        )}
        {loading ? (
          <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/40 text-slate-300">
            Loading…
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/40">
              <div className="text-xs uppercase tracking-wider text-slate-400">Chief Judge</div>
              <div className="mt-2 text-2xl font-semibold text-white">
                {officials.judgeChief || '—'}
              </div>
            </div>
              <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/40">
                <div className="text-xs uppercase tracking-wider text-slate-400">
                Event Director
                </div>
                <div className="mt-2 text-2xl font-semibold text-white">
                  {officials.competitionDirector || '—'}
                </div>
              </div>
            <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/40">
              <div className="text-xs uppercase tracking-wider text-slate-400">
                Chief Routesetter
              </div>
              <div className="mt-2 text-2xl font-semibold text-white">
                {officials.chiefRoutesetter || '—'}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default PublicOfficials;
