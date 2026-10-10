import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useFormConfig } from "../../../app/FormConfigContext";
import Button from "../../../common/components/Button";
import FormField from "../../../common/components/FormField";
import StatusBadge from "../../../common/components/StatusBadge";
import { formatDate, todaySgt } from "../../../common/dates";
import {
  OWN_LOGISTICS,
  providerLabel,
  type LogisticsRequest,
} from "../../../common/dto/FurnitureDTO";
import { useFurnitureAction } from "../../../common/hooks/useFurnitureAction";
import { primaryPhoto, type StageViewProps } from "../useDonorFurniture";
import { DetailRow } from "./SubmittedView";

const ADDRESS_MAX_LEN = 200;

// State 3: the donor and the social worker are connected. 3a is the form below;
// 3b, once it is sent, waits for the social worker to confirm or ask again.
export default function ToDeliverView({ item, onChange }: StageViewProps) {
  const navigate = useNavigate();
  const { logisticsEstimates } = useFormConfig();
  const { run, pending, error } = useFurnitureAction(item, onChange);
  const today = todaySgt();
  const [draft, setDraft] = useState<LogisticsRequest>(() => ({
    provider: "",
    pickupAddress: item.private?.pickupAddress ?? "",
    // Still there when the social worker asks for the details again.
    deliveryAddress: item.private?.deliveryAddress ?? "",
    deliveryDate:
      item.expectedDeliveryDate && item.expectedDeliveryDate >= today
        ? item.expectedDeliveryDate
        : "",
  }));

  const photo = primaryPhoto(item);
  const organisation = item.matchSummary?.organisation || "a partner organisation";
  const sent = item.matchSummary?.logistics;
  const update = (key: keyof LogisticsRequest, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));

  // Indicative prices from the server's static list; no provider is contacted.
  const options = [
    ...logisticsEstimates.map((estimate) => ({
      value: estimate.provider,
      title: estimate.provider,
      price: `~ ${estimate.priceRange}`,
      note: estimate.timing,
    })),
    {
      value: OWN_LOGISTICS,
      title: "Choose my own",
      price: "",
      note: "Arrange your own logistics",
    },
  ];

  const cancelMatch = item.allowedActions.includes("cancel_donation") && (
    <Button
      type="button"
      className="secondary block"
      onClick={() => navigate(`/donor/furniture/${item.id}/cancel?action=cancel_donation`)}
    >
      Cancel match
    </Button>
  );

  return (
    <>
      <div className="donor-item-summary">
        {photo ? (
          <img className="donor-item-photo" src={photo.url} alt={item.title} />
        ) : (
          <div className="donor-item-photo" />
        )}
        <div className="donor-item-status">
          <StatusBadge stage="to_deliver" />
        </div>
      </div>

      <div className="info-card">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0z" />
        </svg>
        <div>
          <p>You are connected with</p>
          <strong>{organisation}</strong>
        </div>
      </div>

      {sent ? (
        <>
          <div className="info-card">
            <div>
              <strong>Waiting for {organisation} to confirm</strong>
              <p>
                We have sent them your delivery details. They may confirm, or ask you to
                arrange it differently.
              </p>
            </div>
          </div>

          <section className="donor-item-details">
            <header>
              <h2>Your delivery details</h2>
            </header>
            <DetailRow label="From" value={item.private?.pickupAddress} />
            <DetailRow label="To" value={item.private?.deliveryAddress} />
            <DetailRow label="Delivery date" value={formatDate(sent.deliveryDate)} />
            <DetailRow label="Logistics service" value={providerLabel(sent.provider)} />
          </section>

          {cancelMatch}
        </>
      ) : (
        <form
          className="donor-item-form"
          onSubmit={(event) => {
            event.preventDefault();
            run("propose_logistics", {
              ...draft,
              pickupAddress: draft.pickupAddress.trim(),
              deliveryAddress: draft.deliveryAddress.trim(),
            });
          }}
        >
          <FormField label="From">
            <input
              value={draft.pickupAddress}
              maxLength={ADDRESS_MAX_LEN}
              onChange={(event) => update("pickupAddress", event.target.value)}
              required
            />
            <small>Edit if different from your address</small>
          </FormField>

          <FormField label="To">
            <input
              value={draft.deliveryAddress}
              maxLength={ADDRESS_MAX_LEN}
              placeholder="Enter beneficiary address"
              onChange={(event) => update("deliveryAddress", event.target.value)}
              required
            />
            <small>Add the delivery address provided by the social worker</small>
          </FormField>

          <FormField label="Delivery date">
            <input
              type="date"
              min={today}
              value={draft.deliveryDate}
              onChange={(event) => update("deliveryDate", event.target.value)}
              required
            />
            <small>The date you agreed with the social worker</small>
          </FormField>

          <fieldset className="logistics-options">
            <legend>Choose a logistics service</legend>
            {options.map((option) => (
              <label key={option.value}>
                <strong>{option.title}</strong>
                <div>
                  {option.price && <span>{option.price}</span>}
                  <small>{option.note}</small>
                </div>
                <input
                  type="radio"
                  name="provider"
                  value={option.value}
                  checked={draft.provider === option.value}
                  onChange={() => update("provider", option.value)}
                  required
                />
              </label>
            ))}
          </fieldset>
          <p className="donor-item-note">
            Prices are estimates and exclude manpower cost. You pay the logistics cost
            directly to the social worker, outside this app.
          </p>

          {error && <p className="error-text">{error}</p>}

          <Button type="submit" className="block" disabled={pending}>
            {pending ? "Sending..." : "Confirm logistics service"}
          </Button>
          {cancelMatch}
        </form>
      )}
    </>
  );
}
