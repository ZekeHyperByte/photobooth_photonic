# Phase 3b — WhatsApp Send → Central

Move WhatsApp delivery off the booth. Central already hosts the photos (Phase 3),
so it sends the public photo URLs to the provider (Fonnte) — provider key lives
on central, not on every booth.

## Flow
```
Booth                                   Central
 hostedDeliveryService.deliverWhatsApp    POST /api/host/deliver {shareId, phone}
   POST shareId + phone  -------------->    getHostedPhotos(shareId)
                         <-- {sent,failed}  Fonnte send each URL (key here)
                                            record in `deliveries` table
```
Booth sends only `shareId + phoneNumber` — no file streaming, no provider key.

## Built
Central:
- `lib/whatsapp.ts` — `formatPhoneNumber` (pure, tested), `deliverWhatsApp`
  (Fonnte send by URL), `deliveries` table + `recordDelivery`.
- `app/api/host/deliver/route.ts` — `X-API-Key`, fetch hosted photos, deliver.

Booth (additive — local `whatsappService` untouched):
- `hostedDeliveryService.deliverWhatsApp(shareId, phoneNumber)`
- `POST /api/delivery/host/whatsapp`

Verified: backend `tsc` clean · central `tsc` + `next build` clean ·
`formatPhoneNumber` tests pass (8/8 central total).

## Deferred
- **Email** customer delivery — net-new (no booth equivalent today); needs SMTP.
- **Background queue / retry** — sends are synchronous; the `deliveries` table
  records status but there's no re-drain worker yet. Fine at 2–10 booths;
  add a worker if volume/failures grow.
- **Wablas** provider — only Fonnte wired server-side (booth had both).
- Delivery status polling back to the booth (booth gets `{sent,failed}` inline).

## Remaining to go live
- [ ] Set `WHATSAPP_API_KEY` (Fonnte) on the central server
- [ ] Frontend: after hosting, call `POST /api/delivery/host/whatsapp` with the
      shareId + customer phone
- [ ] Retire the booth's direct WhatsApp path once central delivery is proven
      (keep as offline fallback if desired)
