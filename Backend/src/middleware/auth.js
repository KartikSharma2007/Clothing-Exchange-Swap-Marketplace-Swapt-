import jwt from "jsonwebtoken";
import { User } from "../models/User.js";

export function signAccessToken(user) {
  return jwt.sign({ sub: String(user._id), username: user.username }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.ACCESS_TOKEN_TTL || "15m",
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
}

/** Requires a valid access token; attaches req.user. */
export async function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) throw Object.assign(new Error("Authentication required"), { status: 401 });

    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub);
    if (!user || user.deletedAt) throw Object.assign(new Error("Account no longer exists"), { status: 401 });
    if (user.status === "suspended") throw Object.assign(new Error("This account is suspended"), { status: 403 });

    req.user = user;

    // Debounced "last seen" heartbeat (max one write per user per 5 min) so
    // the admin console can show who's online now without hammering Mongo.
    if (user.status === "active" && (!user.lastActiveAt || Date.now() - user.lastActiveAt.getTime() > 5 * 60000)) {
      const now = new Date();
      void User.updateOne(
        { _id: user._id, $or: [{ lastActiveAt: null }, { lastActiveAt: { $lte: new Date(now.getTime() - 5 * 60000) } }] },
        { $set: { lastActiveAt: now } },
      ).catch(() => {});
    }

    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") err.status = 401;
    if (err.name === "JsonWebTokenError") err.status = 401;
    next(Object.assign(err, { status: err.status || 401 }));
  }
}

/** Attaches req.user when a valid token is present, but never blocks. */
export async function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return next();
  try {
    const payload = verifyAccessToken(header.slice(7));
    const user = await User.findById(payload.sub);
    if (user && !user.deletedAt) req.user = user;
  } catch {
    /* ignore invalid token on public routes */
  }
  next();
}

/** Requires an authenticated admin. Use after requireAuth. */
export function requireAdmin(req, _res, next) {
  if (req.user?.role !== "admin") {
    return next(Object.assign(new Error("Admin access required"), { status: 403 }));
  }
  next();
}
