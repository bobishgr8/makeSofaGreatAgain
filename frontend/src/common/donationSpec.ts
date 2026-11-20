// What the donation form asks for each category (PRD EPIC 1: Donor Form).
// Category keys match backend/app/config.py CATEGORY_LABELS. The answers to
// `questions` are stored on the item as `details` (validated loosely by
// backend/app/validation.py validate_furniture).

// The five condition levels on the donation form. Older listings may still use
// excellent / usable / repair_needed; CONDITION_LABELS in FurnitureDTO.ts keeps
// labels for those.
export const CONDITION_OPTIONS = [
  { value: "like_new", label: "Like new" },
  { value: "good", label: "Good condition" },
  { value: "visible_wear", label: "Used with visible wear" },
  { value: "minor_defect", label: "Minor defect but still usable" },
  { value: "requires_repair", label: "Requires repair" },
] as const;

// The collect-by date must be at least this many days away (PRD: "minimum 3 days").
// Mirrors MIN_COLLECTION_DAYS in backend/app/furniture.py.
export const MIN_COLLECTION_DAYS = 3;

export type Details = Record<string, string>;

export type Question = {
  key: string;
  label: string;
  kind: "choice" | "number" | "text";
  options?: readonly string[];
  unit?: string;
  optional?: boolean;
  // Only asked when this returns true for the answers so far.
  showIf?: (details: Details) => boolean;
};

export type CategorySpec = {
  // Choices for the item type; "Others" lets the donor type their own.
  itemTypes?: readonly string[];
  // Brand and model are asked for every item; for these they are recommended.
  brandRecommended?: boolean;
  photoChecklist: readonly string[];
  questions: readonly Question[];
};

const WORKING = ["Yes", "Yes, with minor issues", "No", "Not sure"] as const;
const ASSEMBLY = ["Fully assembled", "Partially dismantled", "Fully dismantled"] as const;
const INSTRUCTIONS = ["Yes", "No", "Not required / straightforward"] as const;
const YES_NO = ["No", "Yes"] as const;

const issues: Question = {
  key: "issues",
  label: "If there are issues, please share more",
  kind: "text",
  optional: true,
};

const dismantled = (key: string) => (details: Details) =>
  Boolean(details[key]) && details[key] !== "Fully assembled";

export const HALAL_QUESTION: Question = {
  key: "halal",
  label: "Is the item halal?",
  kind: "choice",
  options: ["Halal", "Non-halal", "Not sure"],
};

