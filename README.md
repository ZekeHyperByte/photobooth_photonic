# Photonic V0.1 - Photo Booth System

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
│   ├── backend/      # Fastify API + SQLite
│   └── bridge/       # DSLR camera service (gphoto2)
```

### Tech Stack
- **Frontend**: Electron + React + Vite + TailwindCSS + Zustand
- **Backend**: Fastify + SQLite + Drizzle ORM + Sharp
- **Bridge**: Express + node-gphoto2
- **Payment**: Midtrans SDK (QRIS)
- **WhatsApp**: Fonnte/Wablas API

### Services
1. **Backend API (Port 4000)** - Main API server
2. **Bridge Service (Port 5000)** - Camera control
3. **Frontend (Electron)** - Kiosk interface

## Prerequisites

- Node.js 18+ LTS
- pnpm 8+
- Windows OS (for production deployment)
- Canon EOS DSLR camera
- gphoto2 (for camera control)

## Getting Started

### Installation

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

Run all services in separate terminals:

```bash
# Terminal 1: Backend API (port 4000)
cd apps/backend
pnpm dev

# Terminal 2: Bridge Service (port 5000)
cd apps/bridge
pnpm dev

# Terminal 3: Frontend Electron
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
BRIDGE_SERVICE_URL=http://localhost:5000
MIDTRANS_SERVER_KEY=your_server_key
MIDTRANS_CLIENT_KEY=your_client_key
MIDTRANS_ENVIRONMENT=sandbox
WHATSAPP_PROVIDER=fonnte
WHATSAPP_API_KEY=your_api_key
```

**apps/bridge/.env**
```
NODE_ENV=development
PORT=5000
TEMP_PHOTO_PATH=./temp
```

**apps/frontend/.env**
```
VITE_API_URL=http://localhost:4000
VITE_BRIDGE_URL=http://localhost:5000
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
