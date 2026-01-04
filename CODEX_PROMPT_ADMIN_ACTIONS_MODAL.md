# CODEX PROMPT — Admin Actions modal (move per-box buttons)

## Context
We have a React + Vite UI in `escalada-ui`. Today, `src/components/ControlPanel.tsx` renders multiple per-box controls and admin actions.

We want to move these actions **out of the box cards** into a **single Admin modal**, with UX similar to the existing **Export Official (zip)** pattern: user selects a box first → then clicks an action.

### Actions to centralize into Admin modal (per box)
1) Modify score  
2) Open judge view  
3) Generate QR  
4) Set judge password  
5) Award ceremony  
6) Open listbox (Upload competitors Excel)  
7) Set timer (timer preset + criterion)

---

## Requirements (must)
1. Create an Admin modal/section that:
   - Allows selecting a `boxId` from current boxes (`listboxes`).
   - Shows the 7 actions for the selected box:
     1) Modify score
     2) Open judge view
     3) Generate QR
     4) Set judge password
     5) Award ceremony
     6) Open listbox
     7) Set timer

2. **Category must be included** in the Judge link and QR link.
   - Use the selected box’s category from listbox state: `lb.categorie` (Romanian field name, where `lb = listboxes[boxId]`).
   - IMPORTANT: the existing query param name is `cat` (not `category`): `?cat=${encodeURIComponent(lb.categorie)}`.
   - The category is never empty.

3. **No magic token** in URL. Judge device will authenticate manually via existing login.

4. Set judge password:
   - Use `setJudgePassword(boxId, password, username)` from `src/utilis/auth.js`.
   - Default `username` must be preset to the selected box category: `lb.categorie` (but allow editing).
   - Do not log passwords.

5. Award ceremony is **per box**.

6. Open listbox:
   - This action means: **upload the Excel with competitors** using the existing Upload Listbox flow.
   - The category is entered by the user in the existing upload form (field named `categorie`).
   - Reuse the existing Upload Listbox UI + logic exactly as-is (same validations, same payload, same flow).
     - Do NOT redesign the fields.
     - Do NOT change the meaning of inputs.
   - IMPORTANT UX constraint: do **not** open a modal inside another modal.
     - Implement this as a **long-flow sub-view inside the same Admin modal** (single modal, different internal view).
     - Example: Admin modal has 2 internal screens: `AdminActionsView` and `UploadListboxView`.
   - Holds/prises per route vary: keep `holdsCounts` as a per-route list/array (user enters counts per route).

7. Set timer (per box) must prompt the user for:
   - which box (default = selected Admin box, but allow overriding inside the dialog)
   - timer preset (time string, same normalization rules as today)
   - **criterion MUST become per box** (today it’s global; you must change it to per-box end-to-end)

8. Keep behavior consistent with current implementation (reuse existing helpers/logic; don’t invent new endpoints unless required by the per-box criterion change).

---

## Non-goals
- Do not add new pages or new navigation routes.
- Do not introduce magic-token auth flows.
- Do not redesign the entire ControlPanel; only centralize these actions into the Admin modal.

---

## Existing integration points (reference)
- Judge route: `/#/judge/:boxId` (router in `src/App.tsx`).
- WS auth uses stored token; manual login is handled by `src/components/LoginOverlay.jsx` + `src/utilis/auth.js`.
- Judge WS URL pattern is already in `src/components/JudgePage.tsx`.
- Set judge password:
  - UI client: `src/utilis/auth.js` (`setJudgePassword`)
  - API endpoint: `POST /api/admin/auth/boxes/{boxId}/password` (already exists)
- Ceremony display: `public/ceremony.html` is opened from `ControlPanel.tsx` using `window.open('/ceremony.html', ...)` and winners are passed via `window.ceremonyWinners`.
- Timer UI exists: `src/components/ModalTimer.jsx` (currently shows “Set time as the second criterion (...On/Off)”).

---

## Proposed design (single modal + dialogs)
### Admin actions UX (single modal)
- Implement as a **single modal** (not tabs). Keep it close in spirit to “Export Official (zip)”: select box first → then actions.
- Layout: 2 columns on desktop, 1 column on mobile.
  - Left column = context:
    - Box selector (required)
    - Small summary for selected box (optional): name + `categorie` + a few key live fields if readily available.
  - Right column = actions grouped by purpose.

### Internal views (no nested modals)
- The Admin modal must be a single modal with multiple internal views:
  - `AdminActionsView` (default): box selector + action buttons
  - `UploadListboxView`: reuses the existing Upload Listbox component/logic (Excel upload + `categorie` + routes + holds per route)
- Navigation inside modal:
  - Clicking “Open listbox (Upload competitors Excel)” switches to `UploadListboxView`
  - A “Back” button returns to `AdminActionsView`

