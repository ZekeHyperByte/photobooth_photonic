# Booth Codes Slice — central issuance + usage reporting (bidirectional)

Unlike the other config entities (pull-only), booth codes are **bidirectional**:
central issues codes, booths pull the available ones, and booths report usage
back so a code used on one booth can't be reused on another.

## Flow
```
Central (Next + Postgres)                Booth (Fastify + SQLite)
 POST /api/codes/generate (admin)          code-sync-service (boot + interval)
 GET  /api/codes/available  --pull----->     insert codes the booth lacks
                                              (onConflictDoNothing — never
                                               downgrades a local 'used' code)
 POST /api/codes/report-usage <--push---    push local 'used' codes since a
   first-writer-wins; returns                usedAt watermark; advance watermark
   accepted vs conflicts
```

Verify/consume already work locally (`routes/codes.ts`, `routes/sessions.ts`
sets status='used') — unchanged. Code-sync just keeps the local cache stocked
and reports consumption upstream.

## Anti-double-use
`report-usage` is first-writer-wins: `UPDATE … WHERE code = ? AND status <> 'used'`.
A code already used (by another booth) comes back in `conflicts`, which the
booth logs. Central `/available` excludes used codes, so the next pull on other
booths drops them.

## Built
Central:
- `lib/codes.ts` — `booth_codes` table, `generateCodes`, `getAvailable`,
  `reportUsage` (accepted/conflicts).
- `app/api/codes/{available,report-usage,generate}` routes (X-API-Key).

Booth:
- `services/code-sync-service.ts` — `pullAvailable` (insert-if-missing) +
  `pushUsed` (watermark by usedAt). Pure helpers `toUsageReports`,
  `nextUsedWatermark`. Wired into `index.ts` start/stop.

Verified: backend `tsc` clean · central `tsc` + `next build` clean ·
unit tests for `toUsageReports` (null-safe) + `nextUsedWatermark` —
17 backend tests pass.

## Deferred
- **Offline double-use window** — two offline booths could each consume the same
  cached code before either reports; central accepts the first, flags the second
  as conflict (logged). True prevention needs online check-at-consume — not worth
  it at 2–10 booths; the conflict signal is enough to reconcile.
- **Admin UI** for issuing codes centrally (endpoint exists; frontend pending).
- **Expiry propagation** — central has no TTL on codes yet.

## Remaining to go live
- [ ] Issue codes centrally (`POST /api/codes/generate`)
- [ ] Confirm booth pulls them and reports consumption
- [ ] Point admin-web code generator at central instead of the booth
