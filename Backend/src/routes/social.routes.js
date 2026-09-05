import { Router } from "express";
import { User } from "../models/User.js";
import { Follow } from "../models/Follow.js";
import { Notification } from "../models/Notification.js";
import { Listing } from "../models/Listing.js";
import { Swap } from "../models/Swap.js";
import { requireAuth } from "../middleware/auth.js";
import { notify } from "../utils/notify.js";
import { pushToUser } from "../utils/push.js";

const router = Router();

/**
 * GET /api/social/followers/:userId - Get followers of a user
 */
router.get("/followers/:userId", async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    const followers = await Follow.find({ following: userId })
      .populate("follower", "username displayName avatarUrl")
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({ followers: followers.map(f => f.follower) });
  } catch (err) { next(err); }
});

/**
 * GET /api/social/following/:userId - Get users that a user is following
 */
router.get("/following/:userId", async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    const following = await Follow.find({ follower: userId })
      .populate("following", "username displayName avatarUrl")
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({ following: following.map(f => f.following) });
  } catch (err) { next(err); }
});

/**
 * POST /api/social/follow/:userId - Follow a user
 */
router.post("/follow/:userId", requireAuth, async (req, res, next) => {
  try {
    const { userId } = req.params;
    const followerId = req.user._id;

    if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    // Can't follow yourself
    if (userId === followerId.toString()) {
      return res.status(400).json({ error: "Cannot follow yourself" });
    }

    // Check if user exists
    const userToFollow = await User.findById(userId);
    if (!userToFollow) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if already following
    const existingFollow = await Follow.findOne({ follower: followerId, following: userId });
    if (existingFollow) {
      return res.status(409).json({ error: "Already following this user" });
    }

    // Create follow relationship
    const follow = new Follow({ follower: followerId, following: userId });
    await follow.save();

    // Send notification to the user being followed
    try {
      const notification = await notify(userId, {
        kind: "follow",
        title: "New follower",
        body: `${req.user.displayName || req.user.username} started following you`,
        href: `/profile/${req.user.username}`,
        actor: followerId
      });

      if (notification) {
        void pushToUser(userId, {
          title: "Swapt · New follower",
          body: `${req.user.displayName || req.user.username} started following you`,
          href: `/profile/${req.user.username}`
        });
      }
    } catch (notifyError) {
      console.warn("[social] Failed to send follow notification:", notifyError.message);
    }

    res.status(201).json({ ok: true, followId: follow._id });
  } catch (err) { next(err); }
});

/**
 * DELETE /api/social/unfollow/:userId - Unfollow a user
 */
router.delete("/unfollow/:userId", requireAuth, async (req, res, next) => {
  try {
    const { userId } = req.params;
    const followerId = req.user._id;

    if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    // Find and delete the follow relationship
    const follow = await Follow.findOneAndDelete({ follower: followerId, following: userId });

    if (!follow) {
      return res.status(404).json({ error: "Not following this user" });
    }

    res.json({ ok: true });
  } catch (err) { next(err); }
});

/**
 * GET /api/social/activity - Get activity feed for the current user
 * Shows what people you follow are doing (listings, swaps, etc.)
 */
