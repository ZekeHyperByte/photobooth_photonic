import { ServerResponse } from 'http';
import { createLogger } from '@photonic/utils';
import { getCameraService } from './camera-service';
import { nanoid } from 'nanoid';

const logger = createLogger('preview-stream');

const BOUNDARY = 'frame';
const FRAME_INTERVAL_MS = 100; // ~10fps

interface Client {
  id: string;
  res: ServerResponse;
}

class PreviewStreamManager {
  private clients: Map<string, Client> = new Map();
  private loopRunning = false;
  private loopAbort: AbortController | null = null;

  addClient(res: ServerResponse): string {
    const id = nanoid();
    this.clients.set(id, { id, res });
    logger.info(`Preview client added: ${id} (total: ${this.clients.size})`);

    if (!this.loopRunning) {
      this.startLoop();
    }

    return id;
  }

  removeClient(id: string): void {
    this.clients.delete(id);
    logger.info(`Preview client removed: ${id} (total: ${this.clients.size})`);

    if (this.clients.size === 0) {
      this.stopLoop();
    }
  }

  stopAll(): void {
    this.stopLoop();
    for (const [id, client] of this.clients) {
      try {
        client.res.end();
      } catch {
        // client already disconnected
      }
    }
    this.clients.clear();
    logger.info('All preview clients stopped');
  }

  get clientCount(): number {
    return this.clients.size;
  }

  private startLoop(): void {
    if (this.loopRunning) return;

    this.loopRunning = true;
    this.loopAbort = new AbortController();
    const cameraService = getCameraService();
    cameraService.setStreaming(true);

    logger.info('Preview loop started');

    const run = async () => {
      while (this.loopRunning && this.clients.size > 0) {
        try {
          const frame = await cameraService.getPreviewFrame();
          this.broadcastFrame(frame);
        } catch (err: any) {
          logger.error('Preview frame error:', err.message);
        }

        // Sleep between frames
        await new Promise(resolve => setTimeout(resolve, FRAME_INTERVAL_MS));
      }
      this.loopRunning = false;
      cameraService.setStreaming(false);
      logger.info('Preview loop ended');
    };

    run().catch(err => {
      logger.error('Preview loop crashed:', err);
      this.loopRunning = false;
      cameraService.setStreaming(false);
    });
  }

  private stopLoop(): void {
    this.loopRunning = false;
    if (this.loopAbort) {
      this.loopAbort.abort();
      this.loopAbort = null;
    }
  }

  private broadcastFrame(frame: Buffer): void {
    const header =
      `--${BOUNDARY}\r\n` +
      `Content-Type: image/jpeg\r\n` +
      `Content-Length: ${frame.length}\r\n` +
      `\r\n`;

    const deadClients: string[] = [];

    for (const [id, client] of this.clients) {
      try {
        client.res.write(header);
        client.res.write(frame);
        client.res.write('\r\n');
      } catch {
        deadClients.push(id);
      }
    }

    for (const id of deadClients) {
      this.clients.delete(id);
      logger.info(`Dead preview client removed: ${id}`);
    }

    if (this.clients.size === 0) {
      this.stopLoop();
    }
  }
}

let instance: PreviewStreamManager | null = null;

export function getPreviewStreamManager(): PreviewStreamManager {
  if (!instance) {
    instance = new PreviewStreamManager();
  }
  return instance;
}
