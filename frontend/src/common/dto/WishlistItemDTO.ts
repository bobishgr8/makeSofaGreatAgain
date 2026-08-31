// Mirrors backend/app/cases.py's public_wishlist() output: one entry per
// need on an open case, deliberately stripped of case id / social worker id
// and anything more identifying than household.summary already is.
export type WishlistItem = {
  category: string;
  neighbourhood?: string;
  summary?: string;
  priority: "standard" | "high" | "urgent";
};
