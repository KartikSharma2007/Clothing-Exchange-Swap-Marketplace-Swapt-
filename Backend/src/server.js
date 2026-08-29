import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";

import { connectDB } from "./config/db.js";
import authRoutes from "./routes/auth.routes.js";
import listingRoutes from "./routes/listing.routes.js";
import reviewRoutes from "./routes/review.routes.js";
import meRoutes, { startSwapExpirySweeper } from "./routes/me.routes.js";
import { startScheduledPublishSweeper } from "./routes/listing.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import userRoutes from "./routes/user.routes.js";
import wishlistRoutes from "./routes/wishlist.routes.js";
import contactRoutes from "./routes/contact.routes.js";
import notificationsRoutes from "./routes/notifications.routes.js";
import assetsRoutes from "./routes/assets.routes.js";
import ogRoutes from "./routes/og.routes.js";
import paymentRoutes from "./routes/payment.routes.js";
import recommendationsRoutes from "./routes/recommendations.routes.js";
import devRoutes from "./routes/dev.routes.js";
import webpush from "web-push";
import { errorHandler, notFound } from "./middleware/error.js";
import { attachWebSocket } from "./ws.js";

// Web Push (VAPID): if keys are configured in .env, wire them up once so the
// push service can accept deliveries for every user's subscriptions.
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:swapt@example.com",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
}

const app = express();
app.set("trust proxy", 1);

// In production the refresh token only travels in a Secure cookie, which the
// browser refuses to send over plaintext HTTP. Fail fast on auth endpoints so a
// misconfigured deployment can't silently ship tokens in the clear.
if (process.env.NODE_ENV === "production") {
  app.use("/api/auth", (req, res, next) => {
    if (!req.secure) return res.status(403).json({ error: "HTTPS is required" });
    next();
  });
  if ((process.env.CLIENT_ORIGIN || "").startsWith("http://")) {
    console.warn("[api] WARNING: CLIENT_ORIGIN uses plain http:// — login cookies are marked Secure and will be dropped by the browser over HTTP. Serve the client over HTTPS in production.");
  }
}

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(
  cors({
    origin: (origin, cb) => {
      const allowed = (process.env.CLIENT_ORIGIN || "http://localhost:8080").split(",").map((o) => o.trim());
      // In dev, allow any localhost port so vite preview / alternate ports work
      if (!origin) return cb(null, true);
      if (allowed.includes(origin)) return cb(null, true);
      if (process.env.NODE_ENV !== "production" && /^http:\/\/localhost:\d+$/.test(origin)) return cb(null, true);
      if (process.env.NODE_ENV !== "production" && /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) return cb(null, true);
      // LAN: allow any private-network IP so mobile on same Wi-Fi can reach the API
      if (process.env.NODE_ENV !== "production" && /^http:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+):\d+$/.test(origin)) return cb(null, true);
      cb(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
  }),
);

// Capture the raw request body for the Stripe webhook (signature verification
// needs the exact bytes). This MUST run before express.json below — once the
// JSON body parser has consumed the stream the raw bytes are gone.
app.use("/api/payments/stripe-webhook", (req, _res, next) => {
  req.rawBody = "";
  let tooBig = false;
  req.on("data", (chunk) => {
    if (req.rawBody.length + chunk.length > 2_000_000) {
      tooBig = true;
      req.rawBody = "";
      return;
    }
    req.rawBody += chunk;
  });
  req.on("end", () => next());
  req.on("aborted", () => { tooBig = true; next(); });
});

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// Uploads (multipart, image-heavy) get their own limiter rather than being
// throttled by the general one — a listing with several photos is one request
// but large, so counting it against 300 req/min can bite legit multi-image posts.
const isUploadPath = (req) =>
  req.method === "POST" &&
  (req.path === "/api/auth/me/avatar" || req.path === "/api/listings" || req.path.includes("/evidence"));
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false,
  skip: (req) => req.method !== "POST",
});
app.use("/api/auth/me/avatar", uploadLimiter);
app.use("/api/listings", uploadLimiter);
app.use(
  rateLimit({
    windowMs: 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false,
    // Let the dedicated upload limiter own POSTs to upload endpoints.
    skip: (req) => isUploadPath(req),
  }),
);

app.get("/api/health", (_req, res) => res.json({ ok: true, uptime: process.uptime() }));
app.use("/api/auth", authRoutes);
app.use("/api/listings", listingRoutes);
app.use("/api", reviewRoutes);
app.use("/api/me", meRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/users", userRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api", contactRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api", assetsRoutes);
app.use("/api/payments", paymentRoutes);
  app.use("/api/recommendations", recommendationsRoutes);
app.use("/api", devRoutes);

// Server-rendered Open Graph pages (social link previews).
app.use("/og", ogRoutes);

app.use(notFound);
app.use(errorHandler);

const port = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || "0.0.0.0";

connectDB(process.env.MONGODB_URI)
  .then(() => {
    const server = app.listen(port, HOST, () => {
      console.log(`[api] listening on http://localhost:${port}`);
      console.log(`[api] LAN: http://${HOST === "0.0.0.0" ? "<LAN_IP>" : HOST}:${port} (use ipconfig to find IPv4)`);
    });
    server.on("error", (err) => {
      if (err?.code === "EADDRINUSE") {
        console.error(`[api] Port ${port} is already in use. Kill the existing process (Get-Process node | Stop-Process) or set PORT=4001 in .env and restart.`);
        process.exit(1);
      } else {
        console.error("[api] server error:", err);
      }
    });
    try {
      attachWebSocket(server);
      server.on("error", () => {}); // ws attaches its own handler; prevent unhandled 'error' on ws
    } catch (e) {
      console.error("[ws] failed to attach:", e.message);
    }
    // Auto-cancel pending swaps that sat unanswered past their deadline.
    startSwapExpirySweeper();
    // Auto-publish scheduled listings when their publishAt passes.
    startScheduledPublishSweeper();

    // Graceful shutdown on SIGINT/SIGTERM (prevents EADDRINUSE leftovers)
    const shut = () => {
      console.log("[api] shutting down...");
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 3000).unref();
    };
    process.on("SIGINT", shut);
    process.on("SIGTERM", shut);
  })
  .catch((err) => {
    console.error("[api] failed to start:", err.message);
    process.exit(1);
  });

// Prevent nodemon crash on unhandled rejections (e.g., transient Mongo/Cloudinary hiccups)
process.on("unhandledRejection", (reason) => {
  console.error("[api] unhandledRejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[api] uncaughtException:", err);
});