import React, { FC, useCallback, useEffect, useRef, useState } from 'react';
import { RankingsPageSkeleton } from './Skeleton';
import RankingsBoard, { PublicBox, RankingsHeaderCard, normalizeBox } from './RankingsBoard';

const API_PROTOCOL = window.location.protocol === 'https:' ? 'https' : 'http';
const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss' : 'ws';
const API_BASE = `${API_PROTOCOL}://${window.location.hostname}:8000/api/public`;
const WS_URL = `${WS_PROTOCOL}://${window.location.hostname}:8000/api/public/ws`;
const POLL_INTERVAL_MS = 5000;

const RankingsPage: FC = () => {
  const [boxes, setBoxes] = useState<Record<number, PublicBox>>({});
  const [selectedBoxId, setSelectedBoxId] = useState<number | null>(null);
  const [isWsConnected, setIsWsConnected] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<number | null>(null);
  const pollingRef = useRef<number | null>(null);
  const closedRef = useRef(false);

  const applySnapshot = useCallback((payloadBoxes: PublicBox[]) => {
    const next: Record<number, PublicBox> = {};
    payloadBoxes.forEach((box) => {
      if (typeof box?.boxId !== 'number') return;
      next[box.boxId] = normalizeBox(box);
    });
    setBoxes(next);
    setIsInitialLoading(false);
  }, []);

  const applyBoxUpdate = useCallback((box: PublicBox) => {
    if (typeof box?.boxId !== 'number') return;
    setBoxes((prev) => ({
      ...prev,
      [box.boxId]: normalizeBox(box),
    }));
  }, []);

  const fetchSnapshot = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/rankings`);
      if (!res.ok) return;
      const data = await res.json();
      if (data?.type === 'PUBLIC_STATE_SNAPSHOT' && Array.isArray(data.boxes)) {
        applySnapshot(data.boxes);
      }
    } catch {
      // ignore poll errors
    }
  }, [applySnapshot]);

  const startPolling = useCallback(() => {
    if (pollingRef.current) return;
    fetchSnapshot();
    pollingRef.current = window.setInterval(fetchSnapshot, POLL_INTERVAL_MS);
  }, [fetchSnapshot]);

  const stopPolling = useCallback(() => {
    if (!pollingRef.current) return;
    window.clearInterval(pollingRef.current);
    pollingRef.current = null;
  }, []);

  const connectWs = useCallback(() => {
    if (closedRef.current) return;
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // ignore
      }
    }
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsWsConnected(true);
      stopPolling();
      try {
        ws.send(JSON.stringify({ type: 'REQUEST_STATE' }));
      } catch {
        // ignore
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg?.type === 'PING') {
          ws.send(JSON.stringify({ type: 'PONG', timestamp: msg.timestamp }));
          return;
        }
        if (msg?.type === 'PUBLIC_STATE_SNAPSHOT' && Array.isArray(msg.boxes)) {
          applySnapshot(msg.boxes);
          return;
        }
        if (
          (msg?.type === 'BOX_STATUS_UPDATE' ||
            msg?.type === 'BOX_FLOW_UPDATE' ||
            msg?.type === 'BOX_RANKING_UPDATE') &&
          msg.box
        ) {
          applyBoxUpdate(msg.box);
        }
      } catch {
        // ignore malformed
      }
    };

    ws.onerror = () => {
      setIsWsConnected(false);
      startPolling();
    };

    ws.onclose = () => {
      setIsWsConnected(false);
      startPolling();
      if (!closedRef.current) {
        reconnectRef.current = window.setTimeout(connectWs, 2000);
      }
    };
  }, [applyBoxUpdate, applySnapshot, startPolling, stopPolling]);

  useEffect(() => {
    closedRef.current = false;
    connectWs();
    return () => {
      closedRef.current = true;
      stopPolling();
      if (reconnectRef.current) {
        window.clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // ignore
        }
      }
    };
  }, [connectWs, stopPolling]);

  // Show skeleton during initial load
  if (isInitialLoading) {
    return <RankingsPageSkeleton />;
  }

  return (
    <div className="min-h-screen overflow-y-auto bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-50 md:h-screen md:overflow-hidden">
      <div className="mx-auto flex h-full max-w-[1400px] flex-col gap-3 px-3 py-3 md:gap-4 md:px-4 md:py-4">
        <RankingsHeaderCard isWsConnected={isWsConnected} />
        <RankingsBoard boxes={boxes} selectedBoxId={selectedBoxId} setSelectedBoxId={setSelectedBoxId} />
      </div>
    </div>
  );
};

export default RankingsPage;