### Visual style (modern & “pro”)
- Modal container: `rounded-xl`, `shadow-2xl`, `max-w-5xl` (or similar), with a header bar.
- Header: title + short subtitle + Close button.
- Cards/sections: `border border-slate-200 rounded-lg p-4`.
- Buttons:
  - Primary (Modify score): `bg-indigo-600 hover:bg-indigo-700 text-white`.
  - Secondary (Open judge, Generate QR, Open listbox, Set timer, Award ceremony): `bg-slate-100 hover:bg-slate-200`.
  - Warning (Set judge password): `bg-amber-600 hover:bg-amber-700 text-white`.
- Disable all action buttons until a box is selected.

### Dialogs
- Generate QR → opens a **dialog** showing:
  - QR code (same URL as Open judge view)
  - raw URL (copy button)
  - short hint: “autentificare manuală necesară”
- Set judge password → dialog with username preset + password + confirm
- Set timer → dialog (see below)

---

## Critical change: time criterion must become per-box (end-to-end)
### Current situation (today)
- UI stores `timeCriterionEnabled` globally (localStorage key `timeCriterionEnabled`)
- API treats `SET_TIME_CRITERION` as global outside per-box state (see escalada-api instructions)
- JudgePage / ContestPage read/write global `timeCriterionEnabled`

### Required new behavior
- `timeCriterionEnabled` must become **strictly per box** (no global apply-to-all anymore): persisted per box, broadcast per box, and applied per box.
- Keep the existing command type `SET_TIME_CRITERION`, but change its semantics to be **per-box**.
- This implies coordinated changes in **3 repos**:
  1) escalada-core: state model/validation for per-box criterion (no longer global-only)
  2) escalada-api: stop handling time criterion as a global singleton; store/emit it per box
  3) escalada-ui: store it per box and pass correct value into ranking/timer logic per box

### Constraints
- Keep changes discoverable and minimal; prefer a new per-box state field over hidden global hacks.
- Ensure JudgePage + ContestPage continue working with WS snapshots (now include per-box criterion).

### Recommended implementation (must follow)
1) **Core: move criterion into per-box state**
  - Add/ensure `timeCriterionEnabled` exists in each box state (default `False` on new box state).
  - `apply_command()` handling for `SET_TIME_CRITERION` must set `state["timeCriterionEnabled"] = enabled` in the **box state**.
  - Include `timeCriterionEnabled` in snapshot payloads returned/emitted by core callers.
2) **API: change handler from global → per-box**
  - In `escalada-api/escalada/api/live.py`, remove the global toggle behavior for `SET_TIME_CRITERION`.
  - Update only the selected box state (`state_map[boxId]`) under that box lock.
  - WS `STATE_SNAPSHOT` for box X must include `timeCriterionEnabled` for box X.
3) **UI: migrate without breaking old localStorage**
  - Read criterion in this order:
    - new per-box key: `timeCriterionEnabled-${boxId}` (or from per-box state if that’s where you store it)
    - fallback legacy global key: `timeCriterionEnabled`
  - Write only the new per-box key (do not write the global key anymore). Keep global only as a temporary read fallback.

---

## Judge URL builder (shared)
- Implement a single helper that builds the judge URL consistently:
  - Base: `${window.location.origin}/#/judge/${boxId}`
  - Query includes category under `cat`: `?cat=${encodeURIComponent(lb.categorie)}`
  - The category is never empty, so always include `cat`.

---

## Implementation plan (step-by-step)
### 1) Locate current per-box buttons and handlers
In `src/components/ControlPanel.tsx`, identify code paths for:
- Modify score open/submit
- Judge URL building + `window.open` (already uses `lb.categorie` → `?cat=...`)
- QR link generation (`QRCode` already exists in ControlPanel)
- set judge password (look for “Failed to set judge password”)
- award ceremony window open + winners payload
- open/initiate listbox behavior (search for “inițiat/initiated”, “Marchează listbox‑ul ca inițiat”, and any button that triggers it)
- set timer UI entrypoint (likely via `ModalTimer.jsx`)

### 2) Extract reusable helpers (minimal refactor)
Create a small helper module or local helper functions (least invasive):
- `buildJudgeUrl(boxId, categorie)` MUST emit `?cat=...`
- `openJudgeView(boxId, categorie)`
- `openCeremony(boxId, categorie)`
- (optional) `getSelectedBox(listboxes, boxId)` to standardize read access

### 3) Create the Admin Actions UI (single modal)
- Option A (preferred): implement directly inside `ControlPanel.tsx` near existing Admin/export UI.
- Option B: new component `src/components/ModalAdminActions.tsx`, mounted from `ControlPanel.tsx`.
- Must include:
  - Box selector state (`selectedAdminBoxId`)
  - Derived `selectedCategorie = listboxes[selectedAdminBoxId].categorie`

