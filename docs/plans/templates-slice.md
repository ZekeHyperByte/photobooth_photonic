# Templates Slice — central templates + frame-image sync

Extends Phase 2 config-pull to templates. The wrinkle templates add over
packages/filters: **binary frame images**. Reuses Phase 3 blob storage.

## Flow
```
Central (Next + Postgres + blob)         Booth (Fastify + SQLite + local disk)
 config_templates (rows + blob URLs)       template-sync-service (boot + interval)
 POST /api/config/templates (upload) ----    GET rows
   store frame/thumb via lib/storage         for each: download frame -> local disk
 GET  /api/config/templates  ----------->     upsert local row, filePath = LOCAL path
                                              (image-processor reads filePath via fs)
```

## Why download, not just rows
`image-processor` does `fs.readFile(template.filePath)` — the frame must be on
the booth's local disk. So sync rewrites `filePath` to the downloaded local
path; `positionData` (zones) + canvas/paper metadata ride along as row data.

## Built
Central:
- `lib/templates.ts` — `config_templates` table + getters + upsert.
- `app/api/config/templates` — GET (booth pull) + POST (admin upload: stores
  frame/thumbnail via `lib/storage`, upserts row).

Booth:
- `services/template-sync-service.ts` — pull rows, download frames, upsert local.
  Pure helpers: `needsDownload`, `templateLocalPaths`, `templateValues`.
- Wired into `index.ts` start/stop.

## Efficiency / safety
- **Re-downloads a frame only when missing or central is newer** (`needsDownload`
  on `updatedAt`) — the hourly pull doesn't refetch unchanged binaries.
- Pull-only; never deletes (soft-delete via `isActive`); empty central keeps cache.

Verified: backend `tsc` clean · central `tsc` + `next build` clean ·
unit tests for `needsDownload` / path builder / `templateValues` (local filePath
rewrite, updatedAt parse) — 13 backend tests pass.

## Deferred
- **previewPath** (sample-applied preview) not synced — booth regenerates or
  drops it; only frame + thumbnail are carried.
- **frame-manager retargeting** — the upload endpoint exists; pointing the
  frame-manager app at central (instead of a booth) is a frontend change.
- **Orphan cleanup** — a template removed centrally goes `isActive:false`; its
  downloaded frame file stays on disk (harmless). Add a sweep if needed.

## Remaining to go live
- [ ] Seed/upload templates to central (`POST /api/config/templates`)
- [ ] Confirm booth downloads frames and composites from the local path
- [ ] Point frame-manager at central for authoring
