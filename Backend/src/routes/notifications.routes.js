import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { Notification } from "../models/Notification.js";
import { User } from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

function serializeNotification(doc) {
  return {
    id: String(doc._id),
    kind: doc.kind,
    title: doc.title,
    body: doc.body,
    href: doc.href || null,
    actor: doc.actor ? doc.actor.displayName || doc.actor.username : null,
    readAt: doc.readAt ? doc.readAt.toISOString() : null,
    createdAt: doc.createdAt.toISOString(),
  };
}

/** GET /api/notifications — fetch user's notifications */
router.get("/", async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(1, Number(req.query.limit) || 12), 100);
    const notifications = await Notification.find({ user: req.user._id })
      .populate("actor", "displayName username")
      .sort({ createdAt: -1 })
      .limit(limit);

    res.json({ items: notifications.map(serializeNotification) });
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/notifications/:id/read — mark single notification as read/unread */
router.patch("/:id/read", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: "Notification not found" });
    }

    const { read } = z.object({ read: z.boolean() }).parse(req.body);

    const notification = await Notification.findOne({
      _id: req.params.id,
      user: req.user._id,
    }).populate("actor", "displayName username");

    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }

    notification.readAt = read ? new Date() : null;
    await notification.save();

    res.json(serializeNotification(notification));
  } catch (err) {
    next(err);
  }
});

/** POST /api/notifications/read-all — mark all notifications as read */
router.post("/read-all", async (req, res, next) => {
  try {
    const now = new Date();
    await Notification.updateMany(
      { user: req.user._id, readAt: null },
      { readAt: now },
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
