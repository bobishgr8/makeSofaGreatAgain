import { Link } from "react-router-dom";
import Card from "../../common/components/Card";
export default function SocialWorkerDashboard() {
  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <h1>Community workspace.</h1>
          <p>
            Manage household needs and review explainable furniture matches.
          </p>
        </div>
        <div className="actions">
          <Link className="button" to="/cases/new">
            New case
          </Link>
          <Link className="button secondary" to="/matches">
            View matches
          </Link>
        </div>
      </div>
      <div className="grid">
        <Card className="metric">
          <span>Open cases</span>
          <strong>0</strong>
          <small>Household cases assigned to you.</small>
        </Card>
        <Card className="metric">
          <span>Suggested matches</span>
          <strong>0</strong>
          <small>Ready for human review.</small>
        </Card>
      </div>
    </main>
  );
}
