import { useEffect, useState } from "react";
import { api } from "../../common/api";
import MatchCard, { Match } from "./MatchCard";
export default function MatchList() {
  const [matches, setMatches] = useState<Match[]>([]);
  useEffect(() => {
    api<Match[]>("/api/matches")
      .then(setMatches)
      .catch(() => setMatches([]));
  }, []);
  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <h1>Suggested matches.</h1>
          <p>
            Ranked by category, location, condition, logistics and priority.
          </p>
        </div>
      </div>
      {matches.length ? (
        <div className="grid">
          {matches.map((m) => (
            <MatchCard key={m.id} match={m} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <h2>No suggestions yet.</h2>
          <p>Create a case, then ask the API to generate matches.</p>
        </div>
      )}
    </main>
  );
}
