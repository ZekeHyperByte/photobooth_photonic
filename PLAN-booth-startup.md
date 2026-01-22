# Plan: Booth Startup Automation

## Goal
Single-command or automatic startup of all Photonic services when the booth device turns on.

## Current State
- 4 apps need to run: backend, frontend, admin-web, bridge
- `pnpm dev` runs all in development mode
- No production startup script or systemd service

## Options

### Option A: Systemd Services (Recommended for Production)
Create systemd user services for each component:

```
~/.config/systemd/user/
├── photonic-backend.service
├── photonic-frontend.service
├── photonic-admin-web.service
├── photonic-bridge.service
└── photonic.target (groups all services)
```

**Pros:** Auto-restart on crash, proper logging, boot integration
**Cons:** More setup, Linux-specific

### Option B: Single Startup Script
Create `scripts/start-booth.sh`:
- Runs all services with proper environment
- Uses PM2 or similar for process management
- Can be added to desktop autostart

**Pros:** Simple, portable
**Cons:** Manual restart on crash

### Option C: Docker Compose
Containerize all services with docker-compose.yml

**Pros:** Isolated, reproducible
**Cons:** Overhead, complexity for single-device deployment

## Recommended Implementation (Option A)

1. [ ] Create production build script (`scripts/build-production.sh`)
2. [ ] Create systemd service files for each app
3. [ ] Create `photonic.target` to group services
4. [ ] Add install script (`scripts/install-services.sh`)
5. [ ] Configure auto-login and service start on boot
6. [ ] Add health monitoring / auto-restart

## Service Dependencies

```
photonic.target
├── photonic-backend.service (starts first)
├── photonic-bridge.service (after backend)
├── photonic-frontend.service (after backend)
└── photonic-admin-web.service (optional, after backend)
```

## Environment
- Node.js production mode
- Proper DATABASE_URL
- Midtrans credentials
- Camera/printer access

## Notes
- Frontend (Electron) needs display access (DISPLAY=:0)
- Bridge needs camera USB access
- Consider kiosk mode for frontend (fullscreen, no close button)
