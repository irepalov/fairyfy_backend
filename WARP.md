# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

Firebase backend for a fairy tale generation mobile app. Uses Firebase Cloud Functions (Node.js 20/TypeScript) to handle tale creation, AI-powered story generation via n8n webhook, and user management. Data stored in Firestore with strict user-ownership security rules.

## Development Commands

### Build & Deploy
```bash
# Build TypeScript
cd functions && npm run build

# Deploy all functions to production
firebase deploy --only functions

# Deploy specific function
firebase deploy --only functions:generateTaleContent

# View logs
firebase functions:log
```

### Local Development
```bash
# Start Firebase emulators (functions only)
cd functions && npm run serve

# Run local tests (requires emulator)
./test-local.sh

# Production API tests
./test-prod.sh
```

### Testing Individual Functions
```bash
# Test locally (emulator must be running on port 5001)
curl -X POST http://localhost:5001/fairytales-app/europe-west1/createFairyTale \
  -H "Content-Type: application/json" \
  -d '{"data": {...}}'

# Test production
curl -X POST https://europe-west1-fairytales-app.cloudfunctions.net/createFairyTale \
  -H "Authorization: Bearer YOUR_FIREBASE_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"data": {...}}'
```

## Architecture

### Core Components
- **functions/src/api/fairyTaleAPI.ts** - Main API endpoints for tale operations (CRUD + generation)
- **functions/src/api/userAPI.ts** - User profile management
- **functions/src/triggers/authTriggers.ts** - Auto-creates user profile on Firebase Auth signup
- **functions/src/types/models.ts** - TypeScript interfaces and enums

### Tale Generation Flow (Asynchronous)
1. **Client calls `generateTaleContent(taleId)`** → Function immediately returns `{status: "GENERATING"}`
2. **Backend updates Firestore** → `completionStatus` set to `GENERATING`
3. **Background task starts** → `generateAndSave()` sends POST to n8n webhook (timeout: 8 min)
4. **n8n processes request** → Returns array: `[{taleText: "..."}]`
5. **Backend updates Firestore** → `taleText` populated, status set to `COMPLETED` or `FAILED`
6. **Client listens to Firestore** → Receives real-time updates via `onSnapshot()`

**Critical:** Generation happens in background. Clients MUST use Firestore listeners, not wait for HTTP response.

### Data Models

**FairyTale Status Lifecycle:**
- `DRAFT` → Tale created, no text yet
- `GENERATING` → AI generation in progress (background task running)
- `COMPLETED` → Generation successful, `taleText` populated
- `FAILED` → Generation error, `taleText` remains empty

**Required Fields for Generation:**
- `components.hero.name` (string)
- `taleStyle.style` (string)

**Optional Components:**
- `friends[]`, `equipment[]`, `villains[]`, `places[]`

### API Endpoints

All endpoints are Firebase Callable Functions requiring authentication (`Authorization: Bearer <firebase-id-token>`).

**Tale Operations:**
- `createFairyTale` - Create new tale in DRAFT status
- `generateTaleContent` - Trigger async AI generation
- `getUserTales` - List user's tales (paginated, max 50/request)
- `updateFairyTale` - Update tale fields (partial updates supported)
- `deleteFairyTale` - Permanently delete tale

**User Operations:**
- `getUserProfile` - Get current user's profile
- `updateUserPreferences` - Update language/timezone/notifications

### Security Model

**Firestore Rules:**
- Users can only read/write their own documents (`userId` match)
- Tales enforce ownership via `resource.data.userId == request.auth.uid`
- User profile deletion disallowed (only create/update)

**Cloud Functions:**
- All endpoints validate `context.auth` presence
- Ownership checks performed before mutations
- Errors use standard Firebase error codes (`unauthenticated`, `permission-denied`, etc.)

## Configuration

- **Region:** `europe-west1` (all functions)
- **Runtime:** Node.js 20
- **Timeouts:** 
  - Default: 60s
  - `generateTaleContent`: 540s (9 min)
  - n8n webhook timeout: 480s (8 min)
- **n8n Webhook:** `https://n8n.fairyfy.xyz/webhook/ac502c37-56b8-4241-ba8a-7e82ee932cfb`

## Important Implementation Details

### n8n Integration
**Request format:**
```json
{
  "models": {
    "hero": {"name": "...", "type": "..."},
    "friends": [...],
    "equipment": [...],
    "villains": [...],
    "places": [...]
  },
  "taleStyle": {"style": "..."}
}
```

**Response handling:** n8n returns array `[{taleText: "..."}]`. Code checks `result[0].taleText` first, then falls back to `story`/`text`/`output` fields for compatibility.

### Known Issues & Fixes
- **Fixed (2026-01-04):** taleText extraction from n8n array response. Previously expected object, now handles both array and object formats.

## Reference Documentation

See `MEMORY_BANK.md` for detailed architectural decisions, full API specifications with examples, troubleshooting history, and mobile client integration patterns.

For Postman collection with working examples: `Fairytales-API.postman_collection.json`
