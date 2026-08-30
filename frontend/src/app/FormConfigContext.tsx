import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

import { api } from "../common/api";
import type { Draft } from "../common/dto/DraftDTO";
import {
  defaultCategoryLabels,
  defaultInitialDraft,
  defaultNeighbourhoods,
  type CategoryLabels,
} from "../common/config";

type FormFieldKey = keyof Draft | "photos";

export type FormConfig = Record<FormFieldKey, boolean>;

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

type ServerFormConfig = {
  categoryLabels?: CategoryLabels;
  neighbourhoods?: string[];
  initialDraft?: Draft;
  formFields?: Partial<FormConfig>;
};

type FormConfigContextValue = {
  // Platform-wide donor form field visibility. Stored server-side
  // (backend/app/config.py, Firestore `platformConfig/formFields`) since it
  // is meant to apply to every donor, not just the admin's own browser.
  // Reading it is open to anyone; only admins can write via setField/toggleField.
  config: FormConfig;
  setField: (key: FormFieldKey, value: boolean) => Promise<void>;
  toggleField: (key: FormFieldKey) => Promise<void>;
  categoryLabels: CategoryLabels;
  neighbourhoods: string[];
  initialDraft: Draft;
  configLoading: boolean;
};

const FormConfigContext = createContext<FormConfigContextValue | null>(null);

export function FormConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<FormConfig>(defaultFormConfig);
  const [categoryLabels, setCategoryLabels] = useState<CategoryLabels>(
    defaultCategoryLabels,
  );
  const [neighbourhoods, setNeighbourhoods] = useState<string[]>(
    defaultNeighbourhoods,
  );
  const [initialDraft, setInitialDraft] = useState<Draft>(
    defaultInitialDraft(),
  );
  const [configLoading, setConfigLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    api<ServerFormConfig>("/api/config")
      .then((data) => {
        if (!mounted) return;
        if (data.categoryLabels) setCategoryLabels(data.categoryLabels);
        if (data.neighbourhoods) setNeighbourhoods(data.neighbourhoods);
        if (data.initialDraft) setInitialDraft(data.initialDraft);
        if (data.formFields) {
          setConfig((current) => ({ ...current, ...data.formFields }));
        }
      })
      .catch(() => {
        // Keep defaults if the server config can't be loaded.
      })
      .finally(() => {
        if (mounted) setConfigLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  async function setField(key: FormFieldKey, value: boolean) {
    const previous = config[key];
    setConfig((current) => ({ ...current, [key]: value }));

    try {
      const updated = await api<FormConfig>("/api/config/form-fields", {
        method: "PATCH",
        body: JSON.stringify({ [key]: value }),
      });
      setConfig((current) => ({ ...current, ...updated }));
    } catch (err) {
      console.error("Failed to update form field visibility:", err);
      setConfig((current) => ({ ...current, [key]: previous }));
    }
  }

  function toggleField(key: FormFieldKey) {
    return setField(key, !config[key]);
  }

  return (
    <FormConfigContext.Provider
      value={{
        config,
        setField,
        toggleField,
        categoryLabels,
        neighbourhoods,
        initialDraft,
        configLoading,
      }}
    >
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