### 4) Modify score integration
- Reuse existing Modify Score modal/component already used in `ControlPanel.tsx`.
- Ensure boxId used is the selected Admin box.
- Ensure command/session/version behavior remains unchanged.

### 5) Open judge view + Generate QR integration
- Open judge view → `window.open(buildJudgeUrl(selectedBoxId, selectedCategorie), '_blank')`
- Generate QR → dialog with QR value exactly equal to the judge URL (same builder)

### 6) Set judge password integration
- Dialog:
  - `username` default = `selectedCategorie` (editable)
  - `password` + `confirmPassword`
- Submit calls: `setJudgePassword(selectedBoxId, password, username)`
- Show success/error state in modal

### 7) Open listbox integration
- Implement “Open listbox” as entering the existing Upload Listbox flow.
- Reuse the current component that handles upload fields and submission (likely `src/components/ModalUpload.jsx`, already used from `ControlPanel.tsx`).
- Do not nest modals: render the upload UI as the `UploadListboxView` content inside the Admin modal.
- Keep field semantics unchanged:
  - user enters `categorie`
  - user sets `routesCount`
  - user sets `holdsCounts` as a list/array (counts can differ per route)
  - user picks the Excel file of competitors

### 8) Set timer integration (dialog, per box, per-box criterion)
- Create or adapt an existing dialog (you can reuse/adapt `src/components/ModalTimer.jsx`):
  - Fields:
    - Box selector (default = selected Admin box; allow choosing another box inside dialog)
    - Time preset (string; keep same format and normalization behavior as today)
    - Criterion toggle (now per box, not global)
- On submit:
  - Persist timer preset per box (today there are hints of `climbingTime-${idx}` and `listboxes[boxId]?.timerPreset` usage via `useAppState.tsx`)
  - Persist criterion per box (NEW per-box key / per-box state field)
  - Send the appropriate command(s) so backend state matches UI (requires API/core changes described above)

### 9) Backend/core changes for per-box criterion (must be implemented, not stubbed)
- Update escalada-core:
  - Ensure box state includes `timeCriterionEnabled` and that `SET_TIME_CRITERION` updates **only** that box’s state.
  - Update validation (`ValidatedCmd`) if needed (command stays `SET_TIME_CRITERION`, but must be accepted with a normal `boxId`).
- Update escalada-api:
  - Remove global handling of `SET_TIME_CRITERION` and apply it under the per-box lock.
  - Ensure `/api/state/{box_id}` and WS `STATE_SNAPSHOT` include `timeCriterionEnabled` for that box.
- Update escalada-ui:
  - Stop using a single global `timeCriterionEnabled` as source of truth.
  - Implement per-box storage and state (read per-box first, then fallback to legacy global; write per-box only).
  - Update `useAppState.tsx`, `ControlPanel.tsx`, `JudgePage.tsx`, `ContestPage.tsx` to consume per-box criterion.

### 10) Remove/migrate buttons from box cards
- Remove the 7 per-box buttons from individual box UI.
- Keep any non-admin box controls intact.

### 11) Tests & verification
- Update/extend tests in `src/__tests__/`:
  - Judge URL includes `?cat=...` always
  - Default username preset = `lb.categorie`
  - Set timer dialog saves preset and criterion for the chosen box
  - Per-box criterion propagation: Judge/Contest pages show correct criterion per box (update snapshots/mocks accordingly)

---

## Acceptance criteria
- All 7 actions are available only in the Admin modal with a box selector.
- Open judge view + QR always include `?cat=<lb.categorie>` in the URL.
- Set judge password defaults username to selected box `lb.categorie`, editable.
- Set timer prompts user for box + time + criterion, and applies them per-box.
- `timeCriterionEnabled` is no longer global: it is per box across UI + API + core.
- Per-box buttons are removed from box cards without breaking existing flows.

## Files likely to touch (UI)
- `src/components/ControlPanel.tsx` (primary)
- `src/components/ModalTimer.jsx` (adapt for per-box criterion + box selector)
- `src/utilis/useAppState.tsx` (change from global criterion to per-box)
- `src/components/JudgePage.tsx` + `src/components/ContestPage.tsx` (consume per-box criterion)
- `src/utilis/auth.js` (reuse only)
- `src/__tests__/...` (update mocks/assertions)

## Files likely to touch (API/core) — required for per-box criterion
- `escalada-core/escalada_core/contest.py` + `escalada_core/validation.py`
- `escalada-api/escalada/api/live.py` (remove global criterion handling; per-box snapshots/commands)
- `escalada-api/escalada/db/models.py` (if criterion must persist per box state; likely already stored in JSON state)