import { Router } from "express";
import { User } from "../models/User.js";
import { Listing } from "../models/Listing.js";
import { Swap } from "../models/Swap.js";
import { Review } from "../models/Review.js";
import { Follow } from "../models/Follow.js";
import { signedUrl } from "../config/cloudinary.js";
import { optionalAuth } from "../middleware/auth.js";
import { recomputeReliability } from "../utils/reliability.js";
import { areBlocked } from "../utils/blocked.js";

const router = Router();
router.use(optionalAuth);

function listingCard(doc) {
  if (!doc) return null;
  return {
    id: String(doc._id),
    title: doc.title,
    brand: doc.brand,
    category: doc.category,
    size: doc.size,
    value: doc.value,
    status: doc.status,
    featured: Boolean(doc.featured),
    images: (doc.images ?? []).map((i) => signedUrl(i.publicId)),
    createdAt: doc.createdAt,
    // "3d ago" label for the seller closet feed.
    postedDaysAgo: doc.createdAt ? Math.max(0, Math.floor((Date.now() - new Date(doc.createdAt).getTime()) / 86400000)) : 0,
  };
}

/** A completed swap on a public profile, relative to the profile owner.
 *  Each side is a cloth card (when the member traded an item) plus a credits
 *  amount when that side involved Swapt credits instead of a piece of clothing.
 */
function publicSwap(doc, ownerId) {
  const card = (l) =>
    l ? { id: String(l._id), title: l.title, image: l.images?.[0] ? signedUrl(l.images[0].publicId) : "" } : null;

  const outgoing = String(doc.requester?._id ?? doc.requester) === String(ownerId);
  const other = outgoing ? doc.owner : doc.requester;
  const myItem = outgoing ? doc.offeredListing : doc.requestedListing;
  const theirItem = outgoing ? doc.requestedListing : doc.offeredListing;

  // Credits always flow requester → owner; the net is what was covered with
  // credits after any offered clothing is accounted for.
  const requestedValue = Number(doc.requestedListing?.value ?? 0);
  const offeredValue = Number(doc.offeredListing?.value ?? 0);
  const net = Math.max(0, requestedValue - offeredValue);

  return {
    id: String(doc._id),
    mine: card(myItem),
    theirs: card(theirItem),
    mineCredits: outgoing ? net : 0, // I covered the difference with credits
    theirsCredits: outgoing ? 0 : net, // I received the difference in credits
    otherUser: other?.username ?? "",
    otherName: other?.displayName || other?.username || "Member",
    date: doc.completedAt ?? doc.createdAt,
  };
}

