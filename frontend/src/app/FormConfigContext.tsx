import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import type { Draft } from "../modules/furniture/types";

type FormFieldKey = keyof Draft | "photos";

export type FormConfig = Record<FormFieldKey, boolean>;

const STORAGE_KEY = "refurbish-form-config";

const defaultFormConfig: FormConfig = {
  category: true,
  subcategory: true,
  title: true,
  condition: true,
  conditionNotes: true,
  quantity: true,
  widthCm: true,
  depthCm: true,
  heightCm: true,
  neighbourhood: true,
  floor: true,
  hasLift: true,
  fitsInLift: true,
  disassembly: true,
  delivery: true,
  deadlineType: true,
  collectionDeadline: true,
  availability: true,
  contactName: true,
  whatsapp: true,
  safeToUse: true,
  offeredFree: true,
  contactConsent: true,
  photos: true,
};

type FormConfigContextValue = {
  config: FormConfig;
  setField: (key: FormFieldKey, value: boolean) => void;
  toggleField: (key: FormFieldKey) => void;
};

const FormConfigContext = createContext<FormConfigContextValue | null>(null);

export function FormConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<FormConfig>(() => {
    if (typeof window === "undefined") return defaultFormConfig;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return { ...defaultFormConfig, ...JSON.parse(stored) };
    } catch {
      // ignore invalid storage content
    }
    return defaultFormConfig;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch {
      // ignore storage errors in restrictive environments
    }
  }, [config]);

  const setField = (key: FormFieldKey, value: boolean) => {
    setConfig((current) => ({ ...current, [key]: value }));
  };

  const toggleField = (key: FormFieldKey) => {
    setConfig((current) => ({ ...current, [key]: !current[key] }));
  };

  return (
    <FormConfigContext.Provider value={{ config, setField, toggleField }}>
      {children}
    </FormConfigContext.Provider>
  );
}

export function useFormConfig() {
  const context = useContext(FormConfigContext);
  if (!context)
    throw new Error("useFormConfig must be used inside FormConfigProvider");
  return context;
}