router.get("/activity", requireAuth, async (req, res, next) => {
  try {
    const userId = req.user._id;

    // Get users that the current user follows
    const following = await Follow.find({ follower: userId }).select("following");
    const followingIds = following.map(f => f.following);

    // If not following anyone, return empty activity
    if (followingIds.length === 0) {
      return res.json({ activities: [] });
    }

    // Get recent activities from followed users
    const activities = [];

    // Get recent listings from followed users
    const recentListings = await Listing.find({
      seller: { $in: followingIds },
      status: "active",
      moderationStatus: "approved"
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate("seller", "username displayName avatarUrl")
      .lean();

    for (const listing of recentListings) {
      activities.push({
        type: "listing",
        id: listing._id,
        userId: listing.seller._id,
        username: listing.seller.username,
        displayName: listing.seller.displayName || listing.seller.username,
        avatarUrl: listing.seller.avatarUrl,
        title: listing.title,
        brand: listing.brand,
        image: listing.images?.[0] ?? null,
        timestamp: listing.createdAt,
        metadata: {
          value: listing.value,
          category: listing.category,
          size: listing.size
        }
      });
    }

    // Get recent swaps from followed users
    const recentSwaps = await Swap.find({
      $or: [
        { requester: { $in: followingIds } },
        { owner: { $in: followingIds } }
      ],
      status: { $in: ["completed", "accepted"] }
    })
      .sort({ updatedAt: -1 })
      .limit(20)
      .populate("requester", "username displayName avatarUrl")
      .populate("owner", "username displayName avatarUrl")
      .populate("requestedListing", "title brand images")
      .populate("offeredListing", "title brand images")
      .lean();

    for (const swap of recentSwaps) {
      // Determine if this swap involves the current user
      const involvesCurrentUser =
        swap.requester._id.equals(userId) ||
        swap.owner._id.equals(userId);

      // Only show swaps that don't involve the current user in activity feed
      // (to avoid duplication with personal swap notifications)
      if (!involvesCurrentUser) {
        const isRequester = swap.requester._id.equals(followingIds.find(id => id.equals(swap.requester._id)));
        const otherUser = isRequester ? swap.owner : swap.requester;
        const listing = isRequester ? swap.requestedListing : swap.offeredListing;

        activities.push({
          type: "swap",
          id: swap._id,
          userId: otherUser._id,
          username: otherUser.username,
          displayName: otherUser.displayName || otherUser.username,
          avatarUrl: otherUser.avatarUrl,
          action: isRequester ? "requested" : "received",
          timestamp: swap.updatedAt,
          metadata: {
            listingTitle: listing?.title ?? "Item",
            listingImage: listing?.images?.[0] ?? null,
            status: swap.status
          }
        });
      }
    }

    // Sort activities by timestamp (newest first)
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Limit to 50 activities
    res.json({ activities: activities.slice(0, 50) });
  } catch (err) { next(err); }
});

/**
 * GET /api/social/notifications - Get notifications for current user
 * (This might duplicate notifications.routes.js, but let's keep it for social-specific ones)
 */
router.get("/notifications", requireAuth, async (req, res, next) => {
  try {
    const notifications = await Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("actor", "username displayName avatarUrl")
      .lean();

    res.json({ notifications });
  } catch (err) { next(err); }
});

/**
 * PATCH /api/social/notifications/:id/read - Mark notification as read
 */
router.patch("/notifications/:id/read", requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const notification = await Notification.findOneAndUpdate(
      { _id: id, user: req.user._id },
      { readAt: new Date() },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.json({ notification });
  } catch (err) { next(err); }
});

/**
 * DELETE /api/social/notifications/:id - Delete a notification
 */
router.delete("/notifications/:id", requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const notification = await Notification.findOneAndDelete({
      _id: id,
      user: req.user._id
    });

    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.json({ ok: true });
  } catch (err) { next(err); }
});

/**
 * POST /api/social/notifications/read-all - Mark all notifications as read
 */
router.post("/notifications/read-all", requireAuth, async (req, res, next) => {
  try {
    await Notification.updateMany(
      { user: req.user._id, readAt: null },
      { readAt: new Date() }
    );

    res.json({ ok: true });
  } catch (err) { next(err); }
});

/**
 * GET /api/social/stats/:userId - Get social stats for a user (followers, following, etc.)
 */
router.get("/stats/:userId", async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    const [followersCount, followingCount] = await Promise.all([
      Follow.countDocuments({ following: userId }),
      Follow.countDocuments({ follower: userId })
    ]);

    res.json({
      followersCount,
      followingCount
    });
  } catch (err) { next(err); }
});

export default router;