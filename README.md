# Photonic V1.1.0 - Photo Booth System

Commercial photo booth system with Canon DSLR integration, QRIS payment, and multi-channel photo delivery.

## Features

- 📷 Canon EOS DSLR camera integration
- 💳 Midtrans QRIS payment gateway
- 🎨 Template overlays and photo filters
- 📱 WhatsApp delivery
- 🖨️ Thermal/photo printer support
- 👆 Touch-optimized kiosk interface (10.5-10.7" screen)
- 🛡️ Admin panel for management
- 💾 SQLite database with automatic backups

## Architecture

### Monorepo Structure
```
photonic-v0.1/
├── packages/          # Shared packages
│   ├── types/        # TypeScript types
│   ├── config/       # Shared configuration
│   └── utils/        # Shared utilities
├── apps/
│   ├── frontend/     # Electron + React kiosk app
│   └── backend/      # Fastify API + SQLite + Camera Service
```

### Tech Stack
- **Frontend**: Electron + React + Vite + TailwindCSS + Zustand
- **Backend**: Fastify + SQLite + Drizzle ORM + Sharp + Camera Service
- **Camera**: gphoto2 (Linux) / digiCamControl (Windows)
- **Payment**: Midtrans SDK (QRIS)
- **WhatsApp**: Fonnte/Wablas API

### Services
1. **Backend API (Port 4000)** - Main API server with integrated camera control
2. **Frontend (Electron)** - Kiosk interface

## Prerequisites

- Node.js 18+ LTS
- pnpm 8+
- Canon EOS DSLR camera (tested with EOS 550D)

### Platform-Specific Requirements

**Windows (Recommended for Production):**
- Windows 10/11
- digiCamControl (https://digicamcontrol.com/)
- Visual Studio Build Tools (for native dependencies)

**Linux (Development/Alternative):**
- Ubuntu 20.04+ or similar
- gphoto2 and libgphoto2-dev

## Getting Started

### Windows Production Setup

**For complete Windows kiosk deployment**, see the comprehensive guide:
- **[WINDOWS-SETUP-COMPLETE.md](./WINDOWS-SETUP-COMPLETE.md)** - Full step-by-step setup for production deployment

This guide covers:
- Prerequisites and installation
- Hardware setup (Canon camera, printer)
- Windows Service configuration
- Payment gateway setup
- WhatsApp delivery setup
- Complete troubleshooting

### Quick Setup (Development)

```bash
# Install dependencies
pnpm install

# Build shared packages
pnpm --filter @photonic/types build
pnpm --filter @photonic/config build
pnpm --filter @photonic/utils build
```

### Database Setup

```bash
# Set up backend database
cd apps/backend
pnpm db:migrate
pnpm db:seed
```

### Development

Run services in separate terminals:

```bash
# Terminal 1: Backend API (port 4000) with camera service
cd apps/backend
pnpm dev

# Terminal 2: Frontend Electron
cd apps/frontend
pnpm dev
```

### Environment Variables

Create `.env` files in each app directory:

**apps/backend/.env**
```
NODE_ENV=development
PORT=4000
DATABASE_PATH=./data/photobooth.db

# Camera Settings
TEMP_PHOTO_PATH=./temp
MOCK_CAMERA=false
USE_WEBCAM=false

# Windows Only: Custom digiCamControl path (if not using default)
# DIGICAMCONTROL_PATH=C:\Program Files\digiCamControl

# Payment Gateway
MIDTRANS_SERVER_KEY=your_server_key
MIDTRANS_CLIENT_KEY=your_client_key
MIDTRANS_ENVIRONMENT=sandbox

# WhatsApp Delivery
WHATSAPP_PROVIDER=fonnte
WHATSAPP_API_KEY=your_api_key
```

**apps/frontend/.env**
```
VITE_API_URL=http://localhost:4000
```

## Customer Flow

1. **Package Selection** - Customer selects photo package
2. **Payment** - Scan QRIS code and pay via mobile banking
3. **Capture** - Countdown and photo capture
4. **Processing** - Apply template and filters
5. **Delivery** - Download, WhatsApp, or print photo

## Admin Panel

Access the admin panel at `/admin` with default credentials:
- Password: `changeme123` (change in settings)

Features:
- Dashboard with analytics
- Package management
- Template upload and management
- Transaction history
- System settings

## Deployment

See `docs/DEPLOYMENT.md` for detailed deployment instructions.

```bash
# Build for production
pnpm build

# Create Windows installer
cd apps/frontend
pnpm build:installer
```

## Project Status

**Current Version**: 0.1.0 (MVP Prototype)
**Status**: In Development

## License

Proprietary - All rights reserved

## Support

For issues and feature requests, contact your development team.
