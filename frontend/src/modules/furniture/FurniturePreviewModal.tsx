import type { Furniture } from "../../common/dto/FurnitureDTO";
import StatusBadge from "../../common/components/StatusBadge";

type Props = {
  item: Furniture;
  onClose: () => void;
};

export default function FurniturePreviewModal({
  item,
  onClose,
}: Props) {
  const primaryPhoto =
    item.photos?.find((photo) => photo.isPrimary) ??
    item.photos?.[0];

  const dimensions = item.dimensionsCm;

  const dimensionLabel =
    dimensions?.width != null &&
    dimensions?.height != null &&
    dimensions?.depth != null
      ? `${dimensions.width} x ${dimensions.height} x ${dimensions.depth} cm`
      : null;

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
    >
      <div
        className="furniture-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          className="modal-close"
          onClick={onClose}
          aria-label="Close"
        >
          X
        </button>

        {primaryPhoto && (
          <img
            src={primaryPhoto.url}
            alt={item.title}
            className="furniture-modal-image"
          />
        )}

        <div className="furniture-modal-content">
          <div className="furniture-modal-heading">
            <div>
              <h2>{item.title}</h2>

              <p>
                {item.subcategory ?? item.category}
              </p>
            </div>

            <StatusBadge status={item.status} />
          </div>

          <p>
            {item.location?.district ?? "ReFurbish network"}
          </p>

          {item.conditionNotes && (
            <p>{item.conditionNotes}</p>
          )}

          <div className="furniture-modal-details">
            {dimensionLabel && (
              <DetailRow
                label="Dimensions"
                value={dimensionLabel}
              />
            )}

            <DetailRow
              label="Quantity"
              value={String(item.quantity)}
            />

            <DetailRow
              label="Availability"
              value={item.collection?.availability?.join(", ")}
            />

            <DetailRow
              label="Delivery"
              value={
                item.collection?.donorCanDeliver
                  ? "Delivery available"
                  : "Collection required"
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value?: string;
}) {
  if (!value) return null;

  return (
    <div className="detail-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}