export const CATEGORY_SPECS: Record<string, CategorySpec> = {
  washing_machine: {
    itemTypes: ["Top load", "Front load", "Dryer"],
    brandRecommended: true,
    photoChecklist: [
      "Full front view",
      "Inside drum",
      "Power plug",
      "Hoses / connections where relevant",
      "Model label if available",
      "Any visible defects",
    ],
    questions: [
      { key: "capacityKg", label: "What is the capacity?", kind: "number", unit: "kg" },
      { key: "working", label: "Is it working normally?", kind: "choice", options: WORKING },
      issues,
    ],
  },
  fridge: {
    itemTypes: ["Single door", "Two-door", "Side-by-side", "Others"],
    brandRecommended: true,
    photoChecklist: [
      "Full front view",
      "Inside fridge",
      "Freezer compartment",
      "Power plug",
      "Model label if available",
      "Any visible defects",
    ],
    questions: [
      { key: "capacityLitres", label: "What is the capacity?", kind: "number", unit: "litres", optional: true },
      { key: "working", label: "Is it working normally?", kind: "choice", options: WORKING },
      issues,
    ],
  },
  sofa: {
    itemTypes: ["1-seater", "2-seater", "3-seater", "L-shaped", "Others"],
    photoChecklist: [
      "Full front view",
      "Side view",
      "Seating surface",
      "Close-up of fabric",
      "Any stains or damage",
    ],
    questions: [
      { key: "seats", label: "How many seats?", kind: "number" },
      {
        key: "stainsOdoursPests",
        label: "Any stains, strong odours, mould or pest issues?",
        kind: "choice",
        options: YES_NO,
      },
      issues,
    ],
  },
  table: {
    itemTypes: ["Dining table", "Study desk", "Coffee table", "Others"],
    photoChecklist: ["Full item", "Tabletop", "Side view", "Legs / base", "Any damage"],
    questions: [],
  },
  chair: {
    itemTypes: ["Dining chair", "Office chair", "Armchair", "Others"],
    photoChecklist: ["Full item", "Seat and backrest", "Legs / base", "Any damage"],
    questions: [],
  },
  bed: {
    itemTypes: ["Single", "Super single", "Queen", "King", "Others"],
    photoChecklist: [
      "Full bed or bed frame",
      "Mattress surface, if included",
      "Frame / underside",
      "Any stains or damage",
    ],
    questions: [
      { key: "included", label: "What is included?", kind: "choice", options: ["Bed frame", "Mattress", "Both"] },
      {
        key: "stainsMouldBedbugs",
        label: "Any stains, mould, strong odours or history of bedbugs?",
        kind: "choice",
        options: YES_NO,
      },
      {
        key: "assembly",
        label: "Is the bed frame currently:",
        kind: "choice",
        options: ASSEMBLY,
        showIf: (details) => details.included === "Bed frame" || details.included === "Both",
      },
      {
        key: "instructions",
        label: "Are reassembly instructions available?",
        kind: "choice",
        options: INSTRUCTIONS,
        showIf: (details) =>
          (details.included === "Bed frame" || details.included === "Both") && dismantled("assembly")(details),
      },
      issues,
    ],
  },
  storage: {
    itemTypes: ["Wardrobe", "Cabinet", "Bookshelf", "Chest of drawers", "Others"],
    photoChecklist: ["Front view", "Inside", "Side view", "Doors / shelves / drawers", "Any damage"],
    questions: [
      { key: "assembly", label: "Is the item currently:", kind: "choice", options: ASSEMBLY },
      {
        key: "instructions",
        label: "Are reassembly instructions available?",
        kind: "choice",
        options: INSTRUCTIONS,
        showIf: dismantled("assembly"),
      },
    ],
  },
  other: {
    photoChecklist: ["Full item", "Close-up of any wear", "Any damage"],
    questions: [],
  },
};

export function specFor(category: string): CategorySpec {
  return CATEGORY_SPECS[category] ?? CATEGORY_SPECS.other;
}

// Every question that applies to these answers, halal last (asked for all types).
export function questionsFor(category: string, details: Details): Question[] {
  return [...specFor(category).questions, HALAL_QUESTION].filter(
    (question) => !question.showIf || question.showIf(details),
  );
}

// The answers that still apply, so a hidden follow-up is not submitted.
export function applicableDetails(category: string, details: Details): Details {
  const keys = new Set(questionsFor(category, details).map((question) => question.key));
  return Object.fromEntries(
    Object.entries(details).filter(([key, value]) => keys.has(key) && value.trim() !== ""),
  );
}

// The first unanswered required question, or "" when all are answered.
export function missingDetail(category: string, details: Details): string {
  const missing = questionsFor(category, details).find(
    (question) => !question.optional && !(details[question.key] ?? "").trim(),
  );
  return missing ? missing.label : "";
}

// The item's type, brand, model and answers as label/value rows for detail pages.
export function itemFacts(item: {
  category?: string;
  subcategory?: string | null;
  brand?: string | null;
  modelNumber?: string | null;
  details?: Record<string, string | number | boolean> | null;
}): Array<{ label: string; value: string }> {
  const labels = new Map(
    [...specFor(item.category ?? "").questions, HALAL_QUESTION].map((question) => [
      question.key,
      question.unit ? `${question.label.replace(/\?$/, "")} (${question.unit})` : question.label,
    ]),
  );
  const facts = [
    { label: "Type", value: item.subcategory ?? "" },
    { label: "Brand", value: item.brand ?? "" },
    { label: "Model number", value: item.modelNumber ?? "" },
    ...Object.entries(item.details ?? {}).map(([key, value]) => ({
      label: labels.get(key) ?? key,
      value: typeof value === "boolean" ? (value ? "Yes" : "No") : String(value),
    })),
  ];
  return facts.filter((fact) => fact.value.trim() !== "");
}
