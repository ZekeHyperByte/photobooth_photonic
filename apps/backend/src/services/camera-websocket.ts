/**
 * WebSocket Camera Events
 *
 * Push camera events to connected clients via WebSocket.
 * Events: camera:connected, camera:disconnected, camera:ready,
 *         camera:busy, camera:error, battery:low,
 *         capture:complete, capture:error
 */

import { WebSocketServer, WebSocket } from "ws";
import { FastifyInstance } from "fastify";
import { createLogger } from "@photonic/utils";
import { getCameraService } from "../services/camera-service";
import type { ExtendedCameraStatusResponse } from "../camera/types";

const logger = createLogger("ws-camera");

interface CameraEvent {
  type: string;
  data: any;
  timestamp: string;
}

interface WSClient {
  ws: WebSocket;
  id: string;
  subscriptions: Set<string>;
}

export class CameraWebSocketServer {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, WSClient> = new Map();
  private fastify: FastifyInstance | null = null;
  private lastBatteryLevel: number = 100;
  private batteryWarningThreshold: number = 20;

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify;
    this.setupWebSocket();
  }

  /**
   * Setup WebSocket server
   */
  private setupWebSocket(): void {
    if (!this.fastify) return;

    this.wss = new WebSocketServer({
      server: this.fastify.server,
      path: "/ws/camera",
    });

    this.wss.on("connection", (ws: WebSocket, req: any) => {
      const clientId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const client: WSClient = {
        ws,
        id: clientId,
        subscriptions: new Set(),
      };

      this.clients.set(clientId, client);
      logger.info(
        `WebSocket: Client ${clientId} connected (${this.clients.size} total)`,
      );

      // Send welcome message
      this.sendToClient(client, {
        type: "connection",
        data: { status: "connected", clientId },
        timestamp: new Date().toISOString(),
      });

      // Handle messages from client
      ws.on("message", (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleClientMessage(client, message);
        } catch (error) {
          logger.warn("WebSocket: Invalid message from client", { error });
        }
      });

      // Handle disconnect
      ws.on("close", () => {
        this.clients.delete(clientId);
        logger.info(
          `WebSocket: Client ${clientId} disconnected (${this.clients.size} remaining)`,
        );
      });

      // Handle errors
      ws.on("error", (error) => {
        logger.error(`WebSocket: Client ${clientId} error`, { error });
        this.clients.delete(clientId);
      });
    });

    logger.info("WebSocket: Camera events server initialized on /ws/camera");
  }

  /**
   * Handle message from client
   */
  private handleClientMessage(client: WSClient, message: any): void {
    switch (message.action) {
      case "subscribe":
        if (message.events && Array.isArray(message.events)) {
          message.events.forEach((event: string) =>
            client.subscriptions.add(event),
          );
          logger.debug(
            `WebSocket: Client ${client.id} subscribed to ${message.events.join(", ")}`,
          );
        }
        break;

      case "unsubscribe":
        if (message.events && Array.isArray(message.events)) {
          message.events.forEach((event: string) =>
            client.subscriptions.delete(event),
          );
        }
        break;

      case "getStatus":
        this.sendCurrentStatus(client);
        break;

      default:
        logger.warn(`WebSocket: Unknown action ${message.action}`);
    }
  }

  /**
   * Send current camera status to client
   */
  private async sendCurrentStatus(client: WSClient): Promise<void> {
    try {
      const cameraService = getCameraService();
      const status = await cameraService.getStatus();

      this.sendToClient(client, {
        type: "camera:status",
        data: status,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("WebSocket: Error getting camera status", { error });
    }
  }

  /**
   * Broadcast event to all connected clients
   */
  broadcast(event: CameraEvent): void {
    for (const client of this.clients.values()) {
      // Check if client is subscribed to this event type
      if (
        client.subscriptions.size === 0 ||
        client.subscriptions.has(event.type)
      ) {
        this.sendToClient(client, event);
      }
    }
  }

  /**
   * Send event to specific client
   */
  private sendToClient(client: WSClient, event: CameraEvent): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.send(JSON.stringify(event));
      } catch (error) {
        logger.error(`WebSocket: Error sending to client ${client.id}`, {
          error,
        });
      }
    }
  }

  /**
   * Emit camera connected event
   */
  emitConnected(model: string, battery: number): void {
    this.broadcast({
      type: "camera:connected",
      data: { model, battery },
      timestamp: new Date().toISOString(),
    });
    this.lastBatteryLevel = battery;
  }

  /**
   * Emit camera disconnected event
   */
  emitDisconnected(reason?: string): void {
    this.broadcast({
      type: "camera:disconnected",
      data: { reason: reason || "Camera disconnected" },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit camera ready event
   */
  emitReady(data: any): void {
    this.broadcast({
      type: "camera:ready",
      data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit camera busy event
   */
  emitBusy(operation: string): void {
    this.broadcast({
      type: "camera:busy",
      data: { operation },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit camera error event
   */
  emitError(code: string, message: string): void {
    this.broadcast({
      type: "camera:error",
      data: { code, message },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit battery low warning
   */
  emitBatteryLow(level: number): void {
    this.broadcast({
      type: "battery:low",
      data: { level, threshold: this.batteryWarningThreshold },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Check and emit battery warning if needed
   */
  checkBatteryLevel(currentLevel: number): void {
    if (
      currentLevel <= this.batteryWarningThreshold &&
      this.lastBatteryLevel > this.batteryWarningThreshold
    ) {
      this.emitBatteryLow(currentLevel);
    }
    this.lastBatteryLevel = currentLevel;
  }

  /**
   * Emit capture complete event
   */
  emitCaptureComplete(
    sessionId: string,
    sequenceNumber: number,
    filePath: string,
  ): void {
    this.broadcast({
      type: "capture:complete",
      data: { sessionId, sequenceNumber, filePath },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit capture error event
   */
  emitCaptureError(
    sessionId: string,
    sequenceNumber: number,
    error: string,
  ): void {
    this.broadcast({
      type: "capture:error",
      data: { sessionId, sequenceNumber, error },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get number of connected clients
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Close WebSocket server
   */
  close(): void {
    if (this.wss) {
      // Close all client connections
      for (const client of this.clients.values()) {
        client.ws.close();
      }
      this.clients.clear();

      this.wss.close();
      this.wss = null;
      logger.info("WebSocket: Server closed");
    }
  }
}

// Singleton instance
let cameraWebSocketServer: CameraWebSocketServer | null = null;

export function initializeCameraWebSocket(
  fastify: FastifyInstance,
): CameraWebSocketServer {
  if (!cameraWebSocketServer) {
    cameraWebSocketServer = new CameraWebSocketServer(fastify);
  }
  return cameraWebSocketServer;
}

export function getCameraWebSocketServer(): CameraWebSocketServer | null {
  return cameraWebSocketServer;
}

export function closeCameraWebSocket(): void {
  if (cameraWebSocketServer) {
    cameraWebSocketServer.close();
    cameraWebSocketServer = null;
  }
}
