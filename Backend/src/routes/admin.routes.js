import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { Listing, CATEGORIES } from "../models/Listing.js";
import { User } from "../models/User.js";
import { Swap } from "../models/Swap.js";
import { Report } from "../models/Report.js";
import { Dispute } from "../models/Dispute.js";
import { AuditLog, recordAudit } from "../models/AuditLog.js";
import { Conversation } from "../models/Conversation.js";
import { Message } from "../models/Message.js";
import { SiteConfig, getSiteConfig } from "../models/SiteConfig.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { destroyAsset, signedUrl, signEvidenceUrl } from "../config/cloudinary.js";
import { escrowRefund, escrowRelease, escrowForSwap } from "../utils/escrow.js";
import { consumeListings, releaseListings } from "./me.routes.js";
import { recomputeReliability } from "../utils/reliability.js";
import { notify } from "../utils/notify.js";
import { sendListingStatusEmail, sendUserStatusEmail } from "../utils/email.js";
import { DISPUTE_OUTCOMES } from "../models/Dispute.js";
import { toCsv } from "../utils/csv.js";
import { Payment } from "../models/Payment.js";

const router = Router();

// Every route below requires a signed-in admin.
router.use(requireAuth, requireAdmin);

const reasonSchema = z.object({ reason: z.string().trim().max(300).optional().default("") });

const moderationQuerySchema = z.object({
  q: z.string().trim().max(120).optional().default(""),
  status: z.enum(["all", "active", "hidden", "swapped", "featured"]).optional().default("all"),
  page: z.coerce.number().int().min(1).max(1000).optional().default(1),
  limit: z.coerce.number().int().min(1).max(60).optional().default(24),
});

function serializeForAdmin(doc) {
  return {
    id: String(doc._id),
    title: doc.title,
    brand: doc.brand,
    category: doc.category,
    size: doc.size,
    condition: doc.condition,
    value: doc.value,
    status: doc.status,
    featured: Boolean(doc.featured),
    images: doc.images.map((img) => signedUrl(img.publicId)),
    seller: doc.seller?.username
      ? { id: String(doc.seller._id), username: doc.seller.username, name: doc.seller.displayName || doc.seller.username }
      : { id: String(doc.seller), username: "", name: "Swapt member" },
    createdAt: doc.createdAt,
  };
}

/** GET /api/admin/stats — moderation dashboard counters. */
router.get("/stats", async (_req, res, next) => {
  try {
    const [total, active, hidden, featured, users, actions24h, openReports, mutedCount, openDisputes] = await Promise.all([
      Listing.countDocuments({}),
      Listing.countDocuments({ status: "active" }),
      Listing.countDocuments({ status: "hidden" }),
      Listing.countDocuments({ featured: true }),
      User.countDocuments({}),
      AuditLog.countDocuments({ createdAt: { $gte: new Date(Date.now() - 86400000) } }),
      Report.countDocuments({ status: "open" }),
      User.countDocuments({ mutedUsers: { $exists: true, $ne: [] } }),
      Dispute.countDocuments({ status: "open" }),
    ]);
    res.json({ total, active, hidden, featured, users, actions24h, openReports, mutedCount, openDisputes });
  } catch (err) { next(err); }
});

