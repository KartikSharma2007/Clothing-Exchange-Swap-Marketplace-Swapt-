# Swapt Backend

Express.js + MongoDB Atlas + Cloudinary — the API server for the Swapt peer-to-peer clothing swap marketplace.

## Quick Start

### Prerequisites
- Node.js 20+
- MongoDB Atlas account with connection string
- Cloudinary account with API credentials
- Google Cloud Console project with OAuth 2.0 credentials

### Setup

```bash
cd Backend
npm install
```

### Environment Variables

Create a `.env` file in the `Backend/` directory:

```env
# Server
NODE_ENV=development
PORT=4000

# Database
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<database>?retryWrites=true&w=majority

# Cloudinary (image storage)
CLOUDINARY_CLOUD_NAME=<your-cloud-name>
CLOUDINARY_API_KEY=<your-api-key>
CLOUDINARY_API_SECRET=<your-api-secret>

# Google Sign-In (OAuth 2.0)
# Get from Google Cloud Console > APIs & Services > Credentials > OAuth 2.0 Client IDs
GOOGLE_CLIENT_ID=<your-client-id>
VITE_GOOGLE_CLIENT_ID=<your-client-id>  # Also set for frontend

# JWT
JWT_SECRET=<long-random-string>
REFRESH_TOKEN_SECRET=<long-random-string>

# AI-assisted listing (optional — pick one provider)
# OpenAI: set OPENAI_API_KEY
# OPENAI_API_KEY=sk-...
# OPENAI_MODEL=gpt-4o-mini
# Google Gemini: set GEMINI_API_KEY
# GEMINI_API_KEY=...
# GEMINI_MODEL=gemini-3.1-flash-lite

# Web push (VAPID) — required for browser push notifications. Generate with:
#   npx web-push generate-vapid-keys --json
VAPID_PUBLIC_KEY=<your-public-key>
VAPID_PRIVATE_KEY=<your-private-key>
VAPID_SUBJECT=mailto:you@example.com
# Also expose the PUBLIC key to the frontend (Frontend/.env):
# VITE_VAPID_PUBLIC_KEY=<same-public-key>

# CORS
CLIENT_ORIGIN=http://localhost:8080,http://localhost:5173

# Email (required for password reset + email verification)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<your-email>
SMTP_PASS=<app-password>
```

### Development

```bash
npm run dev
```

Starts server on `http://localhost:4000` with auto-reload (nodemon).

### Production

```bash
npm start
```

## Project Structure

### `/src/routes/`
- **`auth.routes.js`** — Sign up, login, password reset, email verification, account deletion
  - `POST /api/auth/register` — Email + password registration (triggers verification email)
  - `POST /api/auth/login` — Email + password login
  - `POST /api/auth/google` — Google OAuth sign-in
  - `POST /api/auth/refresh` — Rotate refresh token
  - `POST /api/auth/forgot` — Request a password-reset email
  - `POST /api/auth/reset` — Reset password with the emailed token
  - `GET /api/auth/verify-email` — Verify a new account via emailed token
  - `POST /api/auth/resend-verification` — Re-send the verification email
  - `POST /api/auth/password` — Change password (signed in)
  - `POST /api/auth/me/avatar` / `DELETE /api/auth/me/avatar` — Set / remove profile photo
  - `DELETE /api/auth/me` — Soft-delete account
  
- **`listing.routes.js`** — Browse and manage listings
  - `GET /api/listings` — Search, filter, sort, paginate
  - `GET /api/listings/facets` — Filter options (categories, sizes)
  - `GET /api/listings/:id` — Listing detail (no longer increments views)
  - `POST /api/listings/:id/view` — Count a view once per (listing, viewer); anonymous viewers are keyed by a hash of their IP
  - `POST /api/listings` — Create (requires auth, multipart/form-data with images)
  - `PATCH /api/listings/:id` — Update (owner only; supports adding/removing/reordering photos)
  - `PATCH /api/listings/:id/visibility` — Hide / unhide (owner only)
  - `DELETE /api/listings/:id` — Delete (owner only; blocked while a live swap references the item)
  - `POST /api/listings/ai-suggest` — AI-assisted creation: send a photo (multipart field `image`) and get back a suggested title, brand, category, color, condition and size (requires auth; needs `OPENAI_API_KEY` or `GEMINI_API_KEY`)
  - Listings include `likelyFit` + `fitDetails` when the signed-in viewer has saved measurements

