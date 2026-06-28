# Phase 2 — Central Config (pull → local cache)

Central server becomes the source of truth for booth config. Booths **pull**
config into their local SQLite cache on boot + on an interval, and always read
from that cache (existing routes unchanged). Manage many booths from one place.

## Pattern
```
Central (Next + Postgres)            Booth (Fastify + SQLite)
  config_packages / config_filters     config-sync-service (boot + interval)
  GET /api/config/packages  --pull-->  upsert into local packages/filters
  GET /api/config/filters              routes read local DB as before
```
- **Pull only; never deletes.** Removal propagates softly via `isActive:false`.
- **Empty central response = not configured → keep local cache** (no wipe).
- **Pull failure = keep running on last-known local rows.** Offline-safe;
  "mostly online" makes pull-on-boot sufficient.

## This slice (built)
Row-only entities, no binaries, no bidirectional flow:
- **packages** (pricing — the headline "manage N booths" win)
- **filters** (filterConfig JSON; thumbnails are UI-only, deferred)

Booth: `services/config-sync-service.ts` (+ wired into start/stop in `index.ts`).
Reuses `CENTRAL_SERVER_URL` + `CENTRAL_SERVER_API_KEY` + `BOOTH_ID` (no new env).
Central: `lib/config.ts` (tables + getters) + `app/api/config/{packages,filters}`.

Verified: backend `tsc` clean · central `tsc` + `next build` clean (routes
dynamic) · upsert unit tests (insert / update / **never-delete**).

## Deferred (explicit)
- **templates** — drag in image-file sync (binary transfer), a separate slice
  (Phase 2b / overlaps Phase 3 photo hosting). Metadata alone is useless without
  the frame images on the booth.
- **booth codes** — bidirectional (central issues, booth reports usage). Its own
  slice; needs an outbound usage queue.
- **hard-delete propagation** — today removal is soft (`isActive:false`). A purge
  signal (tombstones or a full-replace pull) can come later if needed.
- **admin editing UI** — central rows are managed directly (seed/SQL/dashboard)
  until an admin surface is built.

## Remaining to go live
- [ ] Seed `config_packages` / `config_filters` in central Postgres
- [ ] Point a booth at central; confirm boot pull caches rows locally
- [ ] Edit a price centrally → confirm booth reflects it next pull
- [ ] DB-integration tests run green on the project's supported node in CI
      (skipped locally — better-sqlite3 native addon won't load on node 26)

## Note: pre-existing test infra fixed
`vitest.config.ts` referenced a deleted `setupFiles` + a deleted coverage
include (`camera/providers/mock.ts`) from the earlier dead-code cleanup, which
broke the whole suite. Removed both so tests load again.
