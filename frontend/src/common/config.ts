import { api } from "./api";

export type CategoryLabels = Record<string, string>;

export const defaultCategoryLabels: CategoryLabels = {
  sofa: "sofa",
  table: "table",
  chair: "chair",
  bed: "bed",
  washing_machine: "washing machine",
  fridge: "fridge",
  storage: "storage unit",
  other: "furniture item",
};

export const defaultNeighbourhoods = [
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

export const defaultInitialDraft = () => ({
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
  floor: "",
  hasLift: "",
  fitsInLift: "",
  disassembly: "",
  delivery: "",
  deadlineType: "flexible",
  collectionDeadline: "",
  availability: [] as string[],
  contactName: "",
  whatsapp: "",
  safeToUse: false,
  offeredFree: false,
  contactConsent: false,
});

let serverConfig: {
  categoryLabels?: CategoryLabels;
  neighbourhoods?: string[];
  initialDraft?: ReturnType<typeof defaultInitialDraft>;
} | null = null;

export async function fetchServerConfig() {
  try {
    const data = await api<any>("/api/config");
    serverConfig = data;
    return serverConfig;
  } catch (err) {
    // fallback to defaults on failure
    serverConfig = null;
    return null;
  }
}

export function getCategoryLabels(): CategoryLabels {
  return serverConfig?.categoryLabels ?? defaultCategoryLabels;
}

export function getNeighbourhoods(): string[] {
  return serverConfig?.neighbourhoods ?? defaultNeighbourhoods;
}

export function getInitialDraft() {
  return serverConfig?.initialDraft ?? defaultInitialDraft();
}