router.get("/:username", async (req, res, next) => {
  try {
    const username = String(req.params.username || "").trim();
    if (!username) return res.status(404).json({ error: "User not found" });

    const user = await User.findOne({ username, deletedAt: null });
    if (!user) return res.status(404).json({ error: "User not found" });

    // If either party has blocked the other, hide the profile.
    if (req.user) {
      const ownerHasBlockedViewer = Array.isArray(user.blockedUsers) && user.blockedUsers.some((b) => String(b) === String(req.user._id));
      const viewerHasBlockedOwner = Array.isArray(req.user.blockedUsers) && req.user.blockedUsers.some((b) => String(b) === String(user._id));
      if (ownerHasBlockedViewer || viewerHasBlockedOwner) {
        return res.status(404).json({ error: "User not found" });
      }
    }

    // Private profiles are only visible to the owner and admins.
    const isOwner = req.user && String(req.user._id) === String(user._id);
    const isAdmin = req.user?.role === "admin";
    if (user.publicProfile === false && !isOwner && !isAdmin) {
      return res.status(404).json({ error: "User not found" });
    }

    const [listings, reviewSummary, followerCount, followingCount, isFollowing] = await Promise.all([
      Listing.find({ seller: user._id, status: "active" })
        .sort({ createdAt: -1 })
        .limit(24),
      Review.aggregate([
        { $match: { seller: user._id } },
        { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
      ]),
      Follow.countDocuments({ following: user._id }),
      Follow.countDocuments({ follower: user._id }),
      req.user
        ? Follow.exists({ follower: req.user._id, following: user._id })
        : false,
    ]);
    const row = reviewSummary[0];

    // Backfill reliability lazily for members whose score predates this feature.
    if (!user.reliability && user.reliabilitySample === 0) {
      const backfilled = await recomputeReliability(user._id);
      if (backfilled.reliability != null) {
        user.reliability = backfilled.reliability;
        user.reliabilitySample = backfilled.reliabilitySample;
      }
    }

    res.json({
      user: {
        id: String(user._id),
        username: user.username,
        displayName: user.displayName || user.username,
        bio: user.bio,
        // "Show my location" off hides the member's city from other members.
        location: user.showLocation === false && !isOwner ? "" : user.location,
        avatarUrl: user.avatar?.publicId ? signedUrl(user.avatar.publicId) : user.avatar?.url ?? null,
        rating: row ? Math.round(row.avg * 10) / 10 : user.rating,
        ratingCount: row ? row.count : user.ratingCount,
        swaps: user.swaps,
        phoneVerified: Boolean(user.phoneVerified),
        verifiedSeller: Boolean(user.verifiedSeller),
        verifiedAt: user.verifiedAt ?? null,
        reliability: user.reliability ?? null,
        reliabilitySample: user.reliabilitySample ?? 0,
        createdAt: user.createdAt,
        followers: followerCount,
        following: followingCount,
        isFollowing: Boolean(isFollowing),
      },
      listings: listings.map(listingCard),
    });
  } catch (err) {
    next(err);
  }
});

/** Public follower/following lists for a profile. */
router.get("/:username/:relation(followers|following)", async (req, res, next) => {
  try {
    const username = String(req.params.username || "").trim();
    const user = await User.findOne({ username, deletedAt: null });
    if (!user) return res.status(404).json({ error: "User not found" });

    if (req.user) {
      const blocked = [user.blockedUsers, req.user.blockedUsers].some((list) =>
        Array.isArray(list) && list.some((id) => String(id) === String(req.user._id)),
      );
      if (blocked) return res.status(404).json({ error: "User not found" });
    }
    const isOwner = req.user && String(req.user._id) === String(user._id);
    const isAdmin = req.user?.role === "admin";
    if (user.publicProfile === false && !isOwner && !isAdmin) {
      return res.status(404).json({ error: "User not found" });
    }

    const field = req.params.relation === "followers" ? "following" : "follower";
    const targetField = req.params.relation === "followers" ? "follower" : "following";
    const follows = await Follow.find({ [field]: user._id })
      .sort({ createdAt: -1 })
      .populate(targetField, "username displayName avatar");
    const users = follows.map((follow) => {
      const member = follow[targetField];
      return member
        ? {
            username: member.username,
            displayName: member.displayName || member.username,
            avatarUrl: member.avatar?.publicId ? signedUrl(member.avatar.publicId) : member.avatar?.url ?? null,
          }
        : null;
    }).filter(Boolean);
    res.json({ users });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/users/:username/follow — the signed-in viewer follows this member.
 * Idempotent: following someone who is already followed is a no-op.
 */
router.post("/:username/follow", async (req, res, next) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Sign in to follow members" });
    const username = String(req.params.username || "").trim();
    const target = await User.findOne({ username, deletedAt: null }).select("blockedUsers");
    if (!target) return res.status(404).json({ error: "User not found" });
    if (String(target._id) === String(req.user._id)) return res.status(400).json({ error: "You can't follow yourself" });
    // Blocks kill the follow in both directions — no following someone who
    // blocked you, and no following someone you blocked.
    if (areBlocked(target, req.user)) {
      return res.status(403).json({ error: "You can't follow this member" });
    }

    await Follow.updateOne(
      { follower: req.user._id, following: target._id },
      { $setOnInsert: { follower: req.user._id, following: target._id } },
      { upsert: true },
    );
    const followers = await Follow.countDocuments({ following: target._id });
    res.status(201).json({ following: true, followers });
  } catch (err) { next(err); }
});

/** DELETE /api/users/:username/follow — stop following this member. */
router.delete("/:username/follow", async (req, res, next) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Sign in to manage follows" });
    const username = String(req.params.username || "").trim();
    const target = await User.findOne({ username, deletedAt: null });
    if (!target) return res.status(404).json({ error: "User not found" });

    await Follow.deleteOne({ follower: req.user._id, following: target._id });
    const followers = await Follow.countDocuments({ following: target._id });
    res.json({ following: false, followers });
  } catch (err) { next(err); }
});

/** GET /api/users/:username/swaps — the profile owner's completed swaps (public). */
router.get("/:username/swaps", async (req, res, next) => {
  try {
    const username = String(req.params.username || "").trim();
    const user = await User.findOne({ username, deletedAt: null });
    if (!user) return res.status(404).json({ error: "User not found" });

    // Same privacy rules as the profile: blocks are enforced in both
    // directions, and private profiles are only visible to the owner/admins.
    if (req.user) {
      const ownerBlockedViewer = Array.isArray(user.blockedUsers) && user.blockedUsers.some((b) => String(b) === String(req.user._id));
      const viewerBlockedOwner = Array.isArray(req.user.blockedUsers) && req.user.blockedUsers.some((b) => String(b) === String(user._id));
      if (ownerBlockedViewer || viewerBlockedOwner) {
        return res.status(404).json({ error: "User not found" });
      }
    }
    const isOwner = req.user && String(req.user._id) === String(user._id);
    const isAdmin = req.user?.role === "admin";
    if (user.publicProfile === false && !isOwner && !isAdmin) {
      return res.status(404).json({ error: "User not found" });
    }

    const swaps = await Swap.find({ $or: [{ requester: user._id }, { owner: user._id }], status: "completed" })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate("requester", "username displayName")
      .populate("owner", "username displayName")
      .populate("requestedListing", "title images value")
      .populate("offeredListing", "title images value");

    res.json({ items: swaps.map((s) => publicSwap(s, user._id)) });
  } catch (err) {
    next(err);
  }
});

export default router;
