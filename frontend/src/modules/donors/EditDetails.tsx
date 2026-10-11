import { FormEvent, useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";

import Button from "../../common/components/Button";
import FormField from "../../common/components/FormField";
import LoadingSpinner from "../../common/components/LoadingSpinner";
import { api, ApiError } from "../../common/api";
import { todaySgt } from "../../common/dates";
import { CONDITION_LABELS, type FurnitureView } from "../../common/dto/FurnitureDTO";
import { useDonorFurniture } from "./useDonorFurniture";
import "./DonorFurniture.css";

type EditDraft = {
  title: string;
  condition: string;
  conditionNotes: string;
  heightCm: string;
  widthCm: string;
  depthCm: string;
  pickupAddress: string;
  expectedDeliveryDate: string;
};

function draftFrom(item: FurnitureView): EditDraft {
  return {
    title: item.title ?? "",
    condition: item.condition ?? "",
    conditionNotes: item.conditionNotes ?? "",
    heightCm: String(item.dimensionsCm?.height ?? ""),
    widthCm: String(item.dimensionsCm?.width ?? ""),
    depthCm: String(item.dimensionsCm?.depth ?? ""),
    pickupAddress: item.private?.pickupAddress ?? "",
    expectedDeliveryDate: item.expectedDeliveryDate ?? "",
  };
}

// Mirrors CONTENT_FIELDS in backend/app/lifecycle.py, only to show the warning;
// the server decides whether the item goes back for review.
function contentChanged(before: EditDraft, after: EditDraft) {
  return (["title", "condition", "conditionNotes", "heightCm", "widthCm", "depthCm"] as const).some(
    (key) => before[key] !== after[key],
  );
}

export default function EditDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { item, setItem, loading } = useDonorFurniture(id);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (item) setDraft(draftFrom(item));
  }, [item]);

  if (loading || (item && !draft)) return <LoadingSpinner />;
  if (!item || !draft || !item.allowedActions.includes("edit")) {
    return <Navigate to={`/donor/furniture/${id}`} replace />;
  }

  const original = draftFrom(item);
  const willReview = item.status === "available" && contentChanged(original, draft);

  function update<K extends keyof EditDraft>(key: K, value: EditDraft[K]) {
    setDraft((current) => current && { ...current, [key]: value });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !item) return;
    if (!draft.pickupAddress.trim() || !draft.expectedDeliveryDate) {
      return setError("Add a pick-up address and an expected delivery date.");
    }

    // Send only what changed, so an untouched field never triggers a re-review.
    const changes: Record<string, unknown> = {};
    for (const key of ["title", "condition", "conditionNotes", "expectedDeliveryDate"] as const) {
      if (draft[key] !== original[key]) changes[key] = draft[key];
    }
    if (draft.pickupAddress.trim() !== original.pickupAddress) {
      changes.pickupAddress = draft.pickupAddress.trim();
    }
    if (
      draft.heightCm !== original.heightCm ||
      draft.widthCm !== original.widthCm ||
      draft.depthCm !== original.depthCm
    ) {
      changes.dimensionsCm = {
        height: Number(draft.heightCm),
        width: Number(draft.widthCm),
        depth: Number(draft.depthCm),
      };
    }
    if (Object.keys(changes).length === 0) {
      return navigate(`/donor/furniture/${item.id}`, { replace: true });
    }

    setSaving(true);
    setError("");
    try {
      await api<FurnitureView>(`/api/furniture/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify(changes),
      });
      navigate(`/donor/furniture/${item.id}`, { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        setError("This donation was matched in the meantime, so it can no longer be edited.");
        api<FurnitureView>(`/api/furniture/${item.id}`).then(setItem).catch(() => {});
      } else {
        setError(caught instanceof Error ? caught.message : "We could not save your changes.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="donor-item">
      <Link className="donor-item-back" to={`/donor/furniture/${item.id}`}>
        ‹ Back
      </Link>
      <h1>Edit details</h1>

      <form className="donor-item-form" onSubmit={save}>
        <FormField label="Listing title">
          <input value={draft.title} onChange={(e) => update("title", e.target.value)} required />
        </FormField>

        <FormField label="Condition">
          <select value={draft.condition} onChange={(e) => update("condition", e.target.value)} required>
            {Object.entries(CONDITION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Honest condition note">
          <textarea value={draft.conditionNotes} onChange={(e) => update("conditionNotes", e.target.value)} />
        </FormField>

        <div className="form-grid">
          <FormField label="Height (cm)">
            <input type="number" min="1" value={draft.heightCm} onChange={(e) => update("heightCm", e.target.value)} />
          </FormField>
          <FormField label="Width (cm)">
            <input type="number" min="1" value={draft.widthCm} onChange={(e) => update("widthCm", e.target.value)} />
          </FormField>
          <FormField label="Depth (cm)">
            <input type="number" min="1" value={draft.depthCm} onChange={(e) => update("depthCm", e.target.value)} />
          </FormField>
        </div>

        <FormField label="Pick-up address">
          <input
            value={draft.pickupAddress}
            maxLength={200}
            onChange={(e) => update("pickupAddress", e.target.value)}
            required
          />
        </FormField>

        <FormField label="Expected delivery date">
          <input
            type="date"
            min={todaySgt()}
            value={draft.expectedDeliveryDate}
            onChange={(e) => update("expectedDeliveryDate", e.target.value)}
            required
          />
        </FormField>

        {willReview && (
          <p className="donor-item-note">
            This will be reviewed again before it is shown to social workers.
          </p>
        )}
        {error && <p className="error-text">{error}</p>}

        <Button type="submit" className="block" disabled={saving}>
          {saving ? "Saving..." : "Save changes"}
        </Button>
      </form>
    </main>
  );
}
