import { Link, useParams } from "react-router-dom";

import LoadingSpinner from "../../common/components/LoadingSpinner";
import StatusBadge from "../../common/components/StatusBadge";
import CancelledView from "./states/CancelledView";
import SubmittedView from "./states/SubmittedView";
import { useDonorFurniture } from "./useDonorFurniture";
import "./DonorFurniture.css";

// One route for every delivery state: the server says which stage the item is
// in (donorStage) and what can be done (allowedActions).
export default function FurnitureDetail() {
  const { id } = useParams<{ id: string }>();
  const { item, loading, error } = useDonorFurniture(id);

  if (loading) return <LoadingSpinner />;

  return (
    <main className="donor-item">
      <Link className="donor-item-back" to="/donor">
        ‹ Your donations
      </Link>

      {!item ? (
        <p className="error-text">{error || "We could not find this donation."}</p>
      ) : (
        <>
          <h1>{item.title}</h1>
          {item.donorStage === "submitted" && <SubmittedView item={item} />}
          {item.donorStage === "cancelled" && <CancelledView item={item} />}
          {item.donorStage !== "submitted" && item.donorStage !== "cancelled" && (
            <>
              <StatusBadge stage={item.donorStage} />
              <p className="donor-item-note">
                More detail for this stage is coming soon.
              </p>
            </>
          )}
        </>
      )}
    </main>
  );
}
