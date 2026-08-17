import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../../common/api";
import Card from "../../common/components/Card";
import LoadingSpinner from "../../common/components/LoadingSpinner";

type CaseNeed = {
  category?: string;
};

type CaseRow = {
  id: string;
  reference?: string;
  household?: {
    summary?: string;
  };
  location?: {
    city?: string;
    district?: string;
  };
  priority?: "standard" | "high" | "urgent";
  status?: string;
  needs?: CaseNeed[];
};

export default function SocialWorkerDashboard() {
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadCases() {
      try {
        setLoading(true);
        setError("");

        const data = await api<CaseRow[]>("/api/cases");

        setCases(data);
      } catch (err) {
        console.error("Failed to load cases:", err);

        setError("We couldn't load your cases.");
      } finally {
        setLoading(false);
      }
    }

    void loadCases();
  }, []);

  const openCases = cases.filter(
    (caseItem) =>
      !caseItem.status ||
      caseItem.status === "open",
  ).length;

  const urgentCases = cases.filter(
    (caseItem) =>
      caseItem.priority === "urgent",
  ).length;

  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <h1>Community workspace.</h1>

          <p>
            Manage household needs and find suitable
            furniture for each case.
          </p>
        </div>

        <div className="actions">
          <Link
            className="button"
            to="/cases/new"
          >
            New case
          </Link>
        </div>
      </div>

      <div className="grid">
        <Card className="metric">
          <span>Open cases</span>
          <strong>{openCases}</strong>

          <small>
            Household cases currently assigned to you.
          </small>
        </Card>

        <Card className="metric">
          <span>Urgent cases</span>
          <strong>{urgentCases}</strong>

          <small>
            Cases requiring priority attention.
          </small>
        </Card>

        <Card className="metric">
          <span>Total cases</span>
          <strong>{cases.length}</strong>

          <small>
            All household cases visible to your account.
          </small>
        </Card>
      </div>

      <section>
        <div className="page-heading">
          <div>
            <h2>Your cases</h2>

            <p>
              Select a case to search available furniture
              and review potential matches.
            </p>
          </div>
        </div>

        {loading ? (
          <LoadingSpinner />
        ) : error ? (
          <div className="empty">
            <h2>Could not load cases.</h2>
            <p>{error}</p>
          </div>
        ) : cases.length === 0 ? (
          <div className="empty">
            <h2>No cases yet.</h2>

            <p>
              Create a household case to start matching
              furniture.
            </p>

            <Link
              className="button"
              to="/cases/new"
            >
              Create your first case
            </Link>
          </div>
        ) : (
          <div className="grid case-grid">
            {cases.map((caseItem) => (
              <Card
                key={caseItem.id}
                className="case-card"
              >
                <div className="case-card-header">
                  <div>
                    <span className="muted-text">
                      {caseItem.reference ??
                        `Case ${caseItem.id.slice(0, 8)}`}
                    </span>

                    <h3>
                      {caseItem.household?.summary ??
                        "Household case"}
                    </h3>
                  </div>

                  <span
                    className={`pill ${getPriorityClass(
                      caseItem.priority,
                    )}`}
                  >
                    {formatLabel(
                      caseItem.priority ?? "standard",
                    )}
                  </span>
                </div>

                <div className="case-card-meta">
                  <div>
                    <span className="muted-text">
                      Neighbourhood
                    </span>

                    <strong>
                      {caseItem.location?.district ??
                        "Not provided"}
                    </strong>
                  </div>

                  <div>
                    <span className="muted-text">
                      Status
                    </span>

                    <strong>
                      {formatLabel(
                        caseItem.status ?? "open",
                      )}
                    </strong>
                  </div>
                </div>

                <div>
                  <span className="muted-text">
                    Furniture needed
                  </span>

                  {caseItem.needs?.length ? (
                    <div className="case-needs">
                      {caseItem.needs.map(
                        (need, index) => (
                          <span
                            key={`${caseItem.id}-${index}`}
                            className="pill"
                          >
                            {formatLabel(
                              need.category ??
                                "unspecified",
                            )}
                          </span>
                        ),
                      )}
                    </div>
                  ) : (
                    <p className="muted-text">
                      No furniture needs recorded.
                    </p>
                  )}
                </div>

                <div className="actions">
                  <Link
                    className="button"
                    to={`/matches?case=${caseItem.id}`}
                  >
                    Find furniture
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function formatLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase(),
    );
}

function getPriorityClass(
  priority?: string,
) {
  switch (priority) {
    case "urgent":
      return "pill-danger";

    case "high":
      return "pill-warning";

    default:
      return "";
  }
}