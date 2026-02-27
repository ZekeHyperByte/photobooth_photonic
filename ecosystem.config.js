/**
 * PM2 Ecosystem Configuration
 * Manages Photonic Camera Service and Backend
 *
 * Usage:
 *   pm2 start ecosystem.config.js              # Start all services
 *   pm2 stop ecosystem.config.js               # Stop all services
 *   pm2 restart ecosystem.config.js            # Restart all services
 *   pm2 logs                                   # View logs
 *   pm2 monit                                  # Monitor dashboard
 *
 * Auto-start on boot:
 *   pm2 startup
 *   pm2 save
 */

module.exports = {
  apps: [
    {
      name: "photonic-camera",
      cwd: "/home/qiu/photonic-v0.1/services/camera",
      script: "./.venv/bin/python",
      args: "-m src.main",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PYTHONUNBUFFERED: "1",
      },
      log_file: "/home/qiu/photonic-v0.1/logs/camera-service.log",
      out_file: "/home/qiu/photonic-v0.1/logs/camera-service-out.log",
      error_file: "/home/qiu/photonic-v0.1/logs/camera-service-error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      // Wait for service to be ready before marking as started
      wait_ready: true,
      // Graceful shutdown
      kill_timeout: 5000,
      // Don't start if already running
      instance_var: "INSTANCE_ID",
      // Restart delay
      restart_delay: 3000,
    },
    {
      name: "photonic-backend",
      cwd: "/home/qiu/photonic-v0.1/apps/backend",
      script: "./node_modules/.bin/tsx",
      args: "watch src/index.ts",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "development",
        PORT: "4000",
        CAMERA_PROVIDER: "python-gphoto2",
      },
      env_production: {
        NODE_ENV: "production",
        PORT: "4000",
        CAMERA_PROVIDER: "python-gphoto2",
      },
      log_file: "/home/qiu/photonic-v0.1/logs/backend.log",
      out_file: "/home/qiu/photonic-v0.1/logs/backend-out.log",
      error_file: "/home/qiu/photonic-v0.1/logs/backend-error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      // Wait for camera service to be ready (starts after camera)
      wait_ready: false,
      // Graceful shutdown
      kill_timeout: 5000,
      // Restart delay
      restart_delay: 2000,
      // Start after camera service
      exec_interpreter: "none",
    },
  ],

  deploy: {
    production: {
      user: "qiu",
      host: "localhost",
      ref: "origin/main",
      repo: "git@github.com:yourusername/photonic.git",
      path: "/home/qiu/photonic-v0.1",
      "post-deploy":
        "pnpm install && pm2 reload ecosystem.config.js --env production",
    },
  },
};
