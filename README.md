<div align="center">

# 👕 Swapt

### A peer-to-peer clothing swap marketplace

Trade clothes directly with other people — list what you don't wear, discover what others are giving up, and swap. No cash required to make a trade (an optional credits/escrow system is built in for top-ups).

<p>
  <img alt="node" src="https://img.shields.io/badge/node-20%2B-339933?logo=node.js&logoColor=white">
  <img alt="react" src="https://img.shields.io/badge/react-19-149ECA?logo=react&logoColor=white">
  <img alt="typescript" src="https://img.shields.io/badge/typescript-5-3178C6?logo=typescript&logoColor=white">
  <img alt="vite" src="https://img.shields.io/badge/vite-8-646CFF?logo=vite&logoColor=white">
  <img alt="express" src="https://img.shields.io/badge/express-4-000000?logo=express&logoColor=white">
  <img alt="mongodb" src="https://img.shields.io/badge/mongodb-atlas-47A248?logo=mongodb&logoColor=white">
  <img alt="cloudinary" src="https://img.shields.io/badge/media-cloudinary-3448C5?logo=cloudinary&logoColor=white">
  <br/>
  <img alt="license" src="https://img.shields.io/badge/license-Unlicensed-lightgrey">
  <img alt="status" src="https://img.shields.io/badge/status-active--development-yellow">
  <img alt="PRs" src="https://img.shields.io/badge/PRs-welcome-brightgreen">
</p>

</div>

---

## 📖 Table of Contents

