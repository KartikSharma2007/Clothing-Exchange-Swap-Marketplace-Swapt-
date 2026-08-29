import { Swap } from "../models/Swap.js";
import { User } from "../models/User.js";

/**
 * Recompute a member's swap-completion rate from their terminal swaps.
 * Terminal states: completed (good), declined/cancelled (fell through).
 * Stores reliability (0–100, null if no data yet) + the sample size.
 */
export async function recomputeReliability(userId) {
  const rows = await Swap.aggregate([
    {
      $match: {
        $or: [{ requester: userId }, { owner: userId }],
        status: { $in: ["completed", "declined", "cancelled"] },
      },
    },
    {
      $group: {
        _id: null,
        completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
        terminal: { $sum: 1 },
      },
    },
  ]);
  const row = rows[0];
  const reliability = row && row.terminal > 0 ? Math.round((row.completed / row.terminal) * 100) : null;
  const reliabilitySample = row?.terminal ?? 0;
  await User.updateOne({ _id: userId }, { reliability, reliabilitySample });
  return { reliability, reliabilitySample };
}
