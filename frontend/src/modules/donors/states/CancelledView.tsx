import StatusBadge from "../../../common/components/StatusBadge";
import { formatDate } from "../../../common/dates";
import type { FurnitureView } from "../../../common/dto/FurnitureDTO";
import { primaryPhoto } from "../useDonorFurniture";
import { DetailsCard } from "./SubmittedView";

function cancelledMessage(item: FurnitureView) {
  if (item.status === "rejected") return "Not accepted after review.";
  if (item.cancelReason === "no_match")
    return "We couldn't find a match before your expected delivery date.";
  return "You cancelled this donation.";
}

export default function CancelledView({ item }: { item: FurnitureView }) {
  const photo = primaryPhoto(item);
  const showReason = item.cancelReason && item.cancelReason !== "no_match";

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
          <strong>{cancelledMessage(item)}</strong>
          {showReason && <p>Reason: {item.cancelReason}</p>}
        </div>
      </div>

      <DetailsCard item={item} />
    </>
  );
}