- [What is Swapt?](#-what-is-swapt)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [How It Works](#-how-it-works)
- [API Overview](#-api-overview)
- [Data Models](#-data-models)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [Running the Project](#-running-the-project)
- [Security](#-security)
- [Known Limitations](#-known-limitations--roadmap)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🧵 What is Swapt?

Swapt lets people swap clothes directly with each other instead of buying new or throwing things away. A member lists an item with photos and details, browses what others have posted, and proposes a swap. Negotiation, shipping/meetup logistics, messaging, and optional escrow all happen inside the app — from first message to completed trade.

It's a full-stack project: a React SPA talking to an Express + MongoDB API, with real-time messaging over WebSocket, media hosted on Cloudinary, and optional AI-assisted listing creation.

## ✨ Features

### 🔁 Listings & Swaps
- Full CRUD for clothing listings with multi-image upload (Cloudinary-backed, signed URLs)
- Search, filter, and sort by category, size, gender, condition, brand, and color
- Propose, counter, accept, decline, cancel, or complete a swap
- Shipping with carrier + tracking, **or** a local meetup with map embed
- Escrow: holds credits on accept, settles or refunds on completion/cancellation
- Disputes with evidence upload, resolved by moderators

### 🤖 Smart Features
- **AI-assisted listing creation** — upload a photo and get a suggested title, brand, category, color, condition, and size (OpenAI or Gemini vision models)
- **Smart swap matching** — surfaces mutual swaps where you have what they want and vice versa, with "It's a match!" notifications
- **Size & fit intelligence** — compares your saved body measurements against a listing's garment measurements to estimate fit

### 💬 Messaging & Notifications
- In-swap negotiation threads **and** a general plain-text inbox
- Live updates over WebSocket (typing indicators, live thread refresh)
- Browser push notifications (Web Push / VAPID)
- In-app notification center (likes, swap requests/accepts, messages, sold items, announcements, saved-search alerts)
- Block and mute other members

### 🔐 Accounts
- Email + password registration with email verification and password reset
- Google OAuth 2.0 sign-in
- JWT access tokens with rotating refresh tokens
- Saved measurements, saved searches with alerts, wishlist ("bag") that persists across guest → logged-in

### 🛠️ Admin Dashboard
- Moderation queue for listings (hide, restore, delete, feature) with search & pagination
- User management (suspend/restore) with search & pagination
- Category/taxonomy management with live counts
- Reports and disputes review + resolution
- Analytics dashboard (users, listings, swaps over time; top categories/cities)
- Full audit trail of every moderation action

## 🧱 Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 19, TypeScript, Vite, TanStack Router, TanStack Query, TanStack Start, Tailwind CSS v4, Radix UI, React Hook Form + Zod, Recharts, Leaflet |
| **Backend** | Node.js, Express 4, Mongoose (MongoDB Atlas), JWT (`jsonwebtoken`), `bcryptjs`, WebSocket (`ws`), `zod` validation |
| **Media & Storage** | Cloudinary (image upload, signed URLs) |
| **Messaging & Alerts** | Nodemailer (SMTP email), Twilio (SMS), Web Push (VAPID) |
| **AI** | OpenAI or Google Gemini (vision) for AI-assisted listing creation |
| **Auth** | Google OAuth 2.0 (`google-auth-library`), local email/password |
| **Security** | Helmet, `express-rate-limit`, CORS, magic-byte file validation |
| **Tooling** | ESLint, Prettier, Nodemon |

## 🗂️ Project Structure

```
Swapt/
├── Backend/                   Express API
│   └── src/
│       ├── config/            MongoDB + Cloudinary setup
│       ├── middleware/        auth, uploads, error handling
│       ├── models/            Mongoose schemas (User, Listing, Swap, Message, …)
│       ├── routes/            REST endpoints, grouped by domain
│       ├── scripts/           one-off scripts (seeding, email test)
│       ├── utils/             tokens, validators, matchmaking, AI, notify, escrow…
│       ├── ws.js              WebSocket server
│       └── server.js          app entrypoint
│
└── Frontend/                   React + Vite client
    └── src/
        ├── routes/            file-based pages (TanStack Router)
        ├── components/        ui/ (headless), site/ (app UI), admin/ (dashboard)
        ├── lib/                API clients, auth context, wishlist, i18n, realtime
        └── hooks/             shared React hooks
```

Each half also has its own deep-dive README:

- 📄 [`Backend/README.md`](./Backend/README.md) — every route, env var, model, and security detail
- 📄 [`Frontend/README.md`](./Frontend/README.md) — routes, component layout, state management, architecture decisions

## 🔄 How It Works

```
┌─────────────┐        HTTPS / JSON        ┌──────────────┐
│   Frontend  │ ─────────────────────────► │   Backend    │
│  React/Vite │ ◄───────────────────────── │ Express API  │
└─────────────┘        WebSocket (/ws)     └──────┬───────┘
                                                   │
                     ┌─────────────────────────────┼─────────────────────────┐
                     ▼                              ▼                         ▼
              ┌─────────────┐              ┌────────────────┐        ┌───────────────┐
              │  MongoDB    │              │   Cloudinary   │        │ Email / SMS /  │
              │   Atlas     │              │ (image storage)│        │  Push / AI     │
              └─────────────┘              └────────────────┘        └───────────────┘
```

1. A member signs up (local or Google) and receives JWT access + refresh tokens.
2. They create a listing — photos go to Cloudinary, metadata to MongoDB, optionally auto-filled by an AI vision model.
3. Another member browses, saves items, and proposes a swap.
4. The two negotiate inside a swap thread (counter-offers, meetup or shipping details), with live updates pushed over WebSocket and browser push.
5. On completion, escrowed credits settle and both listings are marked swapped.

## 🔌 API Overview

A representative slice — see [`Backend/README.md`](./Backend/README.md) for the complete route reference.

| Domain | Example Endpoints |
|---|---|
| **Auth** | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/google`, `POST /api/auth/refresh` |
| **Listings** | `GET /api/listings`, `POST /api/listings`, `PATCH /api/listings/:id`, `POST /api/listings/ai-suggest` |
| **Swaps** | `POST /api/me/swaps`, `PATCH /api/me/swaps/:id`, `POST /api/me/swaps/:id/counter`, `PATCH /api/me/swaps/:id/meetup` |
| **Messaging** | `GET/POST /api/me/conversations`, `GET/POST /api/me/swaps/:id/messages` |
| **Wishlist** | `GET/POST /api/wishlist`, `POST /api/wishlist/merge` |
| **Notifications** | `GET /api/notifications`, `POST /api/notifications/read-all` |
| **Admin** | `GET /api/admin/stats`, `PATCH /api/admin/listings/:id/status`, `GET /api/admin/analytics` |

All responses are JSON, with standard HTTP status codes (`200/201/400/401/403/404/409/500/503`).

## 🗃️ Data Models

| Model | Purpose |
|---|---|
| `User` | Local or Google-auth accounts; role (`user`/`admin`); status; soft delete |
| `Listing` | Clothing item — images, taxonomy, measurements, counters (`views`, `saves`), status |
| `Swap` | Negotiation thread between two users/items; status lifecycle; shipping or meetup |
| `Message` / `Conversation` | Swap-thread and general chat messages |
| `Wishlist` | Saved ("bagged") items per user |
| `Notification` | In-app notifications by kind |
| `Dispute` / `DisputeMessage` | Escalations on a swap, with evidence |
| `Report` | User-submitted reports for moderation |
| `AuditLog` | Trail of every admin/moderation action |
| `RefreshToken` | Refresh-token rotation & revocation |
| `Review` | Post-swap member reviews |

## 🚀 Getting Started

### Prerequisites
- Node.js 20+
- A MongoDB Atlas cluster and connection string
- A Cloudinary account (cloud name, API key, API secret)
- A Google Cloud OAuth 2.0 client ID
- (Optional) SMTP credentials, Twilio credentials, VAPID keys, OpenAI/Gemini API key

### Clone & Install

```bash
git clone https://github.com/<your-username>/Swapt.git
cd Swapt

cd Backend && npm install
cd ../Frontend && npm install
```

## 🔑 Environment Variables

**`Backend/.env`** (abridged — full list in [`Backend/README.md`](./Backend/README.md#environment-variables)):

```env
NODE_ENV=development
PORT=4000
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/<db>
CLOUDINARY_CLOUD_NAME=<name>
CLOUDINARY_API_KEY=<key>
CLOUDINARY_API_SECRET=<secret>
GOOGLE_CLIENT_ID=<client-id>
JWT_SECRET=<random-string>
REFRESH_TOKEN_SECRET=<random-string>
CLIENT_ORIGIN=http://localhost:8080,http://localhost:5173
SMTP_HOST=smtp.gmail.com
SMTP_USER=<email>
SMTP_PASS=<app-password>
```

**`Frontend/.env`**:

```env
VITE_API_URL=http://localhost:4000
VITE_GOOGLE_CLIENT_ID=<client-id>
```

## ▶️ Running the Project

```bash
# Terminal 1 — Backend (http://localhost:4000)
cd Backend
npm run dev

# Terminal 2 — Frontend (http://localhost:8080)
cd Frontend
npm run dev
```

The frontend calls the backend via `VITE_API_URL`. Both servers need to be running for the app to work end-to-end.

```bash
# Production
cd Backend && npm start
cd Frontend && npm run build && npm run preview
```

## 🔒 Security

- Passwords hashed with `bcryptjs` (12 rounds)
- JWT access tokens + rotating, revocable refresh tokens
- Helmet.js security headers (HSTS, CSP, etc.)
- Rate limiting: global (300 req/min/IP), auth (30 req/15min/IP), contact form (5 req/15min/IP)
- Uploaded images validated by magic bytes, not just file extension
- CORS locked to configured frontend origin(s)
- WebSocket connection caps per user and globally

## 🧭 Known Limitations & Roadmap

- ❌ No automated tests (unit, integration, or E2E) yet
- ❌ No CI/CD pipeline yet
- ⚠️ Soft delete filters `deletedAt: null` at query time rather than being fully optimized
- ⚠️ Demo credit top-up faucet is disabled unless `DEMO_TOPUPS=1` is explicitly set

Contributions toward tests, CI, and performance are especially welcome.

## 🩹 Troubleshooting

| Problem | Fix |
|---|---|
| `Cannot find module` / `ENOENT` | Make sure you're in `Backend/` or `Frontend/` before running `npm install` |
| MongoDB "connection refused" | Check `MONGODB_URI` and that your IP is whitelisted in Atlas |
| "Google sign-in isn't configured" | Set both `GOOGLE_CLIENT_ID` (backend) and `VITE_GOOGLE_CLIENT_ID` (frontend) |
| Images won't upload | Verify all three `CLOUDINARY_*` variables are set correctly |
| Port 4000 already in use | Change `PORT` in `Backend/.env` or free up the port |
| Frontend can't reach API | Confirm the backend is running and `VITE_API_URL` matches its address |

## 🤝 Contributing

Issues and pull requests are welcome. If you're adding a feature, please:

1. Fork the repo and create a feature branch
2. Keep backend and frontend changes in separate, focused commits where possible
3. Update the relevant README (`Backend/README.md` or `Frontend/README.md`) if behavior changes
4. Open a PR describing what changed and why

## 📄 License

No license has been set for this project yet — all rights reserved by default until one is added.

---

<div align="center">

Made with 🧶 for a more circular closet.

</div>