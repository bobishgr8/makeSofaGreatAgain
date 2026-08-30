// Mirrors backend/app/scoring.py's score_match() output plus matching.py's stored fields.
export type Match = {
  id: string;
  score: number;
  scoreBreakdown?: Record<string, number>;
  furnitureId: string;
  caseId: string;
  socialWorkerId?: string;
  status?: string;
  reasons: string[];
  createdAt?: string;
  updatedAt?: string;
};
