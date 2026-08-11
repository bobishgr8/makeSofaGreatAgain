import { Link } from "react-router-dom";
import Card from "../../common/components/Card";
export default function DonorDashboard() {
  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <h1>Your donations.</h1>
          <p>
            Track what you have offered and where each item is in the process.
          </p>
        </div>
        <Link className="button" to="/donate">
          Give an item
        </Link>
      </div>
      <div className="grid">
        <Card className="metric">
          <span>Active donations</span>
          <strong>0</strong>
          <small>Your submitted items will appear here.</small>
        </Card>
      </div>
    </main>
  );
}
