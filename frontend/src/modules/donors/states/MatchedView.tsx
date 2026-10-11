import { useState } from "react";
import { useNavigate } from "react-router-dom";

import Button from "../../../common/components/Button";
import StatusBadge from "../../../common/components/StatusBadge";
import { formatDate } from "../../../common/dates";
import { useFurnitureAction } from "../../../common/hooks/useFurnitureAction";
import { whatsappLink } from "../../../common/notifications";
import LogisticsEstimates from "../LogisticsEstimates";
import { primaryPhoto, type StageViewProps } from "../useDonorFurniture";
import { DetailsCard } from "./SubmittedView";

// State 2: a social worker has requested the item. 2a until the donor connects
// on WhatsApp (which is the donor's approval), 2b afterwards.
export default function MatchedView({ item, onChange }: StageViewProps) {
  const navigate = useNavigate();
  const { run, pending, error } = useFurnitureAction(item, onChange);
  const [confirmingRematch, setConfirmingRematch] = useState(false);

  const photo = primaryPhoto(item);
  const match = item.matchSummary;
  const connected = match?.connected ?? false;
  const organisation = match?.organisation || "a partner organisation";
  const can = (action: (typeof item.allowedActions)[number]) =>
    item.allowedActions.includes(action);

  return (
    <>
      <div className="donor-item-summary">
        {photo ? (
          <img className="donor-item-photo" src={photo.url} alt={item.title} />
        ) : (
          <div className="donor-item-photo" />
        )}
        <div className="donor-item-status">
          <StatusBadge stage="matched" />
          {match?.matchedAt && <small>Matched on {formatDate(match.matchedAt)}</small>}
          <strong>{connected ? "You are connected!" : "Great match!"}</strong>
          <p>
            {connected
              ? "You and the social worker are now connected on WhatsApp."
              : "Your furniture is one step closer to a new home."}
          </p>
        </div>
      </div>

      <div className="info-card">
        <div>
          <strong>Match details</strong>
          <p>
            {connected
              ? `A social worker from ${organisation} is connected with you on WhatsApp.`
              : `A social worker from ${organisation} has been matched with your donation.`}
          </p>
          {connected && (
            <ul className="donor-item-checklist">
              <li>Discuss with the social worker on your expected delivery.</li>
              <li>Confirm if the furniture item fits their requirements.</li>
            </ul>
          )}
        </div>
      </div>

      {can("connect") &&
        (match?.whatsapp ? (
          <>
            {/* A real link, so the browser opens WhatsApp on the tap itself. */}
            <a
              className="button block"
              href={whatsappLink(
                match.whatsapp,
                `Hi, I'm donating "${item.title}" through Refurbish and we've been matched.`,
              )}
              target="_blank"
              rel="noreferrer"
              onClick={() => run("connect")}
            >
              Connect with social worker
            </a>
            <p className="donor-item-note">
              {match.overdue
                ? "This match is overdue and may close at any time."
                : `Connect within 5 days before this match closes${
                    match.connectBy ? ` (by ${formatDate(match.connectBy)})` : ""
                  }.`}
            </p>
          </>
        ) : (
          <p className="donor-item-note">
            The social worker's contact number isn't available yet. Please check back shortly.
          </p>
        ))}

      {can("arrange_delivery") && (
        <Button
          type="button"
          className="block"
          disabled={pending}
          onClick={() => run("arrange_delivery")}
        >
          Arrange delivery
        </Button>
      )}

      {can("rematch") &&
        (confirmingRematch ? (
          <div className="info-card">
            <div>
              <strong>Find another match?</strong>
              <p>
                This ends the match with {organisation} and puts your donation back in the pool.
              </p>
              <div className="actions">
                <Button type="button" disabled={pending} onClick={() => run("rematch")}>
                  {pending ? "Working..." : "Yes, find another"}
                </Button>
                <Button
                  type="button"
                  className="secondary"
                  onClick={() => setConfirmingRematch(false)}
                >
                  Keep this match
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            className="secondary block"
            onClick={() => setConfirmingRematch(true)}
          >
            Find another match
          </Button>
        ))}

      {can("cancel_donation") && (
        <Button
          type="button"
          className="secondary block"
          onClick={() => navigate(`/donor/furniture/${item.id}/cancel?action=cancel_donation`)}
        >
          Cancel match
        </Button>
      )}

      {error && <p className="error-text">{error}</p>}

      <LogisticsEstimates />

      <DetailsCard item={item} />
    </>
  );
}
