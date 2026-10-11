import { useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";

import Button from "../../common/components/Button";
import FormField from "../../common/components/FormField";
import LoadingSpinner from "../../common/components/LoadingSpinner";
import type { FurnitureAction } from "../../common/dto/FurnitureDTO";
import { useFurnitureAction } from "../../common/hooks/useFurnitureAction";
import { primaryPhoto, useDonorFurniture } from "./useDonorFurniture";
import "./DonorFurniture.css";

const REASON_MAX_LEN = 500;
const CANCEL_ACTIONS: FurnitureAction[] = ["cancel_request", "cancel_donation", "cancel_delivery"];

// Nothing is cancelled until Submit. Retry goes back without cancelling.
export default function CancelView() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { item, loading } = useDonorFurniture(id);
  const [reason, setReason] = useState("");

  const action = params.get("action") as FurnitureAction | null;
  const backToItem = () => navigate(`/donor/furniture/${id}`, { replace: true });
  const { run, pending, error } = useFurnitureAction(
    { id: id ?? "", status: item?.status ?? "pending_review" },
    backToItem,
  );

  if (loading) return <LoadingSpinner />;
  if (!item || !action || !CANCEL_ACTIONS.includes(action) || !item.allowedActions.includes(action)) {
    return <Navigate to={`/donor/furniture/${id}`} replace />;
  }

  const photo = primaryPhoto(item);

  return (
    <main className="donor-item">
      <h1>We are sorry to hear about the cancellation.</h1>

      <div className="info-card">
        {photo && (
          <img className="donation-row-photo" src={photo.url} alt="" />
        )}
        <div>
          <strong>{item.title}</strong>
        </div>
      </div>

      <form
        className="donor-item-form"
        onSubmit={(event) => {
          event.preventDefault();
          run(action, { reason: reason.trim() });
        }}
      >
        <FormField label="Let us know why">
          <textarea
            value={reason}
            maxLength={REASON_MAX_LEN}
            onChange={(event) => setReason(event.target.value)}
            required
          />
        </FormField>
        {error && <p className="error-text">{error}</p>}
        <Button type="submit" className="block" disabled={!reason.trim() || pending}>
          {pending ? "Submitting..." : "Submit"}
        </Button>
        <Button type="button" className="secondary block" onClick={() => navigate(-1)}>
          Retry
        </Button>
      </form>
    </main>
  );
}
