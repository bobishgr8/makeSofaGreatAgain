import { Link } from "react-router-dom";

import { StageIcon } from "../../../common/components/StatusBadge";
import type { FurnitureView } from "../../../common/dto/FurnitureDTO";
import { primaryPhoto } from "../useDonorFurniture";

// State 5: the furniture has reached its new home.
export default function DeliveredView({ item }: { item: FurnitureView }) {
  const photo = primaryPhoto(item);

  return (
    <>
      <div className="delivery-hero">
        <StageIcon stage="delivered" size={96} />
        <h1>Success!</h1>
        <h2>Delivery complete</h2>
        <p>Thank you for making a difference!</p>
      </div>

      <div className="info-card delivery-item stacked">
        {photo && <img className="donation-row-photo" src={photo.url} alt="" />}
        <strong>{item.title}</strong>
      </div>

      <Link className="button block" to="/donor">
        Done
      </Link>
    </>
  );
}
