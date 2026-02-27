# Photonic Photo Booth System

<div align="center">

**Commercial-grade photo booth solution with integrated payment, multi-channel delivery, and enterprise analytics.**

[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](./package.json)
[![License](https://img.shields.io/badge/license-Proprietary-red.svg)]()
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)]()
[![pnpm](https://img.shields.io/badge/pnpm-%3E%3D8.0.0-orange.svg)]()

[Quick Start](#quick-start) • [Documentation](#documentation) • [Architecture](#system-architecture) • [API Reference](#api-overview)

</div>

---

## Executive Summary

Photonic is a production-ready photo booth system designed for commercial deployment. Unlike traditional photo booths that require upfront payment, Photonic uses an innovative **code-based workflow** where cashiers generate unique 4-digit codes, customers complete their session, and payment is processed at the end—maximizing conversion and streamlining operations.

### Key Differentiators

- **Code-Based Access**: Cashier-generated codes eliminate payment friction at entry
- **Multi-Modal Camera**: Supports Canon DSLR (Windows/Linux), webcam, or mock mode for development
- **Integrated Payment**: QRIS payment via Midtrans with real-time status updates
- **Multi-Channel Delivery**: Print, WhatsApp (Fonnte/Wablas), and digital download
- **Visual Template Designer**: Drag-and-drop frame creation with Konva.js
- **Enterprise Analytics**: Centralized dashboard for multi-booth deployments

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PHOTONIC SYSTEM                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐            │
│  │  Cashier     │      │  Photobooth  │      │   Customer   │            │
│  │  (Any Device)│      │  (Windows PC)│      │   (Kiosk)    │            │
│  └──────┬───────┘      └──────┬───────┘      └──────┬───────┘            │
│         │                     │                     │                       │
│         │  HTTP               │  HTTP             │                       │
│         ▼                     ▼                     ▼                       │
│  ┌──────────────────────────────────────────────────────────────┐      │
│  │                    BACKEND API (Port 4000)                   │      │
│  │  • Session Management    • Payment Processing (Midtrans)      │      │
│  │  • Camera Control        • Image Processing (Sharp)           │      │
│  │  • Print Queue           • WhatsApp Delivery                │      │
│  │  • Code Generation       • Analytics Sync                   │      │
│  └──────────────────────────────────────────────────────────────┘      │
│         │                     │                     │                       │
│         │                     │                     │                       │
│         ▼                     ▼                     ▼                       │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐            │
│  │  Admin-Web   │      │  Frontend    │      │  Frame-      │            │
│  │  (Port 4001) │      │  (Port 4000) │      │  Manager     │            │
│  │  • Dashboard │      │  • Kiosk UI  │      │  (Port 4002) │            │
│  │  • Code Gen  │      │  • Capture   │      │  • Designer  │            │
│  └──────────────┘      └──────────────┘      └──────────────┘            │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────┐      │
│  │              ANALYTICS DASHBOARD (Optional)                  │      │
│  │         (Next.js + PostgreSQL - Central Server)              │      │
│  └──────────────────────────────────────────────────────────────┘      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Application Overview

| Application       | Port | Purpose                                  | Technology                 |
| ----------------- | ---- | ---------------------------------------- | -------------------------- |
| **Backend**       | 4000 | Core API, camera control, business logic | Fastify + SQLite + Drizzle |
| **Frontend**      | 4000 | Customer-facing kiosk interface          | Electron + React + Vite    |
| **Admin-Web**     | 4001 | Cashier dashboard & code management      | React + Vite               |
| **Frame-Manager** | 4002 | Visual template/frame designer           | React + Konva.js           |
| **Analytics**     | -    | Centralized multi-booth analytics        | Next.js + PostgreSQL       |

---

## Quick Start

### Prerequisites

- **Node.js** 18+ LTS
- **pnpm** 8+ (`npm install -g pnpm@8`)
- **Operating System**:
  - Windows 10/11 (Canon DSLR via EDSDK)
  - Linux Ubuntu 20.04+ / Debian 11+ (Canon DSLR via gphoto2)
- **Canon DSLR** (optional - mock mode available for development)

### One-Command Setup

```bash
# Clone and install
git clone <repository-url>
cd photonic-v0.1
pnpm install

# Build shared packages
pnpm build

# Setup database
cd apps/backend
pnpm db:migrate
pnpm db:seed
```

### Start Development

```bash
# Terminal 1: Backend API
cd apps/backend
pnpm dev

# Terminal 2: Frontend (Browser mode for development)
cd apps/frontend
pnpm dev

# Terminal 3: Admin-Web
cd apps/admin-web
pnpm dev
```

### Verify Installation

```bash
# Backend health check
curl http://localhost:4000/health

# Admin-Web
curl http://localhost:4001

# Test camera (if available)
curl http://localhost:4000/api/camera/status
```

---

## Project Structure

```
photonic-v0.1/
├── apps/
│   ├── backend/              # Core API & business logic
│   │   ├── src/
│   │   │   ├── routes/       # API endpoints
│   │   │   ├── services/     # Business logic
│   │   │   ├── db/           # Database schema & migrations
│   │   │   └── config/       # Environment configuration
│   │   ├── data/             # SQLite database & photos
│   │   └── .env              # Environment variables
│   │
│   ├── frontend/             # Customer kiosk (Electron + React)
│   │   ├── electron/         # Main process & IPC handlers
│   │   ├── src/
│   │   │   ├── screens/      # 13 customer flow screens
│   │   │   ├── stores/       # Zustand state management
│   │   │   ├── services/     # API clients
│   │   │   └── hooks/        # Custom React hooks
│   │   └── .env
│   │
│   ├── admin-web/            # Cashier interface
│   │   └── src/
│   │       ├── components/   # Dashboard, CodeGenerator, CodeList
│   │       └── api/          # Backend client
│   │
│   ├── frame-manager/        # Template designer
│   │   └── src/
│   │       ├── components/   # FrameCanvas, PhotoZone
│   │       └── stores/       # Frame editing state
│   │
│   └── analytics-dashboard/  # Central analytics (Next.js)
│       └── app/
│           ├── api/sync/     # Data ingestion endpoint
│           └── components/   # StatCard, BoothCard
│
├── packages/                 # Shared code
│   ├── types/                # TypeScript interfaces
│   ├── config/               # Constants & configuration
│   └── utils/                # Logger, validators, formatters
│
├── scripts/                    # Setup & utility scripts
│   ├── QUICK-START.md        # Day-to-day operations
│   ├── WINDOWS-SETUP-COMPLETE.md  # Windows installation
│   ├── SYSTEM-ARCHITECTURE.md  # Technical deep-dive
│   └── setup-photobooth-windows.ps1  # Windows setup
│
├── data/                       # Runtime data
│   ├── photos/               # Captured photos
│   └── templates/            # Frame templates
│
├── package.json                # Root workspace configuration
├── pnpm-workspace.yaml         # Workspace definition
└── turbo.json                  # Turborepo configuration
```

---

## Documentation

### Getting Started

| Document                                                       | Purpose                  | Audience              |
| -------------------------------------------------------------- | ------------------------ | --------------------- |
| **[QUICK-START.md](./scripts/QUICK-START.md)**                 | Day-to-day operations    | Cashiers & Operators  |
| **[WINDOWS-SETUP-COMPLETE.md](./WINDOWS-SETUP-COMPLETE.md)**   | Windows production setup | System Administrators |
| **[SYSTEM-ARCHITECTURE.md](./scripts/SYSTEM-ARCHITECTURE.md)** | Technical architecture   | Developers            |

### Quick Navigation

- **I want to run the photobooth** → [QUICK-START.md](./scripts/QUICK-START.md)
- **I need to install on Windows** → [WINDOWS-SETUP-COMPLETE.md](./WINDOWS-SETUP-COMPLETE.md)
- **I want to understand the system** → [SYSTEM-ARCHITECTURE.md](./scripts/SYSTEM-ARCHITECTURE.md)
- **I'm developing new features** → See [Development](#development) section below

---

## Customer Workflow

### Code-Based Session Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Cashier    │     │   Backend    │     │   Customer   │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       │  Generate Code     │                    │
       │───────────────────>│                    │
       │                    │  4-digit code      │
       │<───────────────────│                    │
       │  "1234"            │                    │
       │                    │                    │
       │                    │                    │  Enter Code
       │                    │<───────────────────│
       │                    │                    │
       │                    │  Validate          │
       │                    │  Create Session    │
       │                    │                    │
       │                    │  Start Session     │
       │                    │───────────────────>│
       │                    │                    │
       │                    │                    │  Capture Photos
       │                    │                    │  (3 photos)
       │                    │                    │
       │                    │                    │  Select Template
       │                    │                    │  Apply Filters
       │                    │                    │
       │                    │                    │  Payment (QRIS)
       │                    │                    │
       │                    │                    │  Print / WhatsApp
       │                    │                    │
       │  Dashboard         │                    │
       │  (View Stats)      │                    │
       │<───────────────────│                    │
```

### Screen Flow

1. **Idle Screen** - Attract loop with branding
2. **Code Entry** - Customer enters 4-digit code
3. **Session Notice** - Time limit and instructions
4. **Frame Selection** - Choose photo template
5. **Mirror Selection** - Camera mirroring option
6. **Capture Screen** - Countdown + photo capture (×3)
7. **Photo Review** - Approve or retake
8. **Filter Selection** - Apply photo filters
9. **Processing** - Template overlay & compositing
10. **Preview** - Final result preview
11. **Delivery** - WhatsApp, print, or download
12. **Complete** - Return to idle

---

## Environment Configuration

### Backend (`apps/backend/.env`)

```env
# Server Configuration
NODE_ENV=development          # or 'production'
PORT=4000
DATABASE_PATH=./data/photobooth.db

# Camera Settings
MOCK_CAMERA=false             # Set true for development without camera
USE_WEBCAM=false              # Use browser webcam instead of DSLR
DIGICAMCONTROL_PATH=C:\Program Files\digiCamControl  # Windows only

# Payment Gateway (Midtrans)
MIDTRANS_SERVER_KEY=your_server_key
MIDTRANS_CLIENT_KEY=your_client_key
MIDTRANS_ENVIRONMENT=sandbox  # or 'production'

# WhatsApp Delivery
WHATSAPP_PROVIDER=fonnte      # or 'wablas'
WHATSAPP_API_KEY=your_api_key

# Analytics Sync (Optional)
BOOTH_ID=booth-001
CENTRAL_SERVER_URL=https://your-analytics.vercel.app
CENTRAL_SERVER_API_KEY=your_key
```

### Frontend (`apps/frontend/.env`)

```env
VITE_API_URL=http://localhost:4000
```

---

## API Overview

### Core Endpoints

#### Sessions & Codes

| Method  | Endpoint            | Description                  |
| ------- | ------------------- | ---------------------------- |
| `POST`  | `/api/sessions`     | Create new session with code |
| `GET`   | `/api/sessions/:id` | Get session details          |
| `PATCH` | `/api/sessions/:id` | Update session status        |

#### Payment

| Method | Endpoint               | Description           |
| ------ | ---------------------- | --------------------- |
| `POST` | `/api/payment/create`  | Generate QRIS payment |
| `POST` | `/api/payment/verify`  | Verify payment status |
| `POST` | `/api/payment/webhook` | Midtrans callback     |

#### Photos & Processing

| Method | Endpoint                   | Description           |
| ------ | -------------------------- | --------------------- |
| `POST` | `/api/photos/capture`      | Capture from camera   |
| `POST` | `/api/photos/:id/process`  | Apply template/filter |
| `POST` | `/api/photos/composite-a3` | Create A3 composite   |

#### Camera Control

| Method | Endpoint              | Description          |
| ------ | --------------------- | -------------------- |
| `GET`  | `/api/camera/status`  | Get camera status    |
| `POST` | `/api/camera/capture` | Trigger capture      |
| `GET`  | `/api/camera/preview` | MJPEG preview stream |

#### Admin

| Method | Endpoint                    | Description          |
| ------ | --------------------------- | -------------------- |
| `POST` | `/api/admin/codes/generate` | Generate booth codes |
| `GET`  | `/api/admin/dashboard`      | Get analytics        |
| `GET`  | `/api/admin/transactions`   | Transaction history  |

### Real-Time Events (SSE)

- `GET /events/payment/:orderId` - Payment status updates
- `GET /events/camera` - Camera capture events

---

## Development

### Monorepo Commands

```bash
# Install all dependencies
pnpm install

# Build all packages
pnpm build

# Start all apps in development
pnpm dev

# Type checking
pnpm type-check

# Linting
pnpm lint

# Clean build artifacts
pnpm clean
```

### Working with Shared Packages

```bash
# Build specific package
pnpm --filter @photonic/types build
pnpm --filter @photonic/config build
pnpm --filter @photonic/utils build

# After updating types, rebuild
pnpm --filter @photonic/types build
```

### Database Operations

```bash
cd apps/backend

# Generate migration
pnpm db:generate

# Run migrations
pnpm db:migrate

# Seed with sample data
pnpm db:seed

# Open Drizzle Studio
pnpm db:studio
```

---

## Common Commands Reference

| Command                                         | Description                        |
| ----------------------------------------------- | ---------------------------------- |
| `pnpm dev`                                      | Start all apps in development mode |
| `pnpm --filter @photonic/backend dev`           | Start backend only                 |
| `pnpm --filter @photonic/frontend dev`          | Start frontend (browser)           |
| `pnpm --filter @photonic/frontend dev:electron` | Start frontend (Electron)          |
| `pnpm --filter @photonic/admin-web dev`         | Start admin-web                    |
| `pnpm build`                                    | Build all packages and apps        |
| `pnpm type-check`                               | Run TypeScript checks              |
| `pnpm lint`                                     | Run ESLint                         |

---

## Troubleshooting

### Backend Won't Start

```powershell
# Check if port is in use (PowerShell)
Get-Process -Id (Get-NetTCPConnection -LocalPort 4000).OwningProcess

# View error logs
cat apps/backend/logs/error.log

# Reset database (WARNING: data loss)
Remove-Item apps/backend/data/photobooth.db
pnpm --filter @photonic/backend db:migrate
```

### Camera Not Detected

```powershell
# Test camera status
Invoke-RestMethod http://localhost:4000/api/camera/status

# Enable mock mode for development
# Edit apps/backend/.env: MOCK_CAMERA=true
```

### Cannot Access from Network

```powershell
# Find your IP
ipconfig

# Check firewall rules
# Windows: Add inbound rules for ports 4000, 4001
```

### Database Locked

```powershell
# Windows - Stop service and restart
net stop PhotonicPhotobooth
net start PhotonicPhotobooth
```

---

## Production Deployment

### Windows Service Setup

```powershell
# Run as Administrator
Set-ExecutionPolicy Bypass -Scope Process -Force
.\scripts\setup-photobooth-windows.ps1

# Start service
net start PhotonicPhotobooth

# Check status
sc query PhotonicPhotobooth
```

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Set `MIDTRANS_ENVIRONMENT=production`
- [ ] Use real Midtrans API keys
- [ ] Configure real WhatsApp API key
- [ ] Test with actual Canon camera
- [ ] Test printer setup
- [ ] Configure firewall rules
- [ ] Set up automated backups
- [ ] Enable analytics sync (optional)

---

## Technology Stack

| Layer                | Technology           | Purpose                      |
| -------------------- | -------------------- | ---------------------------- |
| **Backend**          | Fastify              | HTTP API server              |
| **Database**         | SQLite + Drizzle ORM | Data persistence             |
| **Image Processing** | Sharp                | Photo editing & compositing  |
| **Camera (Windows)** | Canon EDSDK          | Canon DSLR control (Windows) |
| **Camera (Linux)**   | gphoto2              | Canon DSLR control (Linux)   |
| **Payment**          | Midtrans SDK         | QRIS payments                |
| **WhatsApp**         | Fonnte/Wablas API    | Photo delivery               |
| **Frontend**         | Electron + React     | Kiosk application            |
| **State Management** | Zustand              | Client-side state            |
| **Styling**          | TailwindCSS          | UI styling                   |
| **Build Tool**       | Vite                 | Development & bundling       |
| **Monorepo**         | pnpm + Turborepo     | Package management           |

---

## Contributing

1. Follow existing code patterns and conventions
2. Update `@photonic/types` first when adding new features
3. Use shared utilities from `@photonic/utils`
4. Run `pnpm type-check` before committing
5. Update documentation when completing features

---

## Support

For technical support, feature requests, or bug reports:

- **Operators**: See [QUICK-START.md](./scripts/QUICK-START.md)
- **Developers**: Check [SYSTEM-ARCHITECTURE.md](./scripts/SYSTEM-ARCHITECTURE.md)
- **Issues**: Contact your development team

---

## License

**Proprietary - All Rights Reserved**

This software is proprietary and confidential. Unauthorized copying, distribution, or use is strictly prohibited.

---

<div align="center">

**Built with modern technologies for reliable commercial deployment.**

[Back to Top](#photonic-photo-booth-system)

</div>
