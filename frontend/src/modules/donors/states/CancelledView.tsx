import StatusBadge from "../../../common/components/StatusBadge";
import { formatDate } from "../../../common/dates";
import type { CancelKind, FurnitureView } from "../../../common/dto/FurnitureDTO";
import { primaryPhoto } from "../useDonorFurniture";
import { DetailsCard } from "./SubmittedView";

const CANCELLED_MESSAGES: Record<CancelKind, string> = {
  donor: "You cancelled this donation.",
  rejected: "Not accepted after review.",
  no_match: "We couldn't find a match before your expected delivery date.",
  no_connect: "This match closed because we didn't hear from you within 5 days.",
};

export default function CancelledView({ item }: { item: FurnitureView }) {
  const photo = primaryPhoto(item);
  const kind = item.cancelKind ?? "donor";
  // The system's reasons are codes, not something a person wrote.
  const showReason = item.cancelReason && (kind === "donor" || kind === "rejected");

  return (
    <>
      <div className="donor-item-summary">
        {photo ? (
          <img className="donor-item-photo" src={photo.url} alt={item.title} />
        ) : (
          <div className="donor-item-photo" />
        )}
        <div className="donor-item-status">
          <StatusBadge stage="cancelled" />
          {item.statusChangedAt && <small>Cancelled on {formatDate(item.statusChangedAt)}</small>}
        </div>
      </div>

      <div className="info-card">
        <div>
          <strong>{CANCELLED_MESSAGES[kind]}</strong>
          {showReason && <p>Reason: {item.cancelReason}</p>}
        </div>
      </div>

      <DetailsCard item={item} />
    </>
  );
}
