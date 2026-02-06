/**
 * PM2 Configuration for Photonic
 * Process manager for 24/7 operation
 */

module.exports = {
  apps: [
    {
      name: "photonic",
      script: "./src/main/index.js",
      instances: 1,
      exec_mode: "fork",

      // Auto-restart settings
      autorestart: true,
      watch: false,
      min_uptime: "10s",
      max_restarts: 10,
      restart_delay: 3000,

      // Memory management
      max_memory_restart: "1G",

      // Environment variables
      env: {
        NODE_ENV: "production",
        PORT: 4000,
        PHOTO_DIR: "./photos",
        MOCK_CAMERA: "false",
        BACKEND_PORT: 4000,
      },

      // Development environment (for testing)
      env_development: {
        NODE_ENV: "development",
        PORT: 4000,
        PHOTO_DIR: "./photos",
        MOCK_CAMERA: "true",
        DEBUG: "true",
      },

      // Logging
      log_file: "./logs/combined.log",
      out_file: "./logs/out.log",
      error_file: "./logs/error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      combine_logs: true,

      // Process management
      kill_timeout: 5000,
      listen_timeout: 10000,

      // Advanced
      merge_logs: true,
      time: true,

      // Pre-start script (check dependencies)
      pre_exec: "./scripts/check-deps.sh",

      // Post-start verification
      post_start: "./scripts/verify-start.sh",
    },
  ],

  // Deployment configuration (optional, for multiple booths)
  deploy: {
    production: {
      user: "photobooth",
      host: "localhost",
      ref: "origin/main",
      repo: "https://github.com/yourusername/photonic.git",
      path: "/home/photobooth/photonic",
      "post-deploy":
        "npm install && pm2 reload ecosystem.config.js --env production",
    },
  },
};
