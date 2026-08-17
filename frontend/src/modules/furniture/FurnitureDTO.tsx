import { FurniturePhoto } from "./FurniturePhotoDTO";

export type Furniture = {
  id: string;
  schemaVersion?: number;

  title: string;
  category: string;
  subcategory?: string;

  condition: string;
  conditionNotes?: string;

  quantity: number;
  status: string;

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