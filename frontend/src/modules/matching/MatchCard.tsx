import Card from "../../common/components/Card";
export type Match = {
  id: string;
  score: number;
  furnitureId: string;
  caseId: string;
  reasons: string[];
};
export default function MatchCard({ match }: { match: Match }) {
  return (
    <Card>
      <span className="status">{match.score}% fit</span>
      <h2>
        {match.furnitureId} → {match.caseId}
      </h2>
      <ul>
        {match.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <button className="button">Review match</button>
    </Card>
  );
}
