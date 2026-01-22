import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import { nanoid } from 'nanoid';
import { db } from '../db';
import { whatsappDeliveries, photos, sessions } from '../db/schema';
import { eq, asc } from 'drizzle-orm';
import { env } from '../config/env';
import { logger } from '@photonic/utils';
import type { SendWhatsAppRequest } from '@photonic/types';

/**
 * WhatsApp Service
 * Handles message delivery via Fonnte or Wablas
 */
export class WhatsAppService {
  private provider: 'fonnte' | 'wablas';
  private apiKey: string;
  private apiBaseUrl: string;

  constructor() {
    this.provider = env.whatsapp.provider;
    this.apiKey = env.whatsapp.apiKey;

    // Set API base URL based on provider
    if (this.provider === 'fonnte') {
      this.apiBaseUrl = 'https://api.fonnte.com';
    } else if (this.provider === 'wablas') {
      this.apiBaseUrl = 'https://pati.wablas.com'; // Example domain
    } else {
      throw new Error(`Unsupported WhatsApp provider: ${this.provider}`);
    }

    logger.info('WhatsAppService initialized', { provider: this.provider });
  }

  /**
   * Send photo via WhatsApp
   */
  async sendPhoto(
    phoneNumber: string,
    photoPath: string,
    caption?: string
  ): Promise<string> {
    try {
      logger.info('Sending WhatsApp message', {
        phoneNumber,
        provider: this.provider,
      });

      // Generate delivery ID
      const deliveryId = nanoid();

      // Format phone number (remove non-digits, add country code if needed)
      const formattedPhone = this.formatPhoneNumber(phoneNumber);

      let response;
      if (this.provider === 'fonnte') {
        response = await this.sendViaFonnte(
          formattedPhone,
          photoPath,
          caption
        );
      } else if (this.provider === 'wablas') {
        response = await this.sendViaWablas(
          formattedPhone,
          photoPath,
          caption
        );
      } else {
        throw new Error(`Unsupported provider: ${this.provider}`);
      }

      // Create delivery record
      await db.insert(whatsappDeliveries).values({
        id: deliveryId,
        phoneNumber: formattedPhone,
        messageId: response.messageId || null,
        status: response.status,
        sentAt: new Date(),
        providerResponse: JSON.stringify(response.raw),
      } as any);

      logger.info('WhatsApp message sent successfully', {
        deliveryId,
        messageId: response.messageId,
      });

      return deliveryId;
    } catch (error) {
      logger.error('Failed to send WhatsApp message', {
        error: error instanceof Error ? error.message : String(error),
        phoneNumber,
      });
      throw error;
    }
  }

  /**
   * Send via Fonnte API
   */
  private async sendViaFonnte(
    phoneNumber: string,
    photoPath: string,
    caption?: string
  ): Promise<{ messageId: string | null; status: string; raw: any }> {
    try {
      const formData = new FormData();
      formData.append('target', phoneNumber);
      formData.append('file', fs.createReadStream(photoPath));
      if (caption) {
        formData.append('caption', caption);
      }

      const response = await axios.post(
        `${this.apiBaseUrl}/send`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            Authorization: this.apiKey,
          },
        }
      );

      logger.info('Fonnte API response', { data: response.data });

      return {
        messageId: response.data.message_id || response.data.id || null,
        status: response.data.status === 'success' ? 'sent' : 'failed',
        raw: response.data,
      };
    } catch (error) {
      logger.error('Fonnte API error', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Send via Wablas API
   */
  private async sendViaWablas(
    phoneNumber: string,
    photoPath: string,
    caption?: string
  ): Promise<{ messageId: string | null; status: string; raw: any }> {
    try {
      const formData = new FormData();
      formData.append('phone', phoneNumber);
      formData.append('image', fs.createReadStream(photoPath));
      if (caption) {
        formData.append('caption', caption);
      }

      const response = await axios.post(
        `${this.apiBaseUrl}/api/send-image`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            Authorization: this.apiKey,
          },
        }
      );

      logger.info('Wablas API response', { data: response.data });

      return {
        messageId: response.data.data?.id || null,
        status: response.data.status ? 'sent' : 'failed',
        raw: response.data,
      };
    } catch (error) {
      logger.error('Wablas API error', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Check delivery status
   */
  async checkStatus(deliveryId: string): Promise<{
    status: string;
    deliveredAt: Date | null;
  }> {
    try {
      logger.info('Checking WhatsApp delivery status', { deliveryId });

      const delivery = await db.query.whatsappDeliveries.findFirst({
        where: eq(whatsappDeliveries.id, deliveryId),
      });

      if (!delivery) {
        throw new Error('Delivery not found');
      }

      // In a production system, you would query the provider's API
      // to get the latest status. For now, we return the stored status.

      return {
        status: delivery.status,
        deliveredAt: delivery.deliveredAt,
      };
    } catch (error) {
      logger.error('Failed to check delivery status', {
        error: error instanceof Error ? error.message : String(error),
        deliveryId,
      });
      throw error;
    }
  }

  /**
   * Send all photos from a session via WhatsApp
   * Includes both individual photos and A3 composite
   */
  async sendSessionPhotos(
    sessionId: string,
    phoneNumber: string
  ): Promise<string[]> {
    try {
      logger.info('Sending session photos via WhatsApp', {
        sessionId,
        phoneNumber,
      });

      // Fetch all photos for the session
      const sessionPhotos = await db
        .select()
        .from(photos)
        .where(eq(photos.sessionId, sessionId))
        .orderBy(asc(photos.sequenceNumber))
        .all();

      if (sessionPhotos.length === 0) {
        throw new Error(`No photos found for session ${sessionId}`);
      }

      logger.info(`Found ${sessionPhotos.length} photos to send`);

      const deliveryIds: string[] = [];

      // Send each photo sequentially
      for (const photo of sessionPhotos) {
        const filePath = photo.processedPath || photo.originalPath;

        // Determine caption based on photo type
        let caption = '';
        const metadata = photo.metadata as any;

        if (metadata?.isComposite) {
          caption = 'Your photobooth A3 print! 🎉\n\nThank you for using our service!';
        } else {
          caption = `Photo ${photo.sequenceNumber} 📸`;
        }

        try {
          const deliveryId = await this.sendPhoto(
            phoneNumber,
            filePath,
            caption
          );
          deliveryIds.push(deliveryId);

          logger.info('Photo sent successfully', {
            photoId: photo.id,
            deliveryId,
          });

          // Small delay between messages to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          logger.error('Failed to send photo', {
            photoId: photo.id,
            error: error instanceof Error ? error.message : String(error),
          });
          // Continue sending other photos even if one fails
        }
      }

      logger.info('Session photos sent successfully', {
        sessionId,
        totalSent: deliveryIds.length,
        totalPhotos: sessionPhotos.length,
      });

      return deliveryIds;
    } catch (error) {
      logger.error('Failed to send session photos', {
        error: error instanceof Error ? error.message : String(error),
        sessionId,
      });
      throw error;
    }
  }

  /**
   * Format phone number to international format
   */
  private formatPhoneNumber(phoneNumber: string): string {
    // Remove all non-digit characters
    let cleaned = phoneNumber.replace(/\D/g, '');

    // Add country code if not present (default to Indonesia +62)
    if (!cleaned.startsWith('62')) {
      // If starts with 0, replace with 62
      if (cleaned.startsWith('0')) {
        cleaned = '62' + cleaned.substring(1);
      } else {
        cleaned = '62' + cleaned;
      }
    }

    return cleaned;
  }
}

// Export singleton instance
export const whatsappService = new WhatsAppService();
