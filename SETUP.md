# Photonic V0.1 - Setup Guide

## Prerequisites

Before you begin, ensure you have the following installed:

1. **Node.js** (v18+)
   ```bash
   # Check version
   node --version
   ```

2. **pnpm** (v8+)
   ```bash
   # Install pnpm globally
   npm install -g pnpm@8

   # Or using corepack (Node.js 16.13+)
   corepack enable
   corepack prepare pnpm@8.14.0 --activate

   # Verify installation
   pnpm --version
   ```

3. **gphoto2** (for Canon camera support on Linux)
   ```bash
   # Arch Linux
   sudo pacman -S libgphoto2

   # Ubuntu/Debian
   sudo apt-get install gphoto2 libgphoto2-dev

   # macOS
   brew install gphoto2
   ```

## Installation Steps

### 1. Navigate to Project Directory
```bash
cd /home/qiu/photonic-v0.1
```

### 2. Install Dependencies
```bash
# Install all dependencies for monorepo
pnpm install
```

This will install dependencies for:
- Root workspace
- All shared packages (types, config, utils)
- Backend app
- Bridge service

### 3. Build Shared Packages
Shared packages must be built before running the apps:

```bash
# Build all shared packages
pnpm --filter @photonic/types build
pnpm --filter @photonic/config build
pnpm --filter @photonic/utils build
```

Or use Turborepo to build everything:

```bash
pnpm build
```

### 4. Set Up Environment Variables

**Backend** (`apps/backend/.env`):
```bash
cd apps/backend
cp .env.example .env

# Edit .env and add your credentials
nano .env
```

**Bridge** (`apps/bridge/.env`):
```bash
cd apps/bridge
cp .env.example .env

# For development without camera, set:
# MOCK_CAMERA=true
```

### 5. Initialize Database

```bash
cd apps/backend

# Generate migration files (first time only)
pnpm db:generate

# Run migrations
pnpm db:migrate

# Seed database with initial data
pnpm db:seed
```

This will:
- Create SQLite database at `apps/backend/data/photobooth.db`
- Create all tables
- Insert default settings
- Add sample packages (1, 3, 5 photos)
- Add photo filters

## Running the Application

### Development Mode

Run all services in separate terminals:

**Terminal 1 - Backend API (Port 4000)**:
```bash
cd apps/backend
pnpm dev
```

**Terminal 2 - Bridge Service (Port 5000)**:
```bash
cd apps/bridge
pnpm dev
```

**Terminal 3 - Frontend (Future)**:
```bash
cd apps/frontend
pnpm dev
```

### Verify Services Are Running

**Backend Health Check**:
```bash
curl http://localhost:4000/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-10T...",
  "environment": "development",
  "uptime": 5.123
}
```

**Bridge Health Check**:
```bash
curl http://localhost:5000/health
```

Expected response:
```json
{
  "status": "ok",
  "service": "bridge",
  "timestamp": "2024-01-10T...",
  "uptime": 3.456
}
```

**Camera Status**:
```bash
curl http://localhost:5000/camera/status
```

With mock camera enabled:
```json
{
  "connected": true,
  "model": "Canon EOS Mock Camera",
  "battery": 100,
  "storageAvailable": true,
  "settings": {
    "iso": "200",
    "shutterSpeed": "1/125",
    "aperture": "f/2.8",
    "whiteBalance": "auto",
    "imageFormat": "JPEG"
  }
}
```

## Troubleshooting

### pnpm not found
```bash
npm install -g pnpm@8
```

### gphoto2 not found
The bridge service will automatically run in mock mode if gphoto2 is not available. For development, this is fine. For production with a real camera, install gphoto2.

### Database locked error
Make sure only one instance of the backend is running. SQLite doesn't support multiple writers.

### Port already in use
```bash
# Find process using port 4000
lsof -i :4000

# Kill process
kill -9 <PID>
```

## Project Structure

```
photonic-v0.1/
├── packages/
│   ├── types/          # Shared TypeScript types
│   ├── config/         # Configuration constants
│   └── utils/          # Logger, validators, formatters
├── apps/
│   ├── backend/        # Fastify API + SQLite
│   ├── bridge/         # Camera control service
│   └── frontend/       # Electron + React (to be created)
├── package.json        # Root workspace config
├── pnpm-workspace.yaml # Workspace definition
├── turbo.json          # Turborepo config
└── README.md          # Project overview
```

## Next Steps

1. **✅ Monorepo structure** - Complete
2. **✅ Shared packages** - Complete
3. **✅ Backend API** - Complete
4. **✅ Bridge service** - Complete
5. **⏳ Frontend Electron app** - To be built
6. **⏳ Payment integration** - To be implemented
7. **⏳ Image processing** - To be implemented
8. **⏳ WhatsApp delivery** - To be implemented
9. **⏳ Print queue** - To be implemented
10. **⏳ Admin panel** - To be implemented

## Development Tips

### Hot Reload
All services use `tsx watch` for hot reload during development. Changes to source files will automatically restart the service.

### Type Safety
Shared types in `@photonic/types` ensure type safety across all services. After changing types, rebuild with:
```bash
pnpm --filter @photonic/types build
```

### Database Inspection
Use Drizzle Studio to inspect the database:
```bash
cd apps/backend
pnpm db:studio
```

### Logs
All services use Winston logger with colored console output. Logs are written to:
- `apps/backend/logs/error.log` (errors only)
- `apps/backend/logs/combined.log` (all logs)

### Mock Camera Mode
For development without a physical camera:
```bash
# In apps/bridge/.env
MOCK_CAMERA=true
```

## Production Deployment

See `docs/DEPLOYMENT.md` for production deployment instructions (to be created).

## Support

For issues or questions, refer to:
- Project README: `/home/qiu/photonic-v0.1/README.md`
- Implementation Plan: `/.claude/plans/sprightly-weaving-graham.md`
- API Documentation: `docs/API.md` (to be created)
