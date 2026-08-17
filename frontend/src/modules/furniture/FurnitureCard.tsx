import Card from "../../common/components/Card";
import StatusBadge from "../../common/components/StatusBadge";
import type { Furniture } from "./FurnitureDTO";

export default function FurnitureCard({
  item,
  onClick,
}: {
  item: Furniture;
  onClick?: (item: Furniture) => void;
}) {
  const primaryPhoto =
    item.photos?.find((photo) => photo.isPrimary) ??
    item.photos?.[0];

  const dimensions = item.dimensionsCm;

  const dimensionLabel =
    dimensions?.width != null &&
    dimensions?.height != null &&
    dimensions?.depth != null
      ? `${dimensions.width} × ${dimensions.height} × ${dimensions.depth} cm`
      : null;

  return (
    <div
      onClick={() => onClick?.(item)}
      style={{ cursor: "pointer" }}
    >
      <Card>
        {primaryPhoto && (
          <img
            src={primaryPhoto.url}
            alt={item.title}
            className="furniture-card-image"
          />
        )}

        <div className="furniture-card-content">
          <div className="furniture-card-heading">
            <h2>{item.title}</h2>
            <StatusBadge status={item.condition} />
          </div>

          <p>
            {item.subcategory ?? item.category} ·{" "}
            {item.location?.district ?? "ReFurbish network"}
          </p>

          {dimensionLabel && (
            <small>{dimensionLabel}</small>
          )}
        </div>
      </Card>
    </div>
  );
}