import type { ComponentType } from "react";
import { Link, useParams } from "react-router-dom";

import LoadingSpinner from "../../common/components/LoadingSpinner";
import type { DonorStage } from "../../common/dto/FurnitureDTO";
import CancelledView from "./states/CancelledView";
import DeliveredView from "./states/DeliveredView";
import InDeliveryView from "./states/InDeliveryView";
import MatchedView from "./states/MatchedView";
import SubmittedView from "./states/SubmittedView";
import ToDeliverView from "./states/ToDeliverView";
import { useDonorFurniture, type StageViewProps } from "./useDonorFurniture";
import "./DonorFurniture.css";

// One screen per stage. A Record, so adding a stage without a screen fails to compile.
const STAGE_VIEWS: Record<DonorStage, ComponentType<StageViewProps>> = {
  submitted: SubmittedView,
  matched: MatchedView,
  to_deliver: ToDeliverView,
  in_delivery: InDeliveryView,
  delivered: DeliveredView,
  cancelled: CancelledView,
};

// These screens open with their own headline instead of the item's title.
const OWN_HEADLINE: DonorStage[] = ["in_delivery", "delivered"];

// One route for every delivery state: the server says which stage the item is
// in (donorStage) and what can be done (allowedActions).
export default function FurnitureDetail() {
  const { id } = useParams<{ id: string }>();
  const { item, setItem, loading, error } = useDonorFurniture(id);

  if (loading) return <LoadingSpinner />;

  const StageView = item && STAGE_VIEWS[item.donorStage];

  return (
    <main className="donor-item">
      <Link className="donor-item-back" to="/donor">
        ‹ Your donations
      </Link>

      {!item || !StageView ? (
        <p className="error-text">{error || "We could not find this donation."}</p>
      ) : (
        <>
          {!OWN_HEADLINE.includes(item.donorStage) && <h1>{item.title}</h1>}
          <StageView item={item} onChange={setItem} />
        </>
      )}
    </main>
  );
}
