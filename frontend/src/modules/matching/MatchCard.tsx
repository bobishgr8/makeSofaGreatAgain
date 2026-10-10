import { Link } from "react-router-dom";

import Button from "../../common/components/Button";
import Card from "../../common/components/Card";
import { CONDITION_LABELS } from "../../common/dto/FurnitureDTO";
import type { Suggestion } from "../../common/dto/MatchDTO";
import { useFurnitureAction } from "../../common/hooks/useFurnitureAction";

type Props = {
  suggestion: Suggestion;
  caseId: string;
  rank?: number;
  // False until the social worker has saved their organisation and WhatsApp number.
  canRequest: boolean;
  onRequested: () => void;
  onFailed: (message: string) => void;
};

export default function MatchCard({
  suggestion,
  caseId,
  rank,
  canRequest,
  onRequested,
  onFailed,
}: Props) {
  const item = suggestion.furniture;
  const { run, pending } = useFurnitureAction(item, onRequested);

  const photo =
    item.photos?.find((candidate) => candidate.isPrimary) ?? item.photos?.[0];
  const size = item.dimensionsCm;
  const dimensions =
    size?.width != null && size?.depth != null && size?.height != null
      ? `${size.width} × ${size.depth} × ${size.height} cm`
      : null;

  async function request() {
    const failure = await run("accept_match", { caseId });
    if (failure) onFailed(failure);
  }

  return (
    <Card className="match-card">
      {photo && (
        <img
          src={photo.url}
          alt={item.title}
          className="furniture-card-image"
        />
      )}

      <div className="match-card-header">
        <div>
          {rank && (
            <span className="muted-text">
              Recommendation #{rank}
            </span>
          )}

          <h2>{item.title}</h2>
        </div>

        <span className="status">
          {Math.round(suggestion.score)}% fit
        </span>
      </div>

      <p className="muted-text">
        {[
          CONDITION_LABELS[item.condition] ?? item.condition,
          item.location?.district,
          dimensions,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>

      <div className="match-score">
        <div
          className="match-score-fill"
          style={{
            width: `${Math.min(
              Math.max(suggestion.score, 0),
              100,
            )}%`,
          }}
        />
      </div>

      {suggestion.reasons.length > 0 && (
        <div>
          <span className="muted-text">
            Why it matched
          </span>

          <ul className="match-reasons">
            {suggestion.reasons.map((reason) => (
              <li key={reason}>
                {reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="actions">
        {/* The button comes from the server's allowedActions. */}
        {item.allowedActions.includes("accept_match") && (
          <Button
            type="button"
            disabled={pending || !canRequest}
            title={canRequest ? undefined : "Save your organisation and WhatsApp number first"}
            onClick={request}
          >
            {pending ? "Requesting..." : "Request this item"}
          </Button>
        )}

        <Link
          className="button secondary"
          to={`/furniture/${item.id}`}
        >
          Review furniture
        </Link>
      </div>
    </Card>
  );
}