/** GET /api/admin/overview?days=30 — live dashboard counters (no fake numbers). */
router.get("/overview", async (req, res, next) => {
  try {
    const { days } = z.object({ days: z.coerce.number().int().min(7).max(90).optional().default(30) }).parse(req.query);
    const since = new Date(Date.now() - days * 86400000);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const onlineWindow = new Date(Date.now() - 15 * 60000);
    const dayKey = { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } };

    const [
      totalUsers, activeUsers, newUsersToday, onlineUsers,
      totalListings, activeListings, swappedListings, hiddenListings,
      swapsCompleted, swapsPending, orders,
      revenue, openReports, openDisputes, activeChats,
      listingsByDay, signupsByDay, swapsByDay, visitorsByDay,
      mostViewed, categories, topCities, swapStatus,
    ] = await Promise.all([
      User.countDocuments({ deletedAt: null }),
      User.countDocuments({ status: "active", deletedAt: null }),
      User.countDocuments({ createdAt: { $gte: startOfToday }, deletedAt: null }),
      User.countDocuments({ status: "active", lastActiveAt: { $gte: onlineWindow }, deletedAt: null }),
      Listing.countDocuments({}),
      Listing.countDocuments({ status: "active" }),
      Listing.countDocuments({ status: "swapped" }),
      Listing.countDocuments({ status: "hidden" }),
      Swap.countDocuments({ status: "completed" }),
      Swap.countDocuments({ status: "pending" }),
      Swap.countDocuments({ status: { $in: ["accepted", "completed"] } }),
      // Real revenue = credits actually paid out to owners (escrow released on
      // completion). Top-ups aren't revenue until they move through a swap.
      Payment.aggregate([
        { $match: { type: "escrow_release", status: "completed" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Report.countDocuments({ status: "open" }),
      Dispute.countDocuments({ status: "open" }),
      Conversation.countDocuments({ lastMessageAt: { $gte: new Date(Date.now() - 86400000) } }),
      Listing.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: dayKey, count: { $sum: 1 } } }]),
      User.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: dayKey, count: { $sum: 1 } } }]),
      Swap.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: dayKey, count: { $sum: 1 } } }]),
      (async () => {
        // Distinct members active per day = honest "visitors" proxy (there is
        // no analytics SDK), across swaps, listings and chat messages.
        const [swapActors, listingSellers, messageSenders] = await Promise.all([
          Swap.aggregate([{ $match: { createdAt: { $gte: since } } }, { $project: { u: ["$requester", "$owner"] } }, { $unwind: "$u" }, { $group: { _id: dayKey, ids: { $addToSet: "$u" } } }]),
          Listing.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: dayKey, ids: { $addToSet: "$seller" } } }]),
          Message.aggregate([{ $match: { createdAt: { $gte: since }, sender: { $ne: null } } }, { $group: { _id: dayKey, ids: { $addToSet: "$sender" } } }]),
        ]);
        const perDay = new Map();
        for (const rows of [swapActors, listingSellers, messageSenders]) {
          for (const r of rows) {
            const day = String(r._id);
            const ids = (r.ids ?? []).map(String);
            if (!perDay.has(day)) perDay.set(day, new Set());
            for (const id of ids) perDay.get(day).add(id);
          }
        }
        return perDay;
      })(),
      Listing.find({ status: "active" }).sort({ views: -1 }).limit(8).select("title views").lean(),
      Listing.aggregate([{ $match: { status: "active" } }, { $group: { _id: "$category", count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 6 }]),
      User.aggregate([{ $match: { status: "active", location: { $nin: ["", null] }, deletedAt: null } }, { $group: { _id: "$location", count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 6 }]),
      Swap.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    ]);

    const index = (rows) => Object.fromEntries(rows.map((r) => [r._id, r]));
    const listingsIdx = index(listingsByDay);
    const signupsIdx = index(signupsByDay);
    const swapsIdx = index(swapsByDay);

    const series = Array.from({ length: days }, (_, i) => {
      const d = new Date(since.getTime() + i * 86400000).toISOString().slice(0, 10);
      return {
        date: d,
        users: signupsIdx[d]?.count ?? 0,
        products: listingsIdx[d]?.count ?? 0,
        visitors: visitorsByDay.get(d)?.size ?? 0,
        swaps: swapsIdx[d]?.count ?? 0,
      };
    });

    res.json({
      totalUsers, activeUsers, newUsersToday, onlineUsers,
      totalListings, activeListings, swappedListings, hiddenListings,
      swapsCompleted, swapsPending, orders,
      revenue: revenue[0]?.total ?? 0,
      openReports, openDisputes, activeChats,
      series,
      mostViewed: mostViewed.map((l) => ({ title: l.title, views: l.views ?? 0 })),
      topCategories: categories.map((c) => ({ category: c._id, count: c.count })),
      topCities: topCities.map((c) => ({ city: c._id, count: c.count })),
      swapMix: swapStatus.map((s) => ({ status: s._id, count: s.count })),
    });
  } catch (err) { next(err); }
});

/** GET /api/admin/listings — every listing, including hidden ones. */
router.get("/listings", async (req, res, next) => {
  try {
    const { q, status, page, limit } = moderationQuerySchema.parse(req.query);
    const filter = {};
    if (status === "featured") filter.featured = true;
    else if (status !== "all") filter.status = status;
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ title: rx }, { brand: rx }, { color: rx }];
    }

    const [items, total] = await Promise.all([
      Listing.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("seller", "username displayName"),
      Listing.countDocuments(filter),
    ]);

    res.json({ items: items.map(serializeForAdmin), total, page, limit, pages: Math.ceil(total / limit) || 1 });
  } catch (err) { next(err); }
});

