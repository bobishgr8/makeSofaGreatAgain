import type { FurnitureView } from "./FurnitureDTO";

// One ranked item for a case: GET /api/matches/suggestions. Mirrors
// backend/app/scoring.py's score_match() output plus the furniture it scored.
// Nothing is stored until the social worker requests the item.
export type Suggestion = {
  furniture: FurnitureView;
  score: number;
  scoreBreakdown: Record<string, number>;
  // Points available per component for this item; lift access counts for more on bulky items.
  weights?: Record<string, number>;
  reasons: string[];
  // True on the donor's delivery date: the last day for donation.
  urgent?: boolean;
  // Already held for another case: this case can join its waitlist instead.
  waitlist?: boolean;
};
