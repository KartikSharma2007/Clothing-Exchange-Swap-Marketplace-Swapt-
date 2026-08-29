import { api, apiEnabled } from "@/lib/api";

export type Review = {
  id: string;
  listing: string;
  rating: number;
  comment: string;
  createdAt: string;
  author: { username: string; name: string; avatarUrl: string | null };
};

export type ListingReviews = {
  rating: number;
  ratingCount: number;
  /** Star counts from 5★ down to 1★ (length 5). */
  distribution?: number[];
  items: Review[];
};

export type UserReviews = ListingReviews & {
  distribution: number[];
};

export async function fetchListingReviews(listingId: string): Promise<ListingReviews> {
  return api<ListingReviews>(`/api/reviews/listing/${listingId}`, { auth: false });
}

export async function fetchUserReviews(username: string): Promise<UserReviews> {
  return api<UserReviews>(`/api/reviews/user/${encodeURIComponent(username)}`, { auth: false });
}

export type CanReview = { canReview: boolean; reason: string | null };

/** Whether the signed-in user is allowed to review this listing (needs auth). */
export async function fetchCanReview(listingId: string): Promise<CanReview> {
  return api<CanReview>(`/api/reviews/can/${listingId}`);
}

export async function createReview(
  listingId: string,
  input: { rating: number; comment: string },
): Promise<Review> {
  const res = await api<{ review: Review }>(`/api/reviews/listing/${listingId}`, {
    method: "POST",
    body: input,
  });
  return res.review;
}

export async function updateReview(id: string, input: { rating: number; comment: string }): Promise<Review> {
  const res = await api<{ review: Review }>(`/api/reviews/${id}`, { method: "PATCH", body: input });
  return res.review;
}

export async function deleteReview(id: string): Promise<void> {
  await api(`/api/reviews/${id}`, { method: "DELETE" });
}

export { apiEnabled };
