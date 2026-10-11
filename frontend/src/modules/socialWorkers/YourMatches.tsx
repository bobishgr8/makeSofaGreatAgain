import { useState } from "react";
import { Link } from "react-router-dom";

import Button from "../../common/components/Button";
import Card from "../../common/components/Card";
import { formatDate } from "../../common/dates";
import type { Case } from "../../common/dto/CaseDTO";
import {
  providerLabel,
  STAGE_LABELS,
  type FurnitureAction,
  type FurnitureView,
} from "../../common/dto/FurnitureDTO";
import { useFurnitureAction } from "../../common/hooks/useFurnitureAction";

const REASON_MAX_LEN = 500;

// The two actions here that end the match, so the server asks why.
type ReasonAction = "release_match" | "cancel_delivery";

const REASON_PROMPTS: Record<ReasonAction, string> = {
  release_match: "Why are you releasing this item?",
  cancel_delivery: "Why are you cancelling this delivery?",
};

// The furniture held for this social worker's cases, from the request through
// to delivery.
export default function YourMatches({
  matches,
  cases,
  onChanged,
}: {
  matches: FurnitureView[];
  cases: Case[];
  onChanged: () => void;
}) {
  if (!matches.length) return null;

  return (
    <section>
      <div className="page-heading">
        <div>
          <h2>Your matches</h2>

          <p>
            Furniture you have requested. The donor has 5 days to connect
            with you on WhatsApp, then arranges the delivery with you.
          </p>
        </div>
      </div>

      <div className="grid case-grid">
        {matches.map((item) => (
          <MatchRow
            key={item.id}
            item={item}
            matchedCase={cases.find(
              (caseItem) => caseItem.id === item.matchSummary?.caseId,
            )}
            onChanged={onChanged}
          />
        ))}
      </div>
    </section>
  );
}

function MatchRow({
  item,
  matchedCase,
  onChanged,
}: {
  item: FurnitureView;
  matchedCase?: Case;
  onChanged: () => void;
}) {
  const { run, pending, error } = useFurnitureAction(item, onChanged);
  // Which action the reason box is open for, if any.
  const [reasonFor, setReasonFor] = useState<ReasonAction | null>(null);
  const [reason, setReason] = useState("");
  const match = item.matchSummary;
  const logistics = match?.logistics;
  const can = (action: FurnitureAction) => item.allowedActions.includes(action);
  const askReason = (action: ReasonAction) => {
    setReason("");
    setReasonFor(action);
  };

  return (
    <Card className="case-card">
      <div className="case-card-header">
        <div>
          <span className="muted-text">
            {matchedCase
              ? `For ${
                  matchedCase.reference ??
                  matchedCase.household?.summary ??
                  "your case"
                }`
              : "Matched furniture"}
          </span>

          <h3>{item.title}</h3>
        </div>

        <span className="pill">
          {item.status !== "matched"
            ? STAGE_LABELS[item.donorStage]
            : match?.connected
              ? "Connected"
              : "Waiting"}
        </span>
      </div>

      {item.donorStage === "delivered" ? (
        <div>
          <strong>Success! Delivery complete.</strong>

          <p className="muted-text">Thank you for making a difference!</p>
        </div>
      ) : item.status === "in_delivery" ? (
        <div>
          <strong>Delivery is in progress.</strong>

          <p className="muted-text">
            Please refer to your logistics provider
            {logistics ? ` (${providerLabel(logistics.provider)})` : ""} for
            delivery details and updates.
          </p>
        </div>
      ) : item.status === "to_deliver" ? (
        logistics ? (
          <div>
            <strong>The donor wants to arrange for delivery.</strong>

            <p className="muted-text">
              {providerLabel(logistics.provider)} on{" "}
              {formatDate(logistics.deliveryDate)}. Confirm if this works, or
              ask the donor to rearrange.
            </p>
          </div>
        ) : (
          <p className="muted-text">
            The donor is arranging delivery. You will see the provider and
            date here once they have chosen.
          </p>
        )
      ) : match?.connected ? (
        <div>
          <strong>Yay, the donor wants to connect.</strong>

          <p className="muted-text">Next steps</p>

          <ul className="match-reasons">
            <li>Agree the delivery date with the donor on WhatsApp.</li>
            <li>Confirm the item fits the household's space.</li>
          </ul>
        </div>
      ) : (
        <p className="muted-text">
          {match?.overdue
            ? "The donor has not connected in time. This match may close at any time."
            : `Waiting for the donor to connect${
                match?.connectBy ? ` by ${formatDate(match.connectBy)}` : ""
              }.`}
        </p>
      )}

      <div className="case-card-meta">
        <div>
          <span className="muted-text">Pick up</span>

          <strong>{item.private?.pickupAddress ?? "Not provided"}</strong>
        </div>

        {item.private?.deliveryAddress && (
          <div>
            <span className="muted-text">Deliver to</span>

            <strong>{item.private.deliveryAddress}</strong>
          </div>
        )}

        <div>
          <span className="muted-text">
            {logistics ? "Delivery date" : "Deliver by"}
          </span>

          <strong>
            {formatDate(
              logistics?.deliveryDate ?? item.expectedDeliveryDate,
            ) || "Not provided"}
          </strong>
        </div>
      </div>

      {reasonFor && (
        <label className="form-field">
          <span>{REASON_PROMPTS[reasonFor]}</span>
          <textarea
            value={reason}
            maxLength={REASON_MAX_LEN}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
      )}

      {error && <p className="error-text">{error}</p>}

      <div className="actions">
        {/* Buttons come from the server's allowedActions. */}
        {reasonFor ? (
          <>
            <Button
              type="button"
              className="secondary"
              disabled={!reason.trim() || pending}
              onClick={() => run(reasonFor, { reason: reason.trim() })}
            >
              {pending ? "Working..." : "Confirm"}
            </Button>

            <Button
              type="button"
              className="secondary"
              onClick={() => setReasonFor(null)}
            >
              Keep
            </Button>
          </>
        ) : (
          <>
            {can("confirm_logistics") && (
              <Button
                type="button"
                disabled={pending}
                onClick={() => run("confirm_logistics")}
              >
                Confirm
              </Button>
            )}

            {can("rearrange_logistics") && (
              <Button
                type="button"
                className="secondary"
                disabled={pending}
                onClick={() => run("rearrange_logistics")}
              >
                Rearrange
              </Button>
            )}

            {can("complete_delivery") && (
              <Button
                type="button"
                disabled={pending}
                onClick={() => run("complete_delivery")}
              >
                Delivery complete
              </Button>
            )}

            {can("release_match") && (
              <Button
                type="button"
                className="secondary"
                onClick={() => askReason("release_match")}
              >
                {logistics ? "Cancel" : "Release match"}
              </Button>
            )}

            {can("cancel_delivery") && (
              <Button
                type="button"
                className="secondary"
                onClick={() => askReason("cancel_delivery")}
              >
                Cancel delivery
              </Button>
            )}
          </>
        )}

        <Link className="button secondary" to={`/furniture/${item.id}`}>
          View furniture
        </Link>
      </div>
    </Card>
  );
}
