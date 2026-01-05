# Public Rankings (Kiosk) — Implementation Prompt

## Goal
Implement a **public, unauthenticated** spectator page at `/#/rankings` that shows **live** competition status and standings for all **initiated** categories (boxes). The page must work on a separate device (SmartTV/tablet) with **no login**.

This is Variant **B**: the Rankings page must get live data from the **server** (WebSocket + HTTP fallback). **Do not rely on localStorage for contest state**.

## UX Requirements
- Route: `/#/rankings` (HashRouter).
- Page is kiosk/read-only: no admin actions, no login overlay.
- Layout (as requested):
  - **Top:** Selected category display (status + current climber + timer + ranking).
  - **Bottom:** “Initiated categories” selector (always visible, even when a category is selected).
- The selector lists only boxes where `initiated === true`.
- Selector updates immediately when another box becomes initiated/reset (no refresh).
- Clicking a category replaces the displayed category (previous collapses/disappears). Only one category view visible at a time.

## Real-time Requirements
- Standings update immediately after each `SUBMIT_SCORE`.
- Current climber + timer update in real time (as fast as server can provide; WS preferred).
- Join mid-contest works: opening `/#/rankings` late still shows current standings + status without requiring prior events.

## Public Availability Scope
- Must work for **LAN** display and can also be deployed **internet-facing**.
- Backend must remain strictly **read-only** for public endpoints.

## Data Model (what the server must provide)
For each box:
- Identity/status: `boxId`, `categorie`, `initiated`, `routeIndex`, `routesCount`, `holdsCounts`
- Live flow: `currentClimber`, `timerState`, `remaining` (seconds remaining), optionally `started`
- Ranking inputs (enough to compute standings client-side):
  - `scoresByName: { [name: string]: number[] }` (scores per route)
  - `timesByName: { [name: string]: (number|null)[] }` (times per route; informational)
  - `timeCriterionEnabled` (controls *visibility* of times; never a tie-break)

## Ranking Rules (must match current system)
- Use IFSC-style rank points per route, then geometric mean total (QP).
- Deterministic tie ordering by athlete name (case-insensitive).
- Shared ranks for ties: `1, 1, 3`.
- **Time is informational only**:
  - `timeCriterionEnabled` controls whether times are shown.
  - If enabled: show times only for **top 3** rows.
  - Times must not break ties anywhere.

## Backend Changes (escalada-api) — Required
### Public HTTP snapshot (for join + polling fallback)
Add a public read-only endpoint, for example:
- `GET /api/public/rankings`
  - returns a snapshot of all boxes (including initiated and non-initiated), plus ranking inputs and live flow fields.

### Public WebSocket (preferred)
Add a public WS endpoint, for example:
- `GET /api/public/ws`

Behavior:
- On connect, send a full snapshot:
  - `type: "PUBLIC_STATE_SNAPSHOT"`
  - `boxes: [...]` (full list with all fields above)
- Broadcast updates:
  - `type: "BOX_STATUS_UPDATE"` when `initiated/routeIndex/holdsCounts` changes
  - `type: "BOX_FLOW_UPDATE"` when `currentClimber/timerState/remaining` changes
  - `type: "BOX_RANKING_UPDATE"` when scores/times change (after submit score)

Security:
- No authentication required.
- Ensure read-only: no command handling, no writes.

## Frontend Changes (escalada-ui)
### New page component
Create `src/components/RankingsPage.tsx`:
- Connect to public WS and maintain `boxes` state.
- If WS fails/disconnects:
  - start polling `GET /api/public/rankings` every **5 seconds**
  - keep polling until WS reconnects successfully, then stop polling.
- Render:
  - If no initiated boxes: show “No initiated categories yet.”
  - Otherwise:
    - Selected box view (top): show
      - Category name
      - Live flow: current climber + timer (remaining) + timer state
      - Standings table (computed client-side using ranking rules above)
    - Initiated categories selector (bottom): buttons/cards for each initiated box.
- Selection:
  - Default to first initiated box.
  - If selected box becomes non-initiated, auto-select first initiated (or show none if none).

### Routing
Update `src/App.tsx`:
- Add `<Route path="/rankings" element={<RankingsPage />} />`

### Admin convenience button (optional but requested)
Add a button in the Admin Actions UI:
- Label: “Open public rankings”
- Action: `window.open('/#/rankings', '_blank')`

## Non-goals
- No admin login, no score editing, no uploads/exports/audit on `/#/rankings`.
- Do not read contest state from browser localStorage for kiosk correctness.

## Acceptance Criteria
- `/#/rankings` works on a fresh device with no login.
- Initiated categories list updates automatically.
- Selecting categories swaps the displayed standings.
- Standings + current climber + timer update in real time (WS), with a 5s polling fallback.
