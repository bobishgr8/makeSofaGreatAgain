export type CaseNeed = {
  category?: string;
};

// Mirrors backend/app/cases.py's stored case document shape.
export type Case = {
  id: string;
  reference?: string;

  household?: {
    summary?: string;
  };

  location?: {
    city?: string;
    district?: string;
  };

  delivery?: {
    hasLift?: boolean;
    transportAvailable?: boolean;
  };

  priority?: "standard" | "high" | "urgent";
  status?: string;
  needs?: CaseNeed[];

  socialWorkerId?: string;
  createdAt?: string;
  updatedAt?: string;
};
