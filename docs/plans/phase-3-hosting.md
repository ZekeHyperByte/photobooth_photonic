# Phase 3 — Photo Hosting + QR Delivery

Booth uploads a session's **final** JPEGs to the central server, which stores
them in blob storage and hosts a public download page. The booth shows a QR;
the customer scans it to download. Offloads storage off the booth and gives a
keys-free delivery channel.

**Processing stays local** (sharp composite). Only finished JPEGs leave the booth.

## Flow
```
Booth (Fastify)                          Central (Next on Vercel)
 hosted-delivery-service                   /api/host/upload (multipart, X-API-Key)
   POST session photos  ----------------->   store blob (Vercel Blob | local disk)
                        <-- shareId, URL,     insert hosted_photos, build QR
                            qrDataUrl
 show QR to customer
                                           Customer scans QR -> /d/<shareId>
                                             public download page (lists photos)
                                           /api/host/file/<key>  (serves local dev blobs)
```

## Built (server half — fully build-verified)
- `lib/storage.ts` — `Storage` interface; `VercelBlobStorage` (prod, needs
  `BLOB_READ_WRITE_TOKEN`) / `LocalDiskStorage` (dev). Path-traversal guarded.
- `lib/hosted.ts` — `hosted_photos` table + share lookup + QR (`qrcode`).
- `app/api/host/upload/route.ts` — store + group under a random `shareId`, return
  download URL + QR data-URL.
- `app/api/host/file/[...key]/route.ts` — serves local-stored blobs in dev.
- `app/d/[shareId]/page.tsx` — public download page.

## Built (booth half — additive, doesn't touch existing delivery)
- `services/hosted-delivery-service.ts` — upload session photos to central.
- `POST /api/delivery/host/session` — returns `{ shareId, downloadUrl, qrDataUrl }`.

The existing WhatsApp/print delivery is untouched — this is a new channel.

## Security
- `shareId` = `randomBytes(6).base64url` — unguessable capability in the URL.
- Upload requires `X-API-Key`; the public download page/file need only the shareId.
- `readLocal` rejects `..` path traversal (tested).

Verified: backend `tsc` clean · central `tsc` + `next build` clean (routes
dynamic) · storage roundtrip + traversal tests pass.

## Deferred → Phase 3b (move delivery *send* server-side)
Today WhatsApp still sends from the booth (Fonnte/Wablas key on the booth,
reads local file). Moving it to central — booth passes phone + shareId, central
drains a WhatsApp/email queue with the keys — is a provider-key move analogous
to Phase 1. The hosting built here is the prerequisite (central already has the
photos). Not done yet.

## Remaining to go live
- [ ] Set `BLOB_READ_WRITE_TOKEN` on Vercel (else prod writes to ephemeral disk)
- [ ] Frontend: call `POST /api/delivery/host/session`, render `qrDataUrl` on the
      delivery screen
- [ ] Wire the upload at end of session (after composite) or on the delivery screen
- [ ] e2e: booth → central `next dev` → scan QR → download (local-disk storage)
- [ ] Retention/cleanup policy for hosted blobs (TTL) — currently kept forever
