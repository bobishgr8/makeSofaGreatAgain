import type { FurnitureView } from "./FurnitureDTO";

// One ranked item for a case: GET /api/matches/suggestions. Mirrors
// backend/app/scoring.py's score_match() output plus the furniture it scored.
// Nothing is stored until the social worker requests the item.
export type Suggestion = {
  furniture: FurnitureView;
  score: number;
  scoreBreakdown: Record<string, number>;
  reasons: string[];
};
