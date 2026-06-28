/**
 * Hosted Delivery Service (Phase 3)
 *
 * Uploads a session's final photos to the central server, which stores them in
 * blob storage and hosts a public download page. Returns the shareable URL + a
 * QR data-URL the booth shows the customer.
 *
 * Processing stays local (sharp); only the finished JPEGs leave the booth.
 */

import fs from 'fs';
import axios from 'axios';
import FormData from 'form-data';
import { asc, eq } from 'drizzle-orm';
import { db } from '../db';
import { photos } from '../db/schema';
import { env } from '../config/env';
import { createLogger } from '@photonic/utils';

const logger = createLogger('hosted-delivery');

export interface HostResult {
  shareId: string;
  downloadUrl: string;
  qrDataUrl: string;
  count: number;
}

class HostedDeliveryService {
  /** Upload all of a session's photos to central; return the share URL + QR. */
  async hostSession(sessionId: string): Promise<HostResult> {
    if (!env.sync.centralServerUrl) {
      throw new Error('CENTRAL_SERVER_URL not configured');
    }

    const sessionPhotos = await db
      .select()
      .from(photos)
      .where(eq(photos.sessionId, sessionId))
      .orderBy(asc(photos.sequenceNumber))
      .all();

    if (sessionPhotos.length === 0) {
      throw new Error(`No photos found for session ${sessionId}`);
    }

    const form = new FormData();
    form.append('boothId', env.sync.boothId);
    form.append('sessionId', sessionId);
    for (const p of sessionPhotos) {
      const filePath = p.processedPath || p.originalPath;
      if (!fs.existsSync(filePath)) {
        logger.warn('Skipping missing photo file', { photoId: p.id, filePath });
        continue;
      }
      form.append('files', fs.createReadStream(filePath));
    }

    const res = await axios.post(
      `${env.sync.centralServerUrl}/api/host/upload`,
      form,
      {
        headers: { ...form.getHeaders(), 'X-API-Key': env.sync.centralServerApiKey },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 60000,
      },
    );

    if (!res.data?.success) {
      throw new Error(res.data?.error || 'Central upload failed');
    }

    logger.info('Session hosted on central', {
      sessionId,
      shareId: res.data.shareId,
      count: res.data.count,
    });

    return {
      shareId: res.data.shareId,
      downloadUrl: res.data.downloadUrl,
      qrDataUrl: res.data.qrDataUrl,
      count: res.data.count,
    };
  }

  /**
   * Deliver an already-hosted session via WhatsApp from the central server
   * (provider keys live on central, not the booth). Phase 3b.
   */
  async deliverWhatsApp(
    shareId: string,
    phoneNumber: string,
  ): Promise<{ sent: number; failed: number }> {
    if (!env.sync.centralServerUrl) {
      throw new Error('CENTRAL_SERVER_URL not configured');
    }

    const res = await axios.post(
      `${env.sync.centralServerUrl}/api/host/deliver`,
      { shareId, phoneNumber },
      {
        headers: { 'X-API-Key': env.sync.centralServerApiKey },
        timeout: 60000,
      },
    );

    if (!res.data?.success) {
      throw new Error(res.data?.error || 'Central delivery failed');
    }

    logger.info('Session delivered via central WhatsApp', {
      shareId,
      sent: res.data.sent,
      failed: res.data.failed,
    });

    return { sent: res.data.sent, failed: res.data.failed };
  }
}

export const hostedDeliveryService = new HostedDeliveryService();
