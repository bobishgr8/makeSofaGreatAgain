import { Link } from "react-router-dom";

export default function UnauthorisedPage() {
  return (
    <main className="page">
      <div className="page-heading">
        <h1>Access denied.</h1>
        <p>
          You don't have permission to access this page.
        </p>
      </div>

      <div className="actions">
        <Link className="button" to="/furniture">
          Back to furniture
        </Link>
      </div>
    </main>
  );
}