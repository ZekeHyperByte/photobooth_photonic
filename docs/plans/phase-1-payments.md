# Phase 1 — Payments → Central Server

Move payment authority off the booth onto the central server (the
`analytics-dashboard` Next app). The server holds the Midtrans keys, receives
the webhook (stable public URL — solves the NAT'd-booth problem), and is the
transaction source of truth. The booth talks only to the central server.

## Why payments first
- The Midtrans **webhook can't reach a NAT'd booth** — the one thing genuinely
  broken locally today.
- QRIS already needs internet, so depending on the server for payment costs
  **zero** availability the booth didn't already lack.
- The central app is already on Vercel = the stable URL the webhook needs.

## Architecture

```
Booth (Fastify)                         Central (Next on Vercel)        Midtrans
  CentralServerProvider --POST /create-->  /api/payments/create  --charge-->
                        <--QR-------------                        <--QR-------
  (frontend shows QR, polls)
                        --GET /status/:id-> /api/payments/status  --status?--> (if pending)
                                            (DB = source of truth)
                                            /api/payments/webhook <--notify-- Midtrans
                                            (verify sha512 signature)
```

Booth→server and server→Midtrans are both NAT-safe (outbound). A dropped
webhook can't strand a paid customer: the status endpoint re-polls Midtrans
when the row is still `pending`.

## Booth side (one new provider — drops into the existing factory)
- `apps/backend/src/services/payment/central.provider.ts` — `CentralServerProvider`
  implements `PaymentProvider`; proxies create/verify/status over HTTP.
- Wired into `services/payment/index.ts` factory; selected by `PAYMENT_PROVIDER=central`.
- Reuses `CENTRAL_SERVER_URL` + `CENTRAL_SERVER_API_KEY` + `BOOTH_ID` (same as sync).
- **No changes** to payment routes, `payment-service.ts`, SSE, or the frontend.
- Rollback = set `PAYMENT_PROVIDER` back to `midtrans`/`mock`.

## Central side (new)
- `lib/payment-utils.ts` — pure `verifySignature` + `mapMidtransStatus` (unit-tested).
- `lib/payments.ts` — Midtrans CoreApi (QRIS charge, status) + Postgres
  `transactions` table (insert/get/update).
- `app/api/payments/create/route.ts` — `X-API-Key` auth, charge, persist, return QR.
- `app/api/payments/status/[orderId]/route.ts` — DB truth; re-polls Midtrans if pending.
- `app/api/payments/webhook/route.ts` — **signature is the auth**; verify before mutating.
- Midtrans keys live ONLY here (`MIDTRANS_SERVER_KEY/CLIENT_KEY/ENVIRONMENT`).

## Security boundary (must-not-skip)
Webhook signature: `sha512(order_id + status_code + gross_amount + serverKey)`,
timing-safe compared. Covered by `test/payment-utils.test.ts` (accept / tampered
amount / wrong key / missing fields).

## Status

Done (build-now):
- [x] Central endpoints, Midtrans lift, Postgres table, signature verify
- [x] `CentralServerProvider` + factory + env wiring
- [x] Signature unit tests (5 pass), both apps type-check clean

Remaining (deploy-later):
- [ ] `pnpm install` + `next build` the central app in CI/deploy
- [ ] Point booth at a running central (`next dev`) for local e2e create→poll
- [ ] Swap to Midtrans **sandbox**, test a real QR scan
- [ ] Deploy central to Vercel; set webhook URL in Midtrans dashboard
- [ ] Set `PAYMENT_PROVIDER=central` + central URL/key per booth

## Notes / deferred
- orderId stays booth-generated (`ORDER-{ts}-{nanoid}`), passed to central.
- Confirmation is **poll**, not push (push reintroduces the NAT problem; not
  worth it at 2–10 booths).
- `mock` provider stays on the booth for offline dev.
