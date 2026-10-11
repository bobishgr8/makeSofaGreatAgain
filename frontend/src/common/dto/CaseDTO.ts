export type CaseNeed = {
  category?: string;
  // The space the item has to fit in. Items that are too big are never suggested.
  maxDimensionsCm?: {
    width?: number;
    depth?: number;
    height?: number;
  };
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
  // Which furniture is matched to which need, by category. Written by the server only.
  fulfilment?: Record<string, string>;
  // The same, for needs whose furniture has been delivered.
  delivered?: Record<string, string>;

  socialWorkerId?: string;
  createdAt?: string;
  updatedAt?: string;
};
