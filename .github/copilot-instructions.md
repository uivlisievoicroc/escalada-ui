# Copilot instructions (escalada-ui)

## What this repo is
- React + Vite UI for real-time competition control.
- Routes are defined in `src/App.tsx` (Control Panel, Contest Page, Judge Page, Admin Audit).

## API/WS integration patterns
- HTTP command endpoint (ControlPanel): `http(s)://{host}:8000/api/cmd` (see `src/components/ControlPanel.tsx`).
- Per-box state fetch (to learn/refresh `sessionId`): `GET /api/state/{boxId}`.
- WebSocket per box (Contest page): `ws(s)://{host}:8000/api/ws/{boxId}?token=...` (see `src/components/ContestPage.tsx`).
- WS heartbeat: server `PING` → client `PONG` (see `src/utilis/useWebSocketWithHeartbeat.js` and `src/utilis/useMessaging.tsx`).

## Cross-tab synchronization (don’t break these names)
- BroadcastChannels used for cross-tab sync:
  - `escalada-state` + `timer-cmd` (centralized in `src/utilis/useAppState.tsx`).
  - `escalada-timer` (used by `src/components/ContestPage.tsx`).

## State conventions
- Persistent keys in localStorage include: `listboxes`, `climbingTime`, `timeCriterionEnabled` (see `src/utilis/useAppState.tsx` and `src/components/ControlPanel.tsx`).
- Input safety: use `src/utilis/sanitize.js` (`dompurify`) and existing helpers (`sanitizeCompetitorName`, `sanitizeBoxName`).

## Dev workflow
- Dev server: `npm run dev`.
- Unit tests: `npm run test -- --run` (Vitest; see `src/__tests__/`).
- E2E: `npx playwright test --reporter=list` (specs in `e2e/`).
- Format: `npm run format` (Prettier; lint-staged formats on commit).
