# Swapt Frontend

React + TypeScript + Vite + TanStack Router + TanStack Query — the client for a peer-to-peer clothing swap marketplace.

## Quick Start

### Prerequisites
- Node.js 20+
- Backend server running (see Backend setup below)

### Setup

```bash
cd Frontend
npm install
```

### Environment Variables

Create a `.env` file in the `Frontend/` directory with:

```env
# Backend API
VITE_API_URL=http://localhost:4000

# Google OAuth (from Google Cloud Console > APIs & Services > Credentials)
VITE_GOOGLE_CLIENT_ID=<your-client-id>

# Optional: toggle development features
VITE_ENABLE_ADMIN_CONSOLE=true
```

**Note**: `VITE_GOOGLE_CLIENT_ID` is shared with the backend via environment variable naming convention. The backend will read it as `GOOGLE_CLIENT_ID` if set.

### Development

```bash
npm run dev
```

Runs on `http://localhost:8080` (or available port). Hot module reload (HMR) enabled.

### Build

```bash
npm run build
```

Optimized production bundle in `dist/`.

### Project Structure

- **`src/routes/`** — Page components (TanStack Router file-based routing)
  - `admin_.*` — Admin dashboard pages (requires admin role)
  - `index.tsx` — Homepage
  - `browse.tsx` — Listing search (Near me, filters, compare)
  - `sell.tsx` / `edit-listing.$id.tsx` — Create / edit listings
  - `listing.$id.tsx` — Listing detail
  - `seller.$username.tsx` — Public seller profile (message or request a swap)
  - `messages.tsx` / `messages.$conversationId.tsx` — Chat inbox / plain-text thread
  - `swaps.$id.tsx` — Swap thread (negotiate, meetup, shipping, disputes)
  - `login.tsx` / `signup.tsx` / `forgot.tsx` / `check-email.tsx` / `verify-email.tsx` — Auth flows
  - `dashboard.tsx` — User's swaps, messages, listings
  - `settings.tsx` — Profile settings
  - `wallet.tsx` / `wallet.receipt.$id.tsx` — Credits, payments and receipts
  - `saved-searches.tsx` — Saved searches + alerts
  
- **`src/components/`** — Reusable UI components
  - `ui/` — Headless UI (buttons, modals, forms, etc.)
  - `site/` — App-specific components (NavBar, ProductCard, etc.)
  - `admin/` — Admin dashboard layouts and panels

- **`src/lib/`** — API clients and utilities
  - `api.ts` — Generic HTTP client with auth headers
  - `auth-api.ts` — Sign up, login, refresh token
  - `listings-api.ts` — Browse, create, update listings
  - `swap-api.ts` — Create/respond to swap requests
  - `admin-api.ts` — Admin dashboard endpoints (real backend)
  - `wishlist.tsx` — Bag/save items (persists to backend)
  - `notifications-api.ts` — Notifications and read status
  - `auth-context.tsx` — Global auth state (user, tokens, login/logout)

- **`src/hooks/`** — React hooks
  - `use-mobile.tsx` — Responsive design breakpoint detection

## Running Both Servers Together

### Terminal 1: Backend

```bash
cd Backend
npm install
npm run dev
```

Backend runs on `http://localhost:4000`.

### Terminal 2: Frontend

```bash
cd Frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:8080` (or available port).

Both servers must be running for the app to work. The frontend makes HTTP requests to `VITE_API_URL` (backend).

## Backend Environment

See `Backend/README.md` for backend setup, including:
- MongoDB Atlas connection string
- Cloudinary image storage keys
- Google OAuth credentials

## Key Features

- **Authentication**: Local (email+password, with email verification and password reset) and Google OAuth
- **Listings**: Browse, create, edit, delete clothing items with photos; Near-me search; AI-assisted creation
- **Swaps**: Request, counter, accept, decline, cancel and complete clothing swaps (shipping or local meetup)
- **Messaging**: Negotiate in swap threads **or** send a plain-text message to a member from their profile
- **Wishlist (Bag)**: Save items; persists for guests (localStorage) and logged-in users (backend)
- **Notifications**: In-app notifications with live WebSocket updates and web push; saved-search alerts
- **Admin Dashboard**:
  - Moderation queue for listings (hide, feature, delete) with pagination
  - User management (suspend/restore) with pagination
  - Analytics, audit logs and dispute/report review
  - Category management (enable/disable taxonomy entries)

## Architecture Decisions

### State Management
- **TanStack React Query** — server state (listings, swaps, user data) with caching and automatic refetch
- **React Context** — auth state (user, tokens, login status)
- **React Hook Form** — form state (signup, profile, listing creation)
- **localStorage** — guest bag, preferences, error tracking

### API Integration
- All requests go through `lib/api.ts` which handles:
  - JWT access token injection
  - Automatic refresh token rotation
  - Error handling and toast notifications
  - Fallback to localStorage if backend is unavailable (for wishlist, notifications)

### Routing
- TanStack Router with file-based routing (`src/routes/` directory)
- Route tree auto-generated in `routeTree.gen.ts`
- Protected routes wrapped in `<Protected>` component for auth-only pages

## Known Limitations / Future Work

- ❌ No automated tests (unit, integration, or E2E)
- ❌ No CI/CD pipeline (no GitHub Actions, etc.)

## Troubleshooting

### "Cannot find module" or "ENOENT"
Make sure you're in the correct directory:
```bash
cd Frontend
npm install
npm run dev
```

### "Connection refused" at http://localhost:4000
Backend server not running. Start it in another terminal:
```bash
cd Backend
npm run dev
```

### Google Sign-In button appears but doesn't work
Verify `VITE_GOOGLE_CLIENT_ID` is set in `.env` and matches your Google Cloud Console credentials.

### Build fails with "Command not found: vite"
Run `npm install` first.

---

**Last updated**: August 2026 | Swapt marketplace
