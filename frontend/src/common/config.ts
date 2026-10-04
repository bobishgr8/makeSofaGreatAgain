import type { Draft } from "./dto/DraftDTO";

export type CategoryLabels = Record<string, string>;

// Fallback values used only until GET /api/config resolves (or if it fails).
// The server (backend/app/config.py) is the source of truth — do not hardcode
// copies of these lists anywhere else in the app.
export const defaultCategoryLabels: CategoryLabels = {
  sofa: "sofa",
  table: "table",
  chair: "chair",
  bed: "bed",
  storage: "storage unit",
  other: "furniture item",
};

export const defaultNeighbourhoods: string[] = [
  "Ang Mo Kio",
  "Bedok",
  "Bishan",
  "Bukit Batok",
  "Bukit Merah",
  "Bukit Panjang",
  "Bukit Timah",
  "Choa Chu Kang",
  "Clementi",
  "Geylang",
  "Hougang",
  "Jurong East",
  "Jurong West",
  "Kallang",
  "Marine Parade",
  "Pasir Ris",
  "Punggol",
  "Queenstown",
  "Sembawang",
  "Sengkang",
  "Serangoon",
  "Tampines",
  "Toa Payoh",
  "Woodlands",
  "Yishun",
];

export const defaultInitialDraft = (): Draft => ({
  title: "",
  category: "",
  subcategory: "",
  condition: "",
  conditionNotes: "",
  quantity: 1,
  widthCm: "",
  depthCm: "",
  heightCm: "",
  neighbourhood: "",
  pickupAddress: "",
  expectedDeliveryDate: "",
  floor: "",
  hasLift: "",
  fitsInLift: "",
  disassembly: "",
  delivery: "",
  deadlineType: "flexible",
  collectionDeadline: "",
  availability: [],
  contactName: "",
  whatsapp: "",
  safeToUse: false,
  offeredFree: false,
  contactConsent: false,
});
