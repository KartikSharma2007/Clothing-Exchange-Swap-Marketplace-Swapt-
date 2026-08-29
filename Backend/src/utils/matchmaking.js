/**
 * Smart swap matching.
 *
 * A "mutual match" exists when two members each want what the other has:
 *   - You own listing A, and another member wants A (they saved it or
 *     requested a swap on it).
 *   - They own listing B, and you want B (you saved it, requested a swap, or
 *     B matches one of your saved searches).
 *
 * `findMutualMatches` returns suggestions (it never creates swaps on its own)
 * and `checkAndNotifyMatch` fires a "It's a match!" notification when a save
 * completes a mutual match, throttled to one pair-notification per day.
 */
import { Listing } from "../models/Listing.js";
import { User } from "../models/User.js";
import { Wishlist } from "../models/Wishlist.js";
import { Swap } from "../models/Swap.js";
import { SavedSearch } from "../models/SavedSearch.js";
import { Notification } from "../models/Notification.js";
import { signedUrl } from "../config/cloudinary.js";
import { notify } from "./notify.js";
import { pushToUser } from "./push.js";

const ACTIVE_SWAP = { $in: ["pending", "accepted"] };
const SEARCH_WEIGHT = 1;
const SAVED_WEIGHT = 2;
const SWAP_WEIGHT = 3;

/** Reuses the browse-page semantics so saved-search interest matches the UI. */
export function savedSearchMatches(s, listing) {
  if (!s) return false;
  if (s.cat && listing.category !== s.cat) return false;
  if (s.size && listing.size !== s.size) return false;
  if (s.g && listing.gender !== s.g) return false;
  if (s.brand && String(listing.brand).toLowerCase() !== String(s.brand).toLowerCase()) return false;
  if (s.q) {
    const rx = new RegExp(s.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    if (!rx.test(listing.title) && !rx.test(listing.brand) && !rx.test(listing.color)) return false;
  }
  return true;
}

function addWant(map, id, reason) {
  const key = String(id);
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(reason);
}

function addAdmire(map, userId, listingId, reason) {
  const uid = String(userId);
  if (!map.has(uid)) map.set(uid, new Map());
  const inner = map.get(uid);
  const lid = String(listingId);
  if (!inner.has(lid)) inner.set(lid, new Set());
  inner.get(lid).add(reason);
}

function card(doc) {
  return {
    id: String(doc._id),
    title: doc.title,
    brand: doc.brand,
    size: doc.size,
    value: doc.value,
    image: doc.images?.[0]?.publicId ? signedUrl(doc.images[0].publicId) : "",
  };
}

function score(signals) {
  return signals.youWant.reduce((n, s) => n + signalWeight(s), 0) + signals.theyWant.reduce((n, s) => n + signalWeight(s), 0);
}

function signalWeight(s) {
  if (s === "swap_request") return SWAP_WEIGHT;
  if (s === "saved") return SAVED_WEIGHT;
  return SEARCH_WEIGHT;
}

function buildMatch(admId, admirer, myListing, theirListing, youWant, theyWant) {
  const signals = { youWant: [...youWant], theyWant: [...theyWant] };
  return {
    id: `${String(myListing._id)}_${String(theirListing._id)}`,
    counterparty: {
      id: admId,
      username: admirer.username,
      name: admirer.displayName || admirer.username,
      avatarUrl: admirer.avatar?.publicId ? signedUrl(admirer.avatar.publicId) : (admirer.avatar?.url ?? null),
    },
    yourListing: card(myListing),
    theirListing: card(theirListing),
    signals,
    score: score(signals),
  };
}

/** True if a swap between these two members is still in progress. */
async function hasLiveSwap(userA, userB) {
  return Swap.exists({
    status: ACTIVE_SWAP,
    $or: [{ requester: userA, owner: userB }, { requester: userB, owner: userA }],
  });
}

/**
 * Suggested mutual swaps for `userId`. The caller is the one who owns
 * "yourListing"; the counterparty owns "theirListing" and wants yours.
 */
export async function findMutualMatches(userId) {
  // The signed-in member's own block list — a block is enforced in both
  // directions, so we skip admirers *either* party has blocked.
  const me = await User.findById(userId).select("blockedUsers").lean();
  const myBlocked = new Set((me?.blockedUsers ?? []).map(String));

  const myListings = await Listing.find({ seller: userId, status: "active" }).limit(200).lean();
  if (myListings.length === 0) return [];
  const myListingIds = myListings.map((l) => l._id);

  // Interest the signed-in member has already shown in other people's items.
  const [myWishlist, mySwapRequests, mySearches] = await Promise.all([
    Wishlist.findOne({ user: userId }).lean(),
    Swap.find({ requester: userId, status: ACTIVE_SWAP }).lean(),
    SavedSearch.find({ user: userId }).lean(),
  ]);
  const wantById = new Map();
  for (const item of myWishlist?.items ?? []) addWant(wantById, item.listing, "saved");
  for (const s of mySwapRequests) addWant(wantById, s.requestedListing, "swap_request");

  // Who wants my listings?
  const [wishlists, swaps] = await Promise.all([
    Wishlist.find({ "items.listing": { $in: myListingIds } }).lean(),
    Swap.find({ requestedListing: { $in: myListingIds }, status: ACTIVE_SWAP }).lean(),
  ]);
  const admire = new Map();
  for (const w of wishlists) {
    if (String(w.user) === String(userId)) continue;
    for (const item of w.items) {
      if (myListingIds.some((id) => String(id) === String(item.listing))) {
        addAdmire(admire, w.user, item.listing, "saved");
      }
    }
  }
  for (const s of swaps) {
    if (String(s.requester) === String(userId)) continue;
    if (myListingIds.some((id) => String(id) === String(s.requestedListing))) {
      addAdmire(admire, s.requester, s.requestedListing, "swap_request");
    }
  }

  if (admire.size === 0) return [];

  const admirerIds = [...admire.keys()];
  const admirers = await User.find({ _id: { $in: admirerIds }, status: "active" })
    .select("username displayName avatar blockedUsers")
    .lean();
  const admirerMap = new Map(admirers.map((u) => [String(u._id), u]));

  const theirListings = await Listing.find({ seller: { $in: admirerIds }, status: "active" }).limit(500).lean();
  const theirByUser = new Map();
  for (const l of theirListings) {
    const uid = String(l.seller);
    if (!theirByUser.has(uid)) theirByUser.set(uid, []);
    theirByUser.get(uid).push(l);
  }

  // Skip pairs already mid-swap (they don't need a suggestion). Pair keys are
  // canonical — the listing pair sorts so direction doesn't matter.
  const existingSwaps = await Swap.find({
    status: ACTIVE_SWAP,
    $or: [
      { requester: userId, owner: { $in: admirerIds } },
      { owner: userId, requester: { $in: admirerIds } },
    ],
  }).select("requester owner requestedListing offeredListing").lean();
  const existingPairs = new Set();
  const pairKey = (a, b) => [String(a), String(b)].sort().join("|");
  for (const s of existingSwaps) {
    const other = String(s.requester) === String(userId) ? String(s.owner) : String(s.requester);
    if (s.offeredListing) {
      existingPairs.add(`${other}|${pairKey(s.requestedListing, s.offeredListing)}`);
    } else {
      // Credits-only swap: block suggestions for this exact (other, my listing).
      existingPairs.add(`${other}|${String(s.requestedListing)}|credits`);
    }
  }

  const matches = [];
  for (const [admId, wants] of admire) {
    const admirer = admirerMap.get(admId);
    if (!admirer) continue;
    // Respect blocks in both directions.
    const viewerBlocked = admirer.blockedUsers?.some((b) => String(b) === String(userId));
    const viewerBlockedByMe = myBlocked.has(admId);
    if (viewerBlocked || viewerBlockedByMe) continue;

    const theirList = theirByUser.get(admId) ?? [];
    if (theirList.length === 0) continue;

    for (const their of theirList) {
      if (String(their.seller) === String(userId)) continue;
      let whyWantTheirs = wantById.get(String(their._id));
      if (!whyWantTheirs && mySearches.some((s) => savedSearchMatches(s, their))) {
        whyWantTheirs = new Set(["saved_search"]);
      }
      if (!whyWantTheirs) continue;

      for (const [myListingId, theyWantMine] of wants) {
        if (String(their._id) === String(myListingId)) continue;
        const myListing = myListings.find((l) => String(l._id) === String(myListingId));
        if (!myListing) continue;
        const pairKeyOut = `${admId}|${pairKey(myListingId, their._id)}`;
        if (existingPairs.has(pairKeyOut)) continue;
        matches.push(buildMatch(admId, admirer, myListing, their, [...whyWantTheirs], [...theyWantMine]));
      }
    }
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, 20);
}

/**
 * Called after a member saves `listing` (owned by someone else). If that save
 * completes a mutual match with one of the saver's own active listings, notify
 * both members. Best-effort and fire-and-forget — never throws to the caller.
 */
export async function checkAndNotifyMatch(listing, saver) {
  try {
    const ownerId = listing.seller;
    const saverId = saver._id;
    if (!ownerId || String(ownerId) === String(saverId)) return;

    // Never surface a match (or its notification) to either party in a block.
    const owner = await User.findById(ownerId).select("blockedUsers").lean();
    if (!owner) return;
    const ownerBlockedSaver = owner.blockedUsers?.some((b) => String(b) === String(saverId));
    const saverBlockedOwner = saver.blockedUsers?.some((b) => String(b) === String(ownerId));
    if (ownerBlockedSaver || saverBlockedOwner) return;

    const myActive = await Listing.find({ seller: saverId, status: "active" })
      .select("_id title category size gender brand color")
      .lean();
    if (myActive.length === 0) return;

    const [theirWishlist, theirSwaps, theirSearches] = await Promise.all([
      Wishlist.findOne({ user: ownerId }).lean(),
      Swap.find({ requester: ownerId, status: ACTIVE_SWAP }).lean(),
      SavedSearch.find({ user: ownerId }).lean(),
    ]);
    const theyWantIds = new Set([
      ...(theirWishlist?.items ?? []).map((i) => String(i.listing)),
      ...theirSwaps.map((s) => String(s.requestedListing)),
    ]);
    const wantedMine = myActive.find(
      (l) => theyWantIds.has(String(l._id)) || theirSearches.some((s) => savedSearchMatches(s, l)),
    );
    if (!wantedMine) return;

    if (await hasLiveSwap(saverId, ownerId)) return;
    const notified = await Notification.exists({
      kind: "swap_match",
      createdAt: { $gte: new Date(Date.now() - 86400000) },
      $or: [
        { user: saverId, actor: ownerId },
        { user: ownerId, actor: saverId },
      ],
    });
    if (notified) return;

    const text = `“${wantedMine.title}” ↔ “${listing.title}” — you both want each other's items.`;
    const okSaver = await notify(saverId, {
      kind: "swap_match",
      title: "It's a match!",
      body: text,
      href: `/listing/${listing._id}`,
      actor: ownerId,
    });
    const okOwner = await notify(ownerId, {
      kind: "swap_match",
      title: "It's a match!",
      body: text,
      href: `/listing/${wantedMine._id}`,
      actor: saverId,
    });
    if (okSaver) void pushToUser(saverId, { title: "Swapt · It's a match!", body: text, href: `/listing/${listing._id}` });
    if (okOwner) void pushToUser(ownerId, { title: "Swapt · It's a match!", body: text, href: `/listing/${wantedMine._id}` });
  } catch (err) {
    console.warn("swap-match notification failed", err.message || err);
  }
}