/** GET /api/admin/listings/export.csv — unbounded CSV dump of the catalogue. */
router.get("/listings/export.csv", async (req, res, next) => {
  try {
    const items = await Listing.find({}).sort({ createdAt: -1 }).limit(10000).populate("seller", "username displayName");
    const rows = items.map((l) => [
      String(l._id), l.title, l.brand, l.description, l.category, l.gender, l.size, l.condition,
      l.color, l.value, l.location, l.meetup ? "true" : "false", l.retailValue ?? "",
      l.material, l.style, l.season, (l.tags ?? []).join(","), l.status,
      l.featured ? "true" : "false", l.views ?? 0, l.saves ?? 0,
      l.seller?.username ?? "", l.seller?.displayName ?? "",
      l.createdAt ? new Date(l.createdAt).toISOString() : "",
    ]);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="swapt-all-listings.csv"`);
    res.send(toCsv(["id", "title", "brand", "description", "category", "gender", "size", "condition", "color", "value", "location", "meetup", "retailValue", "material", "style", "season", "tags", "status", "featured", "views", "saves", "sellerUsername", "sellerName", "createdAt"], rows));
  } catch (err) { next(err); }
});

async function loadListing(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(404).json({ error: "Listing not found" });
    return null;
  }
  const listing = await Listing.findById(req.params.id).populate("seller", "username displayName");
  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return null;
  }
  return listing;
}

/** PATCH /api/admin/listings/:id/feature — toggle the featured flag. */
router.patch("/listings/:id/feature", async (req, res, next) => {
  try {
    const listing = await loadListing(req, res);
    if (!listing) return;
    const { reason } = reasonSchema.parse(req.body ?? {});
    const featured = typeof req.body?.featured === "boolean" ? req.body.featured : !listing.featured;
    if (listing.status === "hidden" && featured) {
      return res.status(400).json({ error: "Can't feature a hidden listing — restore it first." });
    }

    listing.featured = featured;
    listing.featuredAt = featured ? new Date() : null;
    await listing.save();

    await recordAudit(req, {
      action: featured ? "listing.feature" : "listing.unfeature",
      targetType: "listing",
      targetId: String(listing._id),
      targetLabel: listing.title,
      reason,
    });
    if (featured) {
      try { const seller = await User.findById(listing.seller._id ?? listing.seller).select("email accent"); if (seller?.email) void sendListingStatusEmail(seller.email, { title: listing.title, status: "featured", accent: seller.accent || "red" }).catch(()=>{}); } catch {}
    }

    res.json({ listing: serializeForAdmin(listing) });
  } catch (err) { next(err); }
});

/** PATCH /api/admin/listings/:id/status — hide or restore a listing. */
router.patch("/listings/:id/status", async (req, res, next) => {
  try {
    const listing = await loadListing(req, res);
    if (!listing) return;
    const { status, reason } = z
      .object({ status: z.enum(["active", "hidden", "swapped"]), reason: z.string().trim().max(300).optional().default("") })
      .parse(req.body ?? {});

    const previous = listing.status;
    listing.status = status;
    if (status === "hidden") listing.featured = false;
    await listing.save();

    await recordAudit(req, {
      action: status === "hidden" ? "listing.hide" : "listing.restore",
      targetType: "listing",
      targetId: String(listing._id),
      targetLabel: listing.title,
      reason,
      metadata: { from: previous, to: status },
    });
    if (status === "hidden") {
      try { const seller = await User.findById(listing.seller._id ?? listing.seller).select("email accent"); if (seller?.email) void sendListingStatusEmail(seller.email, { title: listing.title, status: "hidden", accent: seller.accent || "red" }).catch(()=>{}); } catch {}
    }

    res.json({ listing: serializeForAdmin(listing) });
  } catch (err) { next(err); }
});

/** DELETE /api/admin/listings/:id — permanent removal + Cloudinary cleanup. */
router.delete("/listings/:id", async (req, res, next) => {
  try {
    const listing = await loadListing(req, res);
    if (!listing) return;
    const { reason } = reasonSchema.parse(req.body ?? {});

    // Same guard as the owner delete path: removing a listing mid-swap strands
    // the counterparty with a ghost thread and locked escrow.
    const liveSwap = await Swap.exists({
      status: { $in: ["pending", "accepted"] },
      $or: [{ requestedListing: listing._id }, { offeredListing: listing._id }],
    });
    if (liveSwap) {
      return res.status(409).json({
        error: "This listing is part of an active swap. Resolve or cancel that swap before deleting it.",
      });
    }

    await Promise.allSettled(listing.images.map((i) => destroyAsset(i.publicId)));
    await listing.deleteOne();

    await recordAudit(req, {
      action: "listing.delete",
      targetType: "listing",
      targetId: String(listing._id),
      targetLabel: listing.title,
      reason,
      metadata: { seller: listing.seller?.username ?? String(listing.seller) },
    });

    res.json({ ok: true });
  } catch (err) { next(err); }
});

/** PATCH /api/admin/users/:id/status — suspend or restore a member. */
router.patch("/users/:id/status", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "User not found" });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (String(user._id) === String(req.user._id)) return res.status(400).json({ error: "You can't moderate yourself" });
    if (user.role === "admin") return res.status(403).json({ error: "Can't moderate another admin" });

    const { status, reason } = z
      .object({ status: z.enum(["active", "suspended"]), reason: z.string().trim().max(300).optional().default("") })
      .parse(req.body ?? {});

    user.status = status;
    await user.save();

    await recordAudit(req, {
      action: status === "suspended" ? "user.suspend" : "user.restore",
      targetType: "user",
      targetId: String(user._id),
      targetLabel: user.username,
      reason,
    });
    if (user.email) void sendUserStatusEmail(user.email, { status, accent: user.accent || "red" }).catch(()=>{});

    res.json({ user: user.toPublicJSON() });
  } catch (err) { next(err); }
});

/** GET /api/admin/users — search and filter members by status. */
router.get("/users", async (req, res, next) => {
  try {
    const { q, status, page, limit } = z
      .object({
        q: z.string().trim().max(120).optional().default(""),
        status: z.enum(["all", "active", "suspended"]).optional().default("all"),
        page: z.coerce.number().int().min(1).max(1000).optional().default(1),
        limit: z.coerce.number().int().min(1).max(100).optional().default(25),
      })
      .parse(req.query);

    const filter = {};
    if (status !== "all") filter.status = status;
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [
        { username: rx },
        { displayName: rx },
        { email: rx },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select("id username displayName email status createdAt avatar")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      User.countDocuments(filter),
    ]);

    res.json({
      users: users.map((u) => ({
        id: String(u._id),
        name: u.displayName || u.username,
        username: u.username,
        email: u.email,
        status: u.status,
        createdAt: u.createdAt,
        avatarUrl: u.avatar?.publicId ? signedUrl(u.avatar.publicId) : (u.avatar?.url ?? null),
      })),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit) || 1,
    });
  } catch (err) { next(err); }
});

/** GET /api/admin/users/:id — full account information for administrators. */
router.get("/users/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "User not found" });
    const user = await User.findOne({ _id: req.params.id, deletedAt: null }).select("username displayName email status createdAt avatar provider age address phone shippingProfile shippingAddresses");
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({
      user: {
        id: String(user._id), name: user.displayName || user.username, username: user.username, email: user.email,
        status: user.status, createdAt: user.createdAt,
        avatarUrl: user.avatar?.publicId ? signedUrl(user.avatar.publicId) : user.avatar?.url ?? null,
        provider: user.provider || "local", age: user.age ?? null, address: user.address || "", phone: user.phone || "",
        shippingProfile: user.shippingProfile ?? {},
        shippingAddresses: (user.shippingAddresses ?? []).map((a) => ({
          id: String(a._id), label: a.label ?? "", name: a.name ?? "", line1: a.line1 ?? "", line2: a.line2 ?? "",
          city: a.city ?? "", postal: a.postal ?? "", country: a.country ?? "", phone: a.phone ?? "", isDefault: Boolean(a.isDefault),
        })),
      },
    });
  } catch (err) { next(err); }
});

// ---- Proactive moderation queue (auto-flagged listings) ----

/** GET /api/admin/moderation/queue — listings flagged by proactive scan. */
router.get("/moderation/queue", async (req, res, next) => {
  try {
    const { page, limit } = z.object({
      page: z.coerce.number().int().min(1).max(1000).optional().default(1),
      limit: z.coerce.number().int().min(1).max(60).optional().default(20),
    }).parse(req.query);
    const filter = { moderationStatus: "flagged" };
    const [items, total] = await Promise.all([
      Listing.find(filter).sort({ flaggedAt: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate("seller", "username displayName"),
      Listing.countDocuments(filter),
    ]);
    res.json({
      items: items.map((l) => ({
        id: String(l._id),
        title: l.title || "(untitled)",
        brand: l.brand,
        description: (l.description || "").slice(0, 200),
        category: l.category,
        size: l.size,
        condition: l.condition,
        value: l.value,
        images: l.images.map((i) => signedUrl(i.publicId)),
        status: l.status,
        publishAt: l.publishAt ? l.publishAt.toISOString() : null,
        moderationStatus: l.moderationStatus,
        moderationReason: l.moderationReason,
        moderationScore: l.moderationScore,
        flaggedAt: l.flaggedAt ? l.flaggedAt.toISOString() : null,
        seller: l.seller ? { username: l.seller.username, name: l.seller.displayName || l.seller.username } : null,
        createdAt: l.createdAt,
      })),
      total, page, limit, pages: Math.ceil(total / limit) || 1,
    });
  } catch (err) { next(err); }
});

/** PATCH /api/admin/moderation/:id/review — approve or reject a flagged listing. */
router.patch("/moderation/:id/review", async (req, res, next) => {
  try {
    const listing = await loadListing(req, res);
    if (!listing) return;
    const { action, note } = z.object({
      action: z.enum(["approve", "reject", "hide"]),
      note: z.string().trim().max(300).optional().default(""),
    }).parse(req.body ?? {});
    if (listing.moderationStatus !== "flagged" && listing.moderationStatus !== "pending") {
      return res.status(400).json({ error: `Listing is ${listing.moderationStatus}, not flagged` });
    }
    if (action === "approve") {
      listing.moderationStatus = "approved";
      listing.moderationReason = "";
      // If it was a scheduled flagged item whose time already passed, publish immediately
      if (listing.status === "scheduled" && listing.publishAt && new Date(listing.publishAt).getTime() <= Date.now()) {
        if (listing.images?.length) {
          listing.status = "active";
          listing.publishAt = null;
        }
      }
      await listing.save();
      if (listing.status === "active") void notify(listing.seller, { kind: "message", title: "Listing approved", body: `Your listing “${listing.title}” was approved and is now live.`, href: `/listing/${listing._id}`, actor: null }).catch(()=>{});
      await recordAudit(req, { action: "listing.moderation_approve", targetType: "listing", targetId: String(listing._id), targetLabel: listing.title, reason: note || "Approved via moderation queue" });
    } else if (action === "reject") {
      listing.moderationStatus = "rejected";
      listing.status = "hidden"; // hide it
      listing.featured = false;
      await listing.save();
      await recordAudit(req, { action: "listing.moderation_reject", targetType: "listing", targetId: String(listing._id), targetLabel: listing.title, reason: note || "Rejected via moderation queue" });
    } else if (action === "hide") {
      listing.moderationStatus = "rejected";
      listing.status = "hidden";
      listing.featured = false;
      await listing.save();
      await recordAudit(req, { action: "listing.moderation_hide", targetType: "listing", targetId: String(listing._id), targetLabel: listing.title, reason: note });
    }
    res.json({ ok: true, listing: { id: String(listing._id), title: listing.title, moderationStatus: listing.moderationStatus, status: listing.status } });
  } catch (err) { next(err); }
});

// ---- Category management ----

/** GET /api/admin/categories — the taxonomy with live listing counts + enabled state. */
router.get("/categories", async (req, res, next) => {
  try {
    const [counts, config] = await Promise.all([
      Listing.aggregate([{ $match: { status: "active" } }, { $group: { _id: "$category", count: { $sum: 1 } } }]),
      getSiteConfig(),
    ]);
    const countMap = new Map(counts.map((c) => [c._id, c.count]));
    const disabled = new Set(config?.disabledCategories ?? []);
    res.json({
      items: CATEGORIES.map((name, i) => ({
        slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        name,
        enabled: !disabled.has(name),
        listings: countMap.get(name) ?? 0,
        order: i,
      })),
    });
  } catch (err) { next(err); }
});

/** PATCH /api/admin/categories/:slug — enable/disable a category marketplace-wide. */
router.patch("/categories/:slug", async (req, res, next) => {
  try {
    const name = CATEGORIES.find((c) => c.toLowerCase().replace(/[^a-z0-9]+/g, "-") === String(req.params.slug).toLowerCase());
    if (!name) return res.status(404).json({ error: "Category not found" });
    const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body ?? {});

    const config = await getSiteConfig();
    const disabled = new Set(config?.disabledCategories ?? []);
    if (enabled) disabled.delete(name);
    else disabled.add(name);
    await SiteConfig.updateOne({ key: "global" }, { $set: { disabledCategories: [...disabled] } });

    await recordAudit(req, {
      action: enabled ? "category.enable" : "category.disable",
      targetType: "listing",
      targetId: `category:${name}`,
      targetLabel: name,
      reason: enabled ? "Re-enabled for browsing" : "Hidden from browsing",
      metadata: { slug: String(req.params.slug) },
    });

    res.json({ ok: true, slug: String(req.params.slug), enabled, name });
  } catch (err) { next(err); }
});

// ---- Moderation queue (user + listing reports) ----

async function serializeReport(r) {
  let target = null;
  if (r.targetType === "listing" && r.target) {
    const l = await Listing.findById(r.target).populate("seller", "username displayName");
    target = l ? { id: String(l._id), title: l.title, status: l.status, seller: l.seller?.username ?? "member" } : null;
  } else if (r.targetType === "user" && r.target) {
    const u = await User.findById(r.target);
    target = u ? { id: String(u._id), username: u.username, name: u.displayName || u.username, status: u.status } : null;
  }
  return {
    id: String(r._id),
    targetType: r.targetType,
    reason: r.reason,
    details: r.details,
    status: r.status,
    reporter: r.reporter?.username ?? "member",
    target,
    resolvedBy: r.resolvedBy?.username ?? null,
    resolutionNote: r.resolutionNote,
    createdAt: r.createdAt,
  };
}

/** GET /api/admin/reports — the moderation queue. */
router.get("/reports", async (req, res, next) => {
  try {
    const { status, type, page, limit } = z
      .object({
        status: z.enum(["open", "resolved", "all"]).optional().default("open"),
        type: z.enum(["listing", "user", "all"]).optional().default("all"),
        page: z.coerce.number().int().min(1).max(1000).optional().default(1),
        limit: z.coerce.number().int().min(1).max(50).optional().default(20),
      })
      .parse(req.query);

    const filter = {};
    if (status !== "all") filter.status = status;
    if (type !== "all") filter.targetType = type;

    const [reports, total] = await Promise.all([
      Report.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("reporter", "username")
        .populate("resolvedBy", "username"),
      Report.countDocuments(filter),
    ]);

    const items = await Promise.all(reports.map(serializeReport));
    res.json({ items, total, page, limit, pages: Math.ceil(total / limit) || 1 });
  } catch (err) { next(err); }
});

/** PATCH /api/admin/reports/:id/resolve — close a report, optionally acting on it. */
router.patch("/reports/:id/resolve", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Report not found" });
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ error: "Report not found" });

    const { note, action } = z
      .object({
        note: z.string().trim().max(300).optional().default(""),
        action: z.enum(["none", "hide_listing", "delete_listing", "suspend_user"]).optional().default("none"),
      })
      .parse(req.body ?? {});

    report.status = "resolved";
    report.resolvedBy = req.user._id;
    report.resolvedAt = new Date();
    report.resolutionNote = note;
    await report.save();

    // Optionally take moderation action against the target.
    let actionTaken = null;
    let actionLabel = null;
    if (action === "hide_listing" && report.targetType === "listing") {
      const listing = await Listing.findById(report.target);
      if (listing) {
        listing.status = "hidden"; listing.featured = false; await listing.save();
        actionTaken = "listing.hide"; actionLabel = listing.title;
        await notify(listing.seller, {
          kind: "message",
          title: "Your listing was hidden",
          body: `“${listing.title}” was hidden after a community report. Contact support if you believe this was a mistake.`,
          href: "/help",
          actor: null,
        });
      }
    } else if (action === "delete_listing" && report.targetType === "listing") {
      const listing = await Listing.findById(report.target);
      if (listing) {
        const title = listing.title;
        const sellerId = listing.seller;
        await Promise.allSettled(listing.images.map((i) => destroyAsset(i.publicId)));
        await listing.deleteOne();
        actionTaken = "listing.delete"; actionLabel = title;
        await notify(sellerId, {
          kind: "message",
          title: "Your listing was removed",
          body: `“${title}” was removed after a community report. Contact support if you believe this was a mistake.`,
          href: "/help",
          actor: null,
        });
      }
    } else if (action === "suspend_user") {
      // A listing report still means "deal with the seller" — resolve the
      // listing's owner so suspending actually suspends a person, never a no-op.
      let targetUser = null;
      if (report.targetType === "user") {
        targetUser = await User.findById(report.target);
      } else if (report.targetType === "listing" && report.target) {
        const listing = await Listing.findById(report.target).select("seller");
        if (listing) targetUser = await User.findById(listing.seller);
      }
      if (targetUser && targetUser.role !== "admin" && String(targetUser._id) !== String(req.user._id)) {
        targetUser.status = "suspended";
        await targetUser.save();
        actionTaken = "user.suspend";
        actionLabel = targetUser.username;
        await notify(targetUser._id, {
          kind: "account_suspended",
          title: "Account suspended",
          body: "Your account was suspended after a community report. Contact support if this was a mistake.",
          href: "/help",
          actor: null,
        });
      }
    }

    await recordAudit(req, {
      action: actionTaken || "report.resolve",
      targetType: report.targetType,
      targetId: String(report.target),
      targetLabel: actionLabel ?? (actionTaken ? String(report.target) : `report ${report.reason}`),
      reason: note || "Resolved from moderation queue",
      metadata: { report: String(report._id), action },
    });

    res.json({ ok: true, reportId: String(report._id), actionTaken });
  } catch (err) { next(err); }
});

// ---- Dispute resolution ----

/** GET /api/admin/disputes — open/resolved swap disputes. */
router.get("/disputes", async (req, res, next) => {
  try {
    const { status, page, limit } = z
      .object({
        status: z.enum(["open", "resolved", "all"]).optional().default("open"),
        page: z.coerce.number().int().min(1).max(1000).optional().default(1),
        limit: z.coerce.number().int().min(1).max(50).optional().default(20),
      })
      .parse(req.query);

    const filter = status !== "all" ? { status } : {};
    const [disputes, total] = await Promise.all([
      Dispute.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("openedBy", "username")
        .populate("resolvedBy", "username")
        .populate("swap", "status requestedListing offeredListing requester owner"),
      Dispute.countDocuments(filter),
    ]);

    const items = await Promise.all(
      disputes.map(async (d) => {
        const reqList = await Listing.findById(d.swap?.requestedListing).select("title");
        const offList = await Listing.findById(d.swap?.offeredListing).select("title");
        const participants = await Promise.all(
          [d.swap?.requester, d.swap?.owner]
            .filter(Boolean)
            .map((id) => User.findById(id).select("username")),
        );
        const escrow = d.swap ? await escrowForSwap(d.swap._id) : null;
        return {
          id: String(d._id),
          swapId: String(d.swap?._id),
          swapStatus: d.swap?.status,
          reason: d.reason,
          description: d.description,
          status: d.status,
          openedBy: d.openedBy?.username ?? "member",
          listingTitle: reqList?.title ?? offList?.title ?? null,
          participants: participants.map((u) => u?.username).filter(Boolean),
          resolutionNote: d.resolutionNote,
          outcome: d.outcome,
          resolvedBy: d.resolvedBy?.username ?? null,
          createdAt: d.createdAt,
          escrow: escrow ? { amount: escrow.amount, status: escrow.status, receiptNo: escrow.receiptNo } : null,
          evidence: (d.evidence ?? []).map((e) => ({
            publicId: e.publicId,
            url: e.publicId ? signEvidenceUrl(e.publicId) : (e.url ?? null),
            width: e.width,
            height: e.height,
            by: e.by ? String(e.by) : null,
            caption: e.caption,
            createdAt: e.createdAt,
          })),
          timeline: d.timeline ?? [],
        };
      }),
    );

    res.json({ items, total, page, limit, pages: Math.ceil(total / limit) || 1 });
  } catch (err) { next(err); }
});

/** PATCH /api/admin/disputes/:id/resolve — close a dispute with an outcome.
 *  `outcome` decides how any escrowed credits move:
 *    - none           → no credits move
 *    - refund_requester → escrow refunds to the requester, swap cancelled
 *    - release_owner  → escrow releases to the owner, swap completed
 */
router.patch("/disputes/:id/resolve", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Dispute not found" });
    const dispute = await Dispute.findById(req.params.id);
    if (!dispute) return res.status(404).json({ error: "Dispute not found" });
    if (dispute.status !== "open") return res.status(409).json({ error: "Dispute already resolved" });

    const { note, outcome } = z
      .object({
        note: z.string().trim().max(500).optional().default(""),
        outcome: z.enum(DISPUTE_OUTCOMES).optional().default("none"),
      })
      .parse(req.body ?? {});

    dispute.status = "resolved";
    dispute.resolvedBy = req.user._id;
    dispute.resolvedAt = new Date();
    dispute.resolutionNote = note;
    dispute.outcome = outcome;
    dispute.timeline.push({
      actor: req.user.username,
      action: "resolved",
      note: `${note || "Resolved"} — ${outcome === "refund_requester" ? "credits refunded to requester" : outcome === "release_owner" ? "credits released to owner" : "no credits moved"}.`,
    });
    await dispute.save();

    // Settle escrow according to the chosen outcome and reflect it in the swap.
    if (dispute.swap && (outcome === "refund_requester" || outcome === "release_owner")) {
      const swap = await Swap.findById(dispute.swap);
      if (swap) {
        if (outcome === "refund_requester") {
          const refund = await escrowRefund(swap, note || "Dispute resolved in requester's favour.");
          if (swap.status === "accepted") {
            swap.status = "cancelled"; await swap.save();
            // The swap is being unwound — free the units the earlier accept
            // reserved so they can be swapped again.
            await releaseListings(swap);
          }
          if (refund) {
            await recordAudit(req, {
              action: "swap.refund",
              targetType: "user",
              targetId: String(dispute.openedBy),
              targetLabel: "escrow refund",
              reason: note || "Dispute resolved — credits returned.",
              metadata: { dispute: String(dispute._id), swap: String(swap._id), amount: refund.amount },
            });
          }
        } else {
          await escrowRelease(swap);
          if (swap.status === "accepted") { swap.status = "completed"; swap.completedAt = new Date(); await swap.save(); }
          // Mirror the user-driven complete path: consume the items, count the
          // swap toward both members' public stats and refresh reliability.
          await consumeListings(swap);
          await Promise.all([
            User.updateOne({ _id: swap.requester }, { $inc: { swaps: 1 } }),
            User.updateOne({ _id: swap.owner }, { $inc: { swaps: 1 } }),
          ]);
          await Promise.allSettled([
            recomputeReliability(swap.requester),
            recomputeReliability(swap.owner),
          ]);
        }
      }
    }

    await recordAudit(req, {
      action: "swap.dispute_resolved",
      targetType: "user",
      targetId: String(dispute.openedBy),
      targetLabel: "swap dispute",
      reason: note || "Resolved from moderation queue",
      metadata: { dispute: String(dispute._id), swap: String(dispute.swap), outcome },
    });

    res.json({ ok: true, disputeId: String(dispute._id), outcome });
  } catch (err) { next(err); }
});

/** GET /api/admin/audit — the moderation trail. */
router.get("/audit", async (req, res, next) => {
  try {
    const { limit, action } = z
      .object({
        limit: z.coerce.number().int().min(1).max(200).optional().default(50),
        action: z.string().trim().max(40).optional().default(""),
      })
      .parse(req.query);

    const filter = action ? { action } : {};
    const entries = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(limit);

    res.json({
      entries: entries.map((e) => ({
        id: String(e._id),
        actor: e.actorUsername,
        action: e.action,
        targetType: e.targetType,
        targetId: e.targetId,
        targetLabel: e.targetLabel,
        reason: e.reason,
        metadata: e.metadata,
        createdAt: e.createdAt,
      })),
    });
  } catch (err) { next(err); }
});

/** GET /api/admin/analytics?days=30 — marketplace + moderation time series. */
router.get("/analytics", async (req, res, next) => {
  try {
    const { days } = z.object({ days: z.coerce.number().int().min(7).max(90).optional().default(30) }).parse(req.query);
    const since = new Date(Date.now() - days * 86400000);
    const dayKey = { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } };

    const [listingsByDay, swapsByDay, auditByDay, swapStatus, categories, totals, signupsByDay, retention, funnel, moderation, listingStats] = await Promise.all([
      Listing.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: dayKey, count: { $sum: 1 } } }]),
      Swap.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: dayKey, count: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } } } },
      ]),
      AuditLog.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: dayKey, count: { $sum: 1 } } }]),
      Swap.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Listing.aggregate([{ $group: { _id: "$category", count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 6 }]),
      Promise.all([
        Listing.countDocuments({ status: "active" }),
        Swap.countDocuments({}),
        Swap.countDocuments({ status: "completed" }),
        User.countDocuments({}),
      ]),
      // Signups per day (cohort base for retention).
      User.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: dayKey, count: { $sum: 1 } } }]),
      // Retention: distinct members active each day (swap, listing or message),
      // and how many of today's actives were first seen in an earlier period.
      (async () => {
        const swapActors = () => Swap.aggregate([
          { $match: { createdAt: { $gte: since } } },
          { $project: { u: ["$requester", "$owner"] } },
          { $unwind: "$u" },
          { $group: { _id: dayKey, ids: { $addToSet: "$u" } } },
        ]);
        const listingSellers = () => Listing.aggregate([
          { $match: { createdAt: { $gte: since } } },
          { $group: { _id: dayKey, ids: { $addToSet: "$seller" } } },
        ]);
        const [swapRows, listingRows] = await Promise.all([swapActors(), listingSellers()]);
        const seenBefore = new Set();
        const buckets = new Map();
        const register = (rows) => {
          for (const r of rows) {
            const day = String(r._id);
            const ids = (r.ids ?? []).map(String);
            if (!buckets.has(day)) buckets.set(day, new Set());
            for (const id of ids) buckets.get(day).add(id);
          }
        };
        register(swapRows);
        register(listingRows);
        const daysArr = Array.from({ length: days }, (_, i) => {
          const d = new Date(since.getTime() + i * 86400000).toISOString().slice(0, 10);
          const active = buckets.get(d) ?? new Set();
          const returning = new Set([...active].filter((id) => seenBefore.has(id)));
          for (const id of active) seenBefore.add(id);
          return { date: d, active: active.size, returning: returning.size };
        });
        const current = daysArr[daysArr.length - 1];
        return {
          byDay: daysArr,
          currentActive: current?.active ?? 0,
          currentReturning: current?.returning ?? 0,
          retentionRate: current?.active ? Math.round((current.returning / current.active) * 1000) / 10 : 0,
        };
      })(),
      // Conversion funnel: views → proposals → accepted → completed.
      (async () => {
        const [views, proposals, reachedAccepted, completedNow] = await Promise.all([
          Listing.aggregate([{ $group: { _id: null, views: { $sum: "$views" }, saves: { $sum: "$saves" } } }]),
          Swap.countDocuments({}),
          Swap.countDocuments({ status: { $in: ["accepted", "completed"] } }),
          Swap.countDocuments({ status: "completed" }),
        ]);
        const v = views[0]?.views ?? 0;
        const s = views[0]?.saves ?? 0;
        return {
          views: v,
          saves: s,
          proposals,
          accepted: reachedAccepted,
          completed: completedNow,
          proposalRate: v ? Math.round((proposals / v) * 1000) / 10 : 0,
          completionRate: proposals ? Math.round((completedNow / proposals) * 1000) / 10 : 0,
        };
      })(),
      // Moderation KPIs: reports + disputes resolved within window + latency.
      (async () => {
        const [openReports, openDisputes, resolvedReports, resolvedDisputes, byAction] = await Promise.all([
          Report.countDocuments({ status: "open" }),
          Dispute.countDocuments({ status: "open" }),
          Report.find({ status: "resolved", resolvedAt: { $ne: null } }).select("createdAt resolvedAt"),
          Dispute.find({ status: "resolved", resolvedAt: { $ne: null } }).select("createdAt resolvedAt"),
          AuditLog.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: "$action", count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 8 }]),
        ]);
        const avgHours = (rows) => {
          if (!rows.length) return 0;
          const total = rows.reduce((n, r) => n + Math.max(0, new Date(r.resolvedAt).getTime() - new Date(r.createdAt).getTime()), 0);
          return Math.round((total / rows.length / 3600000) * 10) / 10;
        };
        return {
          openReports,
          openDisputes,
          resolvedReports: resolvedReports.length,
          resolvedDisputes: resolvedDisputes.length,
          reportResolutionHours: avgHours(resolvedReports),
          disputeResolutionHours: avgHours(resolvedDisputes),
          actions24h: await AuditLog.countDocuments({ createdAt: { $gte: new Date(Date.now() - 86400000) } }),
          byAction: byAction.map((a) => ({ action: a._id, count: a.count })),
        };
      })(),
      // Listings growth: status mix + engagement totals.
      (async () => {
        const [statusRows] = await Promise.all([Listing.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }])]);
        const engagement = await Listing.aggregate([{ $group: { _id: null, views: { $sum: "$views" }, saves: { $sum: "$saves" } } }]);
        return {
          byStatus: statusRows.map((r) => ({ status: r._id, count: r.count })),
          totalViews: engagement[0]?.views ?? 0,
          totalSaves: engagement[0]?.saves ?? 0,
        };
      })(),
    ]);

    const index = (rows) => Object.fromEntries(rows.map((r) => [r._id, r]));
    const listingsIdx = index(listingsByDay);
    const swapsIdx = index(swapsByDay);
    const auditIdx = index(auditByDay);
    const signupsIdx = index(signupsByDay);

    const timeline = Array.from({ length: days }, (_, i) => {
      const d = new Date(since.getTime() + i * 86400000).toISOString().slice(0, 10);
      return {
        date: d,
        listings: listingsIdx[d]?.count ?? 0,
        swaps: swapsIdx[d]?.count ?? 0,
        completed: swapsIdx[d]?.completed ?? 0,
        moderation: auditIdx[d]?.count ?? 0,
        signups: signupsIdx[d]?.count ?? 0,
      };
    });

    const [activeListings, totalSwaps, completedSwaps, users] = totals;

    res.json({
      days,
      totals: {
        activeListings,
        totalSwaps,
        completedSwaps,
        users,
        conversionRate: totalSwaps ? Math.round((completedSwaps / totalSwaps) * 1000) / 10 : 0,
      },
      timeline,
      swapStatus: swapStatus.map((s) => ({ status: s._id, count: s.count })),
      categories: categories.map((c) => ({ category: c._id, count: c.count })),
      signups: signupsByDay.map((s) => ({ date: s._id, count: s.count })),
      retention,
      funnel,
      moderation,
      listingStats,
    });
  } catch (err) { next(err); }
});

export default router;
