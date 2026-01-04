# CODEX PROMPT — Admin actions hub: add Export (zip) + Audit as sidebar sub-views

## Goal
Extend the existing **Admin actions** single modal (hub) to include two additional internal sub-views in the left sidebar:
- `ExportOfficialView` (dedicated view in sidebar)
- `AuditView` (dedicated view in sidebar)

Constraints:
- Single modal only (no nested modals).
- Reuse existing Export/Audit logic as-is first (low risk), then refactor/unify later if desired.
- Keep UI consistent with existing ControlPanel styling and admin area.

---

## UX / Layout (desktop)
Modal structure:
- Sticky header: title + breadcrumb + Close
- Sticky context row: Box selector (global for modal)
- Body: 2 columns
  - Left: Sidebar “Sections” list
  - Right: Active view content

Sidebar items:
1) Actions (default)
2) Upload (competitors Excel)  ← existing flow as internal view
3) Export zip                 ← NEW internal view
4) Audit                      ← NEW internal view

Navigation:
- Clicking a sidebar item sets `activeView`.
- `selectedBoxId` persists across views.

---

## Implementation plan (UI)
### Step 1 — Add internal view routing
In the Admin modal component/state, add:
- `activeView: 'actions' | 'upload' | 'export' | 'audit'`
- Sidebar UI to switch views
- Breadcrumb updates: `Admin actions > {ActiveViewLabel}`

### Step 2 — ExportOfficialView integration (dedicated view)
Goal: show the existing “Export Official (zip)” UI/flow inside the modal.

Approach (safe):
1) Locate the current Export UI implementation in `src/components/ControlPanel.tsx`.
2) Extract it into a reusable component (no logic changes), e.g.:
   - `src/components/AdminExportOfficialView.tsx`
3) Mount it in the Admin modal when `activeView === 'export'`.

Selector policy (safe-first):
- Keep Export’s existing selection logic intact initially.
- If Export already uses `exportBoxId` state, keep it inside Export view component.
- Optional enhancement later: preselect Export’s box to `selectedAdminBoxId`, but do not break existing behavior.

Entry points:
- “Admin actions” remains the hub entry point.
- Keep any old Export entry point until parity is verified, then remove/redirect to Admin actions.

### Step 3 — AuditView integration (dedicated view)
Goal: embed Audit view inside the Admin modal.

Approach (safe):
1) Locate the current Audit page/component (route defined in `src/App.tsx`).
2) Extract the core audit content into a reusable component if needed, e.g.:
   - `src/components/AdminAuditView.tsx`
   - Or re-use the existing Audit page component if it doesn’t depend on routing.
3) Mount it in modal when `activeView === 'audit'`.

Important UX:
- Audit content area must have its own scroll container:
  - Avoid modal body growing infinitely.
  - Use `overflow-auto` in the right column content wrapper.

Optional:
- Add a button “Open full page” that navigates to the existing Audit route (if route is kept).

### Step 4 — Actions view: add a shortcut link to Export view (optional)
In `AdminActionsView`, add a secondary “Export official (zip)” button that switches `activeView = 'export'` (do not generate immediately).

### Step 5 — Remove legacy controls (after verification)
After confirming:
- Export works from modal
- Audit works from modal

Then:
- Remove the separate Export UI entry point outside Admin actions (or replace with button that opens Admin actions and jumps to Export view).
- Decide whether Audit route stays (recommended for deep link) or becomes a redirect to Admin actions modal (harder).

---

## Testing checklist
- Modal opens via “Admin actions” button next to Export control area.
- Sidebar switches views without losing `selectedBoxId`.
- Upload view remains the same behavior (no nested modal).
- Export view generates the same output as before (compare behavior).
- Audit view renders and is scrollable; no layout overflow.
- Close works from any view and cleans up state.

Add/adjust UI tests where feasible:
- Switching view sets breadcrumb and shows correct content.
- Export view mounts without exceptions.
- Audit view mounts and has scroll container class.

---

## Deliverables
- Admin modal supports 4 internal views: actions/upload/export/audit.
- ExportOfficialView present as dedicated sidebar sub-view.
- AuditView present as dedicated sidebar sub-view.
- No nested modals introduced.