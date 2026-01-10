# CODEX_PROMPT_JSON_STORAGE_NO_DB.md

## Goal
Remove the hard dependency on Postgres for runtime operation by adding a **JSON file storage mode** for `escalada-api`, while keeping the UI behavior the same.

Requirements:
- Runs on a single PC with **one uvicorn worker** (single process).
- No Docker / no Postgres required in this mode.
- Preserve **restore after restart**: on startup, restore all persisted box states from disk.
- Audit log can be simplified to **dump/latest** (no complex querying needed).

## Non-goals
- Multi-worker safe file writes.
- Full SQL-style filtering for audit.
- Internet-facing hardening beyond current LAN use.

## Storage Mode Switch
Add environment toggle:
- `STORAGE_MODE=postgres|json` (default: `postgres` to preserve existing behavior)
- `STORAGE_DIR=./data` (default path for JSON mode)

## JSON Persistence Layout
Under `STORAGE_DIR`:
- `boxes/{boxId}.json` — the latest snapshot for each box (the `state_map[boxId]` dict).
- `events.ndjson` — append-only audit log; one JSON object per line.

## Startup Restore (JSON mode)
When the API starts:
- Ensure `STORAGE_DIR/boxes` exists.
- Load all files `boxes/*.json`:
  - Parse JSON, validate shape minimally, and hydrate `state_map[boxId]`.
  - Ensure `state_locks[boxId]` exists.
- This provides “restore after restart” for all boxes that were previously initiated or had any state.

## Runtime Writes (JSON mode)
Whenever a command mutates state (same points where DB persistence happens today):
- Persist box snapshot:
  - atomic write: write to temp file then rename to `boxes/{boxId}.json`.
- Append audit event to `events.ndjson`:
  - one JSON per line, includes timestamp, action type, boxId, sessionId, boxVersion, and payload.
  - best-effort: if audit append fails, do not crash the command path.

## Replace DB-backed persistence paths in JSON mode
Currently, `live.py` persists state and audit via DB. In JSON mode:
- Skip SQLAlchemy session usage.
- Do not call `run_migrations()` on startup.
- `_persist_state()` should write JSON snapshot + append audit, and return `"ok"` (no optimistic DB lock).
- Keep the existing in-memory `state_map` and WS broadcasting behavior unchanged.

## Audit Endpoint (dump/latest)
Keep endpoint shape compatible with the UI call:
- `GET /api/admin/audit/events?limit=...&includePayload=...` (boxId filter can be ignored or best-effort)

Implementation in JSON mode:
- Read last `limit` lines from `events.ndjson` efficiently (tail-like).
- If `includePayload=false`, omit/strip `payload` from each returned item.
- Return newest-first (to match current behavior) OR keep oldest-first but be explicit and update UI if needed. Prefer newest-first.

## Backups/Restore
In JSON mode:
- “Backup now” can create a zip of `STORAGE_DIR` (optional initial scope).
- Restore can replace `boxes/*.json` from an uploaded backup (optional; can be deferred).

## UI Compatibility
No UI change required for JSON storage mode.
The API routes remain the same.

## Acceptance Criteria
- With `STORAGE_MODE=json`, API starts with no Postgres running and no Docker.
- Contest commands work as before (INIT_ROUTE, SUBMIT_SCORE, TIMER_SYNC, etc).
- Restarting API restores boxes from `STORAGE_DIR/boxes/*.json`.
- Admin audit viewer loads “latest events” from `events.ndjson` (even if simplified).

## Implementation Notes / Safety
- Enforce single-worker in docs: `uvicorn ... --workers 1`.
- Use atomic writes for snapshots to avoid corruption on crash.
- Use a lightweight lock around file writes (asyncio.Lock) to serialize writes per box.