- **`me.routes.js`** — User profile, swap management and messaging
  - `GET /api/me/profile` — Current user profile
  - `PATCH /api/me/profile` — Update profile
  - `GET /api/me/listings` — User's posted listings
  - `GET /api/me/swap-matches` — Suggested mutual swaps (you each want what the other has)
  - `GET /api/me/swaps` — All negotiation threads (cursor pagination)
  - `GET /api/me/swaps/:id` — Single swap detail
  - `POST /api/me/swaps` — Propose a swap (validates the offered listing is active and owned by you)
  - `PATCH /api/me/swaps/:id` — Change status (`pending` → `accepted` / `declined` / `cancelled` / `completed`); moving to `completed` settles escrow and consumes the swapped listings
  - `POST /api/me/swaps/:id/tracking` — Add a tracking number
  - `POST /api/me/swaps/:id/receipt` — Recipient confirms receipt (proof of delivery)
  - `POST /api/me/swaps/:id/counter` — Owner fires back a counter-offer
  - `PATCH /api/me/swaps/:id/meetup` — Schedule / edit a local meetup
  - `GET/POST /api/me/swaps/:id/disputes` + `POST /api/me/swaps/:id/disputes/:disputeId/evidence` — Open a dispute and attach evidence
  - `GET/POST /api/me/swaps/:id/messages` — Fetch transcript (cursor pagination) / send a message (text or image)
  - `POST /api/me/swaps/:id/messages/read` — Acknowledge a swap thread as read
  - `GET/POST /api/me/conversations` — Chat inbox / start a plain-text conversation (no swap required)
  - `GET/POST /api/me/conversations/:id/messages` — Thread transcript / reply in a conversation
  - `POST /api/me/conversations/:id/messages/read` — Acknowledge a conversation as read
  - `DELETE /api/me/conversations/:id` — Hide a thread from the inbox
  - `GET/POST/DELETE /api/me/blocks` + `GET/POST/DELETE /api/me/mutes` — Block / mute members
  - `POST /api/me/phone/verify` + `POST /api/me/phone/confirm` — Phone verification for shipping
  - `GET/PATCH/DELETE /api/me/saved-searches` — Saved searches + alerts
  - `POST/DELETE /api/me/push-subscriptions` — Web-push subscriptions for notifications

- **`admin.routes.js`** — Admin-only moderation and analytics
  - `GET /api/admin/stats` — Dashboard counters (total, active, hidden, featured, users, actions24h)
  - `GET /api/admin/overview` — Overview metrics (user/listing/swaps series, top categories, cities)
  - `GET /api/admin/listings` — Moderation queue with search/filter + page/limit pagination
  - `PATCH /api/admin/listings/:id/feature` — Toggle featured flag
  - `PATCH /api/admin/listings/:id/status` — Hide or restore listing
  - `DELETE /api/admin/listings/:id` — Permanent deletion (blocked while a live swap references the item)
  - `GET /api/admin/users` — Search and filter users by status + page/limit pagination
  - `PATCH /api/admin/users/:id/status` — Suspend or restore user
  - `GET/PATCH /api/admin/categories` — List taxonomy with live counts / toggle a category enabled
  - `GET /api/admin/reports` + `PATCH /api/admin/reports/:id/resolve` — Review and resolve user reports
  - `GET /api/admin/disputes` + `PATCH /api/admin/disputes/:id/resolve` — Review and resolve swap disputes
  - `GET /api/admin/audit` — Audit trail of moderation actions
  - `GET /api/admin/analytics` — Detailed analytics (charts, breakdowns)

