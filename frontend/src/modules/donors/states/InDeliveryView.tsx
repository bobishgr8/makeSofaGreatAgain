import { useNavigate } from "react-router-dom";

import Button from "../../../common/components/Button";
import { StageIcon } from "../../../common/components/StatusBadge";
import { useFurnitureAction } from "../../../common/hooks/useFurnitureAction";
import { primaryPhoto, type StageViewProps } from "../useDonorFurniture";

// State 4: the social worker confirmed the delivery details. The provider does
// the moving; either side says when it is done.
export default function InDeliveryView({ item, onChange }: StageViewProps) {
  const navigate = useNavigate();
  const { run, pending, error } = useFurnitureAction(item, onChange);
  const photo = primaryPhoto(item);

  return (
    <>
      <div className="delivery-hero">
        <StageIcon stage="in_delivery" size={96} />
        <h1>Delivery is in progress!</h1>
        <p>
          Thank you for arranging for the delivery of the furniture and making a difference!
        </p>
      </div>

      <div className="info-card delivery-item">
        {photo && <img className="donation-row-photo" src={photo.url} alt="" />}
        <strong>{item.title}</strong>
      </div>

      <div className="info-card">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 8h.01" />
        </svg>
        <div>
          <p>
            Please refer to your selected logistics service provider for delivery details
            and updates.
          </p>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      {item.allowedActions.includes("complete_delivery") && (
        <Button
          type="button"
          className="block"
          disabled={pending}
          onClick={() => run("complete_delivery")}
        >
          {pending ? "Working..." : "Delivery complete"}
        </Button>
      )}

      {item.allowedActions.includes("cancel_delivery") && (
        <Button
          type="button"
          className="secondary block"
          onClick={() => navigate(`/donor/furniture/${item.id}/cancel?action=cancel_delivery`)}
        >
          Cancel delivery
        </Button>
      )}
    </>
  );
}
