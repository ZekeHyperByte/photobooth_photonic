# Phase 4 — Per-row Records → Central

Today sync pushes only daily aggregates (`/api/sync/ingest`). Phase 4 pushes
the actual rows so the dashboard can drill down: completed sessions + their
photos + transactions.

## Design: terminal-only, watermark-incremental
The booth schema has **no `updatedAt`** on sessions/photos, so true
"changed-since" is unreliable. So push only **completed** sessions — terminal,
they won't change after sync. Incremental by a `completedAt` watermark; central
upserts by id, so re-pushing is harmless (watermark just caps volume).

```
Booth (interval)                         Central
 entity-sync-service                       POST /api/sync/entities (X-API-Key)
   sessions WHERE status=completed           upsert synced_sessions
            AND completedAt > watermark       upsert synced_photos
   + their photos + transactions             upsert synced_transactions
   POST batch  -------------------------->
   advance watermark = max(completedAt)
```

## Built
Booth:
- `services/entity-sync-service.ts` — pure mappers (`sessionDTO`/`photoDTO`/
  `transactionDTO`), `nextWatermark`, file-based watermark, push loop.
- Wired into `index.ts` start/stop (alongside config + analytics sync).

Central:
- `lib/entities.ts` — `synced_sessions`/`synced_photos`/`synced_transactions`
  tables + idempotent upserts.
- `app/api/sync/entities/route.ts`.

Verified: backend `tsc` clean · central `tsc` + `next build` clean ·
unit tests for `nextWatermark` + mappers (latest/keep-current/null-safe).

## Deferred
- **Non-terminal updates** (a session edited after completion, abandoned
  sessions) — would need `updatedAt` columns + a tombstone/changed-since scheme.
- **Dashboard UI** to surface the drill-down rows (data lands; views come next).
- **Backfill** of historical sessions predating this feature (watermark starts
  at epoch, so first run pushes all existing completed sessions — fine, but
  it's one big batch).
- **PII**: `phoneNumber` is intentionally NOT synced (analytics doesn't need it).

## Remaining to go live
- [ ] Confirm first-run batch size is acceptable (or seed watermark to "now")
- [ ] Build dashboard views over the synced_* tables