- **`wishlist.routes.js`** — Bag (saved items) management
  - `GET /api/wishlist` — Fetch user's wishlist
  - `POST /api/wishlist` — Add item (increments listing.saves)
  - `DELETE /api/wishlist/:listingId` — Remove item
  - `DELETE /api/wishlist` — Clear entire wishlist
  - `POST /api/wishlist/merge` — Merge guest bag into account

- **`notifications.routes.js`** — In-app notifications
  - `GET /api/notifications` — Fetch user's notifications
  - `PATCH /api/notifications/:id/read` — Mark as read/unread
  - `POST /api/notifications/read-all` — Mark all as read

### `/src/models/`
- **`User.js`** — User accounts (local or Google provider)
- **`Listing.js`** — Clothing listings with images, metadata
- **`Swap.js`** — Swap negotiation threads
- **`Message.js`** — Messages within swaps
- **`Wishlist.js`** — Saved items per user
- **`Notification.js`** — In-app notifications
- **`AuditLog.js`** — Moderation action trail
- **`RefreshToken.js`** — Refresh token revocation tracking

### `/src/middleware/`
- **`auth.js`** — JWT verification, user extraction, role-based access
- **`error.js`** — Global error handler
- **`upload.js`** — Multipart form-data parsing for image uploads

### `/src/config/`
- **`db.js`** — MongoDB Atlas connection
- **`cloudinary.js`** — Image upload/storage integration

### `/src/utils/`
- **`tokens.js`** — JWT generation, refresh token rotation
- **`validators.js`** — Zod schemas for request validation

## Key Features

### Authentication
- Local registration with email + password (bcrypt hashing)
- Google OAuth 2.0 sign-in (accounts created on first login)
- JWT access tokens (short-lived) + refresh tokens (long-lived, rotated)
- Automatic token refresh on each request

### Listings
- Full CRUD for clothing items
- Search by title, brand, color
- Filtering by category, size, gender, condition
- Cloudinary image storage with signed URLs (expiring links)
- View counter incremented once per (listing, viewer) via `POST /api/listings/:id/view`
- Save counter incremented per wishlist add

### Swaps & Messaging
- Swap negotiation threads between users
- Private messaging within swaps **and** plain-text chats between members (no swap required, `/messages` inbox)
- Message read receipts
- Cursor-based pagination for message transcripts
- Local meetup scheduling with map embed and shipping/tracking support
- Escrow holds credits on accept and settles/refunds on completion or cancel
- Disputes with evidence upload, resolved by moderators
- Blocks and mutes (either side stops messaging; hidden conversations stay intact)

### Admin & Moderation
- Role-based access control (user / admin)
- Listing moderation (hide, restore, delete, feature)
- User account suspension/restoration
- Full audit trail of all moderation actions
- Analytics dashboard (stats, charts, user activity)

### Wishlist
- Guest bag stored in localStorage (frontend)
- Logged-in user bag persisted to MongoDB
- Automatic merge on signup (one-time)
- Increments/decrements listing.saves counter

### Notifications
- In-app notifications (kinds: like, swap_request, swap_accepted, message, sold, announcement, welcome, search_alert, swap_match)
- Read status tracking
- Fetched via REST, with live updates over WebSocket (`/ws`) — typing indicators are
  relayed in real time and a "data changed" frame tells clients to refetch a thread.
  Also pushes to browser subscribers via Web Push (VAPID).
- Notifications reference links (swap pages, listing pages, seller profiles, the new `/messages` inbox)

### AI-assisted listing creation
- `POST /api/listings/ai-suggest` runs an uploaded photo through a vision model
  (OpenAI or Gemini) and returns catalog-ready fields: title, brand, category,
  color, condition and size. Output is normalised against the app taxonomy so it
  always validates on submit.

### Smart swap matching
- `GET /api/me/swap-matches` suggests mutual swaps: you own a listing another
  member wants (saved or swap-requested) *and* you want one of theirs (saved,
  swap-requested, or matching a saved search). Suggestions only — nothing is
  auto-created.
