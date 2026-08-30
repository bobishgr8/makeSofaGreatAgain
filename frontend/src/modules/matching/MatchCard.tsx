import { Link } from "react-router-dom";
import Card from "../../common/components/Card";
import type { Match } from "../../common/dto/MatchDTO";

type Props = {
  match: Match;
  rank?: number;
};

export default function MatchCard({
  match,
  rank,
}: Props) {
  return (
    <Card className="match-card">
      <div className="match-card-header">
        <div>
          {rank && (
            <span className="muted-text">
              Recommendation #{rank}
            </span>
          )}

          <h2>Furniture match</h2>
        </div>

        <span className="status">
          {Math.round(match.score)}% fit
        </span>
      </div>

      <div className="match-score">
        <div
          className="match-score-fill"
          style={{
            width: `${Math.min(
              Math.max(match.score, 0),
              100,
            )}%`,
          }}
        />
      </div>

      {match.reasons.length > 0 && (
        <div>
          <span className="muted-text">
            Why it matched
          </span>

          <ul className="match-reasons">
            {match.reasons.map((reason) => (
              <li key={reason}>
                {reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {match.status && (
        <div>
          <span className="muted-text">
            Status
          </span>

          <p>
            {formatLabel(match.status)}
          </p>
        </div>
      )}

      <div className="actions">
        <Link
          className="button"
          to={`/furniture/${match.furnitureId}`}
        >
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