import nodemailer from "nodemailer";
import { createLogger } from "@photonic/utils";

const logger = createLogger("email-alerts");

/**
 * Email Alert Service
 * Sends email notifications for critical system events
 */
export class EmailAlertService {
  private transporter: nodemailer.Transporter | null = null;
  private enabled: boolean = false;
  private from: string = "";
  private to: string = "";

  constructor() {
    this.initialize();
  }

  private initialize() {
    const host = process.env.SMTP_HOST;
    const port = process.env.SMTP_PORT;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
      logger.info("Email alerts not configured (SMTP env vars missing)");
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host,
        port: parseInt(port || "587"),
        secure: false, // true for 465, false for other ports
        auth: {
          user,
          pass,
        },
        tls: {
          rejectUnauthorized: false, // Allow self-signed certs
        },
      });

      this.from = process.env.ALERT_FROM || user;
      this.to = process.env.ALERT_TO || user;
      this.enabled = true;

      logger.info("Email alert service initialized", {
        host,
        from: this.from,
        to: this.to,
      });
    } catch (error) {
      logger.error("Failed to initialize email alert service:", error);
    }
  }

  /**
   * Send an alert email
   */
  async sendAlert(
    subject: string,
    message: string,
    details?: Record<string, any>,
  ): Promise<boolean> {
    if (!this.enabled || !this.transporter) {
      logger.debug("Email alerts disabled, skipping alert");
      return false;
    }

    try {
      const timestamp = new Date().toISOString();
      const hostname = require("os").hostname();

      let htmlMessage = `
<h2>🚨 Photonic Photo Booth Alert</h2>
<p><strong>Booth:</strong> ${hostname}</p>
<p><strong>Time:</strong> ${timestamp}</p>
<hr>
<h3>${subject}</h3>
<pre>${message}</pre>
      `;

      if (details) {
        htmlMessage += `
<hr>
<h4>Details:</h4>
<pre>${JSON.stringify(details, null, 2)}</pre>
        `;
      }

      const info = await this.transporter.sendMail({
        from: `"Photonic Booth" <${this.from}>`,
        to: this.to,
        subject: `🚨 Photonic Alert: ${subject}`,
        text: `[${timestamp}] ${hostname}: ${subject}\n\n${message}`,
        html: htmlMessage,
      });

      logger.info("Alert email sent", { messageId: info.messageId, subject });
      return true;
    } catch (error) {
      logger.error("Failed to send alert email:", error);
      return false;
    }
  }

  /**
   * Send camera error alert
   */
  async sendCameraAlert(error: string, cameraModel?: string): Promise<boolean> {
    return this.sendAlert(
      "Camera Error",
      `The camera has encountered an error and may not be functioning properly.`,
      { error, cameraModel, severity: "high" },
    );
  }

  /**
   * Send payment failure alert
   */
  async sendPaymentAlert(orderId: string, error: string): Promise<boolean> {
    return this.sendAlert(
      "Payment Processing Failed",
      `A payment could not be processed.`,
      { orderId, error, severity: "high" },
    );
  }

  /**
   * Send disk space warning
   */
  async sendDiskSpaceAlert(
    usagePercent: number,
    freeSpace: string,
  ): Promise<boolean> {
    return this.sendAlert(
      "Disk Space Warning",
      `Disk usage is at ${usagePercent}%. Free space: ${freeSpace}`,
      { usagePercent, freeSpace, severity: "medium" },
    );
  }

  /**
   * Send service crash/restart alert
   */
  async sendServiceAlert(
    serviceName: string,
    status: string,
    error?: string,
  ): Promise<boolean> {
    return this.sendAlert(
      "Service Alert",
      `Service ${serviceName} is ${status}.`,
      { serviceName, status, error, severity: "high" },
    );
  }

  /**
   * Test email configuration
   */
  async testConfiguration(): Promise<boolean> {
    if (!this.enabled || !this.transporter) {
      logger.warn("Cannot test: Email alerts not configured");
      return false;
    }

    try {
      await this.transporter.verify();

      await this.sendAlert(
        "Test Alert",
        "This is a test email from your Photonic Photo Booth system.\n\nIf you received this, email alerts are working correctly!",
        { test: true },
      );

      logger.info("Email test successful");
      return true;
    } catch (error) {
      logger.error("Email test failed:", error);
      return false;
    }
  }

  /**
   * Check if alerts are enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}

// Singleton instance
let alertService: EmailAlertService | null = null;

export function getEmailAlertService(): EmailAlertService {
  if (!alertService) {
    alertService = new EmailAlertService();
  }
  return alertService;
}