- Saving a listing that completes a mutual match fires an "It's a match!"
  notification to both members (throttled to once per pair per day, skipped
  when a swap is already in progress).

### Size & fit intelligence
- Members save body measurements (`measurements`, `heightCm`, `usualSize`) via
  `PATCH /api/auth/me`.
- Listings already carry flat garment measurements. When the signed-in viewer
  has measurements, responses include `likelyFit` + a per-dimension `fitDetails`
  breakdown computed against the viewer's profile.

## Database Schema Highlights

### User
- Dual auth: `provider: "local"` (password) or `provider: "google"` (no password)
- Role: `"user"` or `"admin"`
- Status: `"active"` or `"suspended"`
- Soft delete: `deletedAt` field (account hidden, sign-in blocked)

### Listing
- Status: `"active"`, `"swapped"`, or `"hidden"`
- `featured` flag for promotion
- Images stored via Cloudinary (metadata in MongoDB, signed URLs on response)
- Counters: `views`, `saves`

### Swap
- Belongs to requester and owner (two users, one item each)
- Status: `"pending"`, `"accepted"`, `"declined"`, `"completed"`, `"cancelled"`
- Messages attached to a conversation (one per member pair), sorted by creation time
- Optional shipping (carrier + tracking + label URL) or a local meetup (place + time + map)

## Rate Limiting & Security

- Global rate limit: 300 requests/min per IP (configurable)
- Auth endpoints: 30 requests/15min per IP
- Public `/api/contact`: 5 requests/15min per IP (stops support-inbox spam)
- Listing view endpoint: 120 requests/min per IP (defence-in-depth on top of per-viewer dedupe)
- WebSocket: at most 5 open sockets per member (oldest closed beyond that) and a hard ceiling on total sockets
- Helmet.js for HTTP headers (HSTS, CSP, etc.)
- CORS configured to frontend origin
- All passwords hashed with bcryptjs (12 rounds)
- Refresh tokens stored and versioned for revocation
- Uploaded files validated by magic bytes (JPEG/PNG/WebP/AVIF), not just the filename

## Running with Frontend

### Terminal 1: Backend

```bash
cd Backend
npm install
npm run dev
```

### Terminal 2: Frontend

```bash
cd Frontend
npm install
npm run dev
```

Frontend connects to backend via `VITE_API_URL` environment variable.

## API Response Format

All responses are JSON:

### Success
```json
{
  "user": { ... },
  "listing": { ... },
  "items": [ ... ]
}
```

### Error
```json
{
  "error": "Human-readable error message"
}
```

HTTP status codes:
- `200` — Success
- `201` — Created
- `400` — Bad request (validation error)
- `401` — Unauthorized (missing/invalid token)
- `403` — Forbidden (not enough permissions)
- `404` — Not found
- `409` — Conflict (duplicate email/username)
- `500` — Server error
- `503` — Service unavailable (Google not configured)

## Known Limitations / Future Work

- ❌ No automated tests (unit, integration, or E2E)
- ❌ No CI/CD pipeline
- ⚠️ Soft delete could be optimized (currently filters `deletedAt: null` in queries)
- ⚠️ Demo top-up faucet is disabled unless `DEMO_TOPUPS=1` is explicitly set

## Troubleshooting

### "Cannot find module" error
Make sure you're in the Backend directory:
```bash
cd Backend
npm install
npm run dev
```

### "Connection refused" to MongoDB
Verify `MONGODB_URI` is correct and your IP is whitelisted in MongoDB Atlas.

### "Google sign-in isn't configured on the server"
Set both `GOOGLE_CLIENT_ID` and `VITE_GOOGLE_CLIENT_ID` in `.env`.

### Port 4000 already in use
Change `PORT` in `.env` or kill the process using the port.

### Images not uploading
Verify `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` in `.env`.

---

**Last updated**: August 2026 | Swapt marketplace
