import { Link, useNavigate } from "react-router-dom";

import Button from "../../../common/components/Button";
import StatusBadge from "../../../common/components/StatusBadge";
import { formatDate } from "../../../common/dates";
import { CONDITION_LABELS, type FurnitureView } from "../../../common/dto/FurnitureDTO";
import { dimensionsLabel, primaryPhoto } from "../useDonorFurniture";

// State 1: the donation is in (pending review or approved); no match yet.
export default function SubmittedView({ item }: { item: FurnitureView }) {
  const navigate = useNavigate();
  const photo = primaryPhoto(item);

  return (
    <>
      <div className="donor-item-summary">
        {photo ? (
          <img className="donor-item-photo" src={photo.url} alt={item.title} />
        ) : (
          <div className="donor-item-photo" />
        )}
        <div className="donor-item-status">
          <StatusBadge stage="submitted" />
          {item.submittedAt && <small>Submitted on {formatDate(item.submittedAt)}</small>}
        </div>
      </div>

      <div className="info-card">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <div>
          <strong>Match details</strong>
          <p>We are looking for a match. Stay tuned!</p>
        </div>
      </div>

      {item.allowedActions.includes("cancel_request") && (
        <Button
          type="button"
          className="secondary block"
          onClick={() => navigate(`/donor/furniture/${item.id}/cancel?action=cancel_request`)}
        >
          Cancel request
        </Button>
      )}

      <DetailsCard item={item} />
    </>
  );
}

export function DetailsCard({ item }: { item: FurnitureView }) {
  return (
    <section className="donor-item-details">
      <header>
        <h2>Details</h2>
        {item.allowedActions.includes("edit") && (
          <Link to={`/donor/furniture/${item.id}/edit`}>Edit</Link>
        )}
      </header>
      <DetailRow label="Condition" value={CONDITION_LABELS[item.condition] ?? item.condition} />
      <DetailRow label="Dimensions" value={dimensionsLabel(item)} />
      <DetailRow label="Pick up location" value={item.private?.pickupAddress} />
      <DetailRow label="Expected delivery date" value={formatDate(item.expectedDeliveryDate)} />
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <strong>{value || "Not provided"}</strong>
    </div>
  );
}
