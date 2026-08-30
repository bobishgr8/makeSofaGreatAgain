import { FurniturePhoto } from "./FurniturePhotoDTO";

// Mirrors backend/app/furniture.py FURNITURE_STATUSES.
export const FURNITURE_STATUSES = [
  "pending_review",
  "available",
  "rejected",
  "matched",
  "collected",
  "withdrawn",
] as const;

export type FurnitureStatus = (typeof FURNITURE_STATUSES)[number];

export const FURNITURE_STATUS_LABELS: Record<FurnitureStatus, string> = {
  pending_review: "Needs review",
  available: "Approved",
  rejected: "Rejected",
  matched: "Matched",
  collected: "Collected",
  withdrawn: "Withdrawn",
};

export type Furniture = {
  id: string;
  schemaVersion?: number;

  title: string;
  category: string;
  subcategory?: string;

  condition: string;
  conditionNotes?: string;

  quantity: number;
  status: FurnitureStatus;

  photos?: FurniturePhoto[];

  location?: {
    city?: string;
    district?: string;
  };

  dimensionsCm?: {
    width?: number;
    height?: number;
    depth?: number;
  };

  collection?: {
    availability?: string[];
    availableUntil?: string | null;
    deadlineType?: string;
    deliveryArea?: string;
    disassembly?: string;
    donorCanDeliver?: boolean;
    fitsInLift?: string;
    floor?: number;
    hasLift?: boolean;
  };

  safety?: {
    donorConfirmedSafe?: boolean;
    offeredFree?: boolean;
  };

  donorId: string;

  createdAt: string;
  updatedAt: string;
};
