import { FurniturePhoto } from "./FurniturePhotoDTO";

// Mirrors backend/app/lifecycle.py STATUSES (checked by backend/tests/test_type_sync.py).
export const FURNITURE_STATUSES = [
  "pending_review",
  "available",
  "rejected",
  "matched",
  "to_deliver",
  "in_delivery",
  "delivered",
  "collected",
  "withdrawn",
] as const;

export type FurnitureStatus = (typeof FURNITURE_STATUSES)[number];

export const FURNITURE_STATUS_LABELS: Record<FurnitureStatus, string> = {
  pending_review: "Needs review",
  available: "Approved",
  rejected: "Rejected",
  matched: "Matched",
  to_deliver: "To deliver",
  in_delivery: "Delivery in progress",
  delivered: "Delivered",
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

// Everything allowedActions can contain. Mirrors backend/app/lifecycle.py
// CLIENT_ACTIONS (checked by backend/tests/test_type_sync.py).
export const FURNITURE_ACTIONS = [
  "approve",
  "reject",
  "flag_for_review",
  "cancel_request",
  "accept_match",
  "connect",
  "rematch",
  "cancel_donation",
  "release_match",
  "arrange_delivery",
  "propose_logistics",
  "confirm_logistics",
  "rearrange_logistics",
  "complete_delivery",
  "cancel_delivery",
  "edit",
] as const;

export type FurnitureAction = (typeof FURNITURE_ACTIONS)[number];

// The donor arranging transport themselves, rather than one of the priced
// providers (backend/app/lifecycle.py OWN_LOGISTICS).
export const OWN_LOGISTICS = "own";

export function providerLabel(provider: string) {
  return provider === OWN_LOGISTICS ? "Own transport" : provider;
}

// What propose_logistics takes: the State 3 form.
export type LogisticsRequest = {
  provider: string;
  pickupAddress: string;
  deliveryAddress: string;
  deliveryDate: string;
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
  cancelKind?: CancelKind;
  statusChangedAt?: string;
  matchSummary?: MatchSummary;
  private?: {
    pickupAddress?: string;
    // The beneficiary's address, kept only while a delivery is being arranged.
    deliveryAddress?: string | null;
  };
};

// Why a cancelled donation was cancelled (backend/app/lifecycle.py cancel_kind()).
export type CancelKind = "donor" | "rejected" | "no_match" | "no_connect";

// The active match, as the donor, the matched social worker or an admin sees it.
export type MatchSummary = {
  organisation?: string;
  matchedAt?: string;
  connectBy?: string;
  connectedAt?: string | null;
  connected: boolean;
  overdue: boolean;
  // Donor and admins only: the social worker's WhatsApp number.
  whatsapp?: string;
  // Social worker and admins only.
  caseId?: string;
  // The delivery details the donor sent; absent until they do (State 3).
  logistics?: {
    provider: string;
    deliveryDate: string;
    proposedAt?: string;
    confirmedAt?: string;
  };
};

// GET /api/furniture/mine
export type MyFurnitureResponse = {
  items: FurnitureView[];
  counts: Record<DonorStage, number>;
};
