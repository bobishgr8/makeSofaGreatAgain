import { useState } from "react";
import { Link } from "react-router-dom";

import Button from "../../common/components/Button";
import Card from "../../common/components/Card";
import FormField from "../../common/components/FormField";
import { api } from "../../common/api";
import type { Match } from "../../common/dto/MatchDTO";

type Props = {
  match: Match;
  rank?: number;
  // Shown for cross-case lists (e.g. "My reservations") where the case
  // isn't already the page's context, unlike the per-case suggested list.
  showCase?: boolean;
};

const MAX_NOTES_LENGTH = 1000;

export default function MatchCard({ match, rank, showCase = false }: Props) {
  const [current, setCurrent] = useState(match);
  const [reserving, setReserving] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const isUnclaimed = !current.status || current.status === "suggested";

  async function updateStatus(status: string, extra?: Record<string, unknown>) {
    setSubmitting(true);
    setError("");

    try {
      const updated = await api<Match>(`/api/matches/${current.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, ...extra }),
      });

      setCurrent(updated);
      setReserving(false);
      setNotes("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Couldn't update this reservation.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function submitReservation() {
    if (!notes.trim()) {
      setError("Add a note on how you'll contact the recipient.");
      return;
    }
    void updateStatus("reserved", { notes });
  }

  return (
    <Card className="match-card">
      <div className="match-card-header">
        <div>
          {rank && <span className="muted-text">Recommendation #{rank}</span>}

          {showCase && (
            <span className="muted-text">
              Case {current.caseId.slice(0, 8)}
            </span>
          )}

          <h2>Furniture match</h2>
        </div>

        <span className="status">{Math.round(current.score)}% fit</span>
      </div>

      <div className="match-score">
        <div
          className="match-score-fill"
          style={{
            width: `${Math.min(Math.max(current.score, 0), 100)}%`,
          }}
        />
      </div>

      {current.reasons.length > 0 && (
        <div>
          <span className="muted-text">Why it matched</span>

          <ul className="match-reasons">
            {current.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      {!isUnclaimed && (
        <div>
          <span className="muted-text">Status</span>
          <p>{formatLabel(current.status ?? "")}</p>
        </div>
      )}

      {current.notes && (
        <div>
          <span className="muted-text">Contact plan</span>
          <p>{current.notes}</p>
        </div>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {isUnclaimed && reserving && (
        <FormField label="How will you reach the recipient?">
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="e.g. Calling the family Tuesday to arrange pickup."
            maxLength={MAX_NOTES_LENGTH}
          />
        </FormField>
      )}

      <div className="actions">
        {isUnclaimed && !reserving && (
          <Button type="button" onClick={() => setReserving(true)}>
            Reserve for this case
          </Button>
        )}

        {isUnclaimed && reserving && (
          <>
            <Button
              type="button"
              disabled={submitting}
              onClick={submitReservation}
            >
              {submitting ? "Reserving..." : "Confirm reservation"}
            </Button>

            <button
              type="button"
              className="button secondary"
              onClick={() => {
                setReserving(false);
                setError("");
              }}
            >
              Cancel
            </button>
          </>
        )}

        {current.status === "reserved" && (
          <>
            <Button
              type="button"
              disabled={submitting}
              onClick={() => updateStatus("collected")}
            >
              Mark collected
            </Button>

            <Button
              type="button"
              className="secondary"
              disabled={submitting}
              onClick={() => updateStatus("delivered")}
            >
              Mark delivered
            </Button>
          </>
        )}

        {current.status === "collected" && (
          <Button
            type="button"
            disabled={submitting}
            onClick={() => updateStatus("delivered")}
          >
            Mark delivered
          </Button>
        )}

        <Link className="button secondary" to={`/furniture/${current.furnitureId}`}>
          Review furniture
        </Link>
      </div>
    </Card>
  );
}

function formatLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase(),
    );
}
