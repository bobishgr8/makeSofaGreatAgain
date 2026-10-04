import { FurniturePhoto } from "./FurniturePhotoDTO";

// Mirrors backend/app/lifecycle.py STATUSES (checked by backend/tests/test_type_sync.py).
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

// What the donor sees. Mirrors backend/app/lifecycle.py DONOR_STAGES.
// Labels only: which stage an item is in, and what can be done, comes from the server.
export const DONOR_STAGES = [
  "submitted",
  "matched",
  "to_deliver",
  "in_delivery",
  "delivered",
  "cancelled",
] as const;

export type DonorStage = (typeof DONOR_STAGES)[number];

export const STAGE_LABELS: Record<DonorStage, string> = {
  submitted: "Submitted",
  matched: "Matched",
  to_deliver: "To deliver",
  in_delivery: "Delivery in progress",
  delivered: "Delivery complete",
  cancelled: "Cancelled",
};

// Matches the condition options on the donation form.
export const CONDITION_LABELS: Record<string, string> = {
  excellent: "Excellent condition",
  good: "Good condition",
  usable: "Usable",
  repair_needed: "Needs minor repair",
};

export type FurnitureAction =
  | "approve"
  | "reject"
  | "flag_for_review"
  | "cancel_request"
  | "edit";

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
  updatedAt?: string;
};

// What every /api/furniture endpoint returns (backend/app/lifecycle.py view()).
// The owner-only fields are present only for the owning donor and admins.
export type FurnitureView = Furniture & {
  donorStage: DonorStage;
  allowedActions: FurnitureAction[];
  submittedAt?: string;

  expectedDeliveryDate?: string;
  cancelReason?: string | null;
  statusChangedAt?: string;
  private?: {
    pickupAddress?: string;
  };
};

// GET /api/furniture/mine
export type MyFurnitureResponse = {
  items: FurnitureView[];
  counts: Record<DonorStage, number>;
};
