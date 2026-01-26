# Copilot instructions (escalada-ui)

## What this repo is
- React + Vite UI for real-time competition control.
- Routes are defined in `src/App.tsx` (Control Panel, Contest Page, Judge Page, Admin Audit).

## API/WS integration patterns
- HTTP command endpoint (ControlPanel): `http(s)://{host}:8000/api/cmd` (see `src/components/ControlPanel.tsx`).
- Per-box state fetch (to learn/refresh `sessionId`): `GET /api/state/{boxId}`.
- WebSocket per box (Contest page): `ws(s)://{host}:8000/api/ws/{boxId}?token=...` (see `src/components/ContestPage.tsx`).
- WS heartbeat: server `PING` → client `PONG` every 30s (see `src/utilis/useWebSocketWithHeartbeat.js`).
- Circuit breaker: WS stops retrying after `MAX_RECONNECT_ATTEMPTS` (10) failures.

## Cross-tab synchronization (don’t break these names)
- BroadcastChannels used for cross-tab sync:
  - `escalada-state` + `timer-cmd` (centralized in `src/utilis/useAppState.tsx`).
  - `escalada-timer` (used by `src/components/ContestPage.tsx`).
## Public spectator routes
- `/public` → Public Hub with "Live Rankings" and "Live Climbing" buttons.
- `/public/rankings` → Read-only rankings page connected to `/api/public/ws`.
- `/public/live-climbing/:boxId` → Live climbing view for spectators.
- Token: obtained from `POST /api/public/token` (24h TTL), stored in localStorage.
- QR link: `http://{ui-host}/public` (fixed, no params).
## State conventions
- Persistent keys in localStorage include: `listboxes`, `climbingTime`, `timeCriterionEnabled` (see `src/utilis/useAppState.tsx` and `src/components/ControlPanel.tsx`).
- Input safety: use `src/utilis/sanitize.js` (`dompurify`) and existing helpers (`sanitizeCompetitorName`, `sanitizeBoxName`).

## Dev workflow
- Dev server: `npm run dev` (Vite).
- Unit tests: `npm run test -- --run` (Vitest; see `src/__tests__/`).
- E2E: `npx playwright test --reporter=list` (specs in `e2e/`; tests multi-tab sync via separate browser contexts).
- Format: `npm run format` (Prettier; Husky + lint-staged formats on commit).
