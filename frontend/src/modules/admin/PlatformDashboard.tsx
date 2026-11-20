import { useCallback, useEffect, useState } from "react";

import { useFormConfig } from "../../app/FormConfigContext";
import { api } from "../../common/api";
import Button from "../../common/components/Button";
import Card from "../../common/components/Card";
import LoadingSpinner from "../../common/components/LoadingSpinner";
import { FURNITURE_STATUS_LABELS, type FurnitureStatus } from "../../common/dto/FurnitureDTO";

// GET /api/admin/stats (backend/app/admin.py compute_stats).
type Stats = {
  furnitureByStatus: Record<string, number>;
  furnitureTotal: number;
  deliveredTotal: number;
  deliveredThisWeek: number;
  deliveredByCategory: Record<string, number>;
  activeMatches: number;
  waitlistEntries: number;
  awaitingReview: number;
  openCases: number;
  casesTotal: number;
  thankYouNotes: number;
  notificationsPending: number;
  notificationsFailed: number;
};

// EPIC 15: how the platform is doing, and (EPIC 14) running the background
// jobs by hand when no scheduler is set up.
export default function PlatformDashboard() {
  const { categoryLabels } = useFormConfig();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [jobResult, setJobResult] = useState("");

  const load = useCallback(() => {
    setError("");
    api<Stats>("/api/admin/stats")
      .then(setStats)
      .catch(() => setError("We couldn't load the platform numbers."));
  }, []);

  useEffect(load, [load]);

  async function runJobs() {
    setRunning(true);
    setJobResult("");
    try {
      const result = await api<Record<string, unknown>>("/api/admin/run-jobs", { method: "POST" });
      setJobResult(JSON.stringify(result, null, 2));
      load();
    } catch (caught) {
      setJobResult(caught instanceof Error ? caught.message : "The jobs could not run.");
    } finally {
      setRunning(false);
    }
  }

  if (error) return <p className="error-text">{error}</p>;
  if (!stats) return <LoadingSpinner />;

  const metrics: Array<[string, number, string]> = [
    ["Delivered", stats.deliveredTotal, `${stats.deliveredThisWeek} this week`],
    ["Matches in progress", stats.activeMatches, `${stats.waitlistEntries} on waitlists`],
    ["Open cases", stats.openCases, `${stats.casesTotal} cases in total`],
    ["Listings", stats.furnitureTotal, `${stats.awaitingReview} awaiting review`],
    ["Thank-you notes", stats.thankYouNotes, "Passed on to donors"],
    [
      "WhatsApp queue",
      stats.notificationsPending,
      stats.notificationsFailed ? `${stats.notificationsFailed} failed` : "Waiting to send",
    ],
  ];

  return (
    <div>
      <div className="grid">
        {metrics.map(([label, value, note]) => (
          <Card key={label} className="metric">
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{note}</small>
          </Card>
        ))}
      </div>

      <div className="grid">
        <Card>
          <h3>Listings by status</h3>
          {Object.entries(stats.furnitureByStatus).length === 0 ? (
            <p className="muted-text">No listings yet.</p>
          ) : (
            <ul>
              {Object.entries(stats.furnitureByStatus).map(([status, count]) => (
                <li key={status}>
                  {FURNITURE_STATUS_LABELS[status as FurnitureStatus] ?? status}: {count}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h3>Delivered by category</h3>
          {Object.entries(stats.deliveredByCategory).length === 0 ? (
            <p className="muted-text">Nothing delivered yet.</p>
          ) : (
            <ul>
              {Object.entries(stats.deliveredByCategory).map(([category, count]) => (
                <li key={category}>
                  {categoryLabels[category] ?? category}: {count}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h3>Background jobs</h3>
          <p className="muted-text">
            Expire unanswered matches and old waitlist requests, queue weekly summaries and send
            WhatsApp messages. Normally run by backend/scripts/scheduler.py.
          </p>
          <Button type="button" disabled={running} onClick={() => void runJobs()}>
            {running ? "Running..." : "Run jobs now"}
          </Button>
          {jobResult && <pre className="muted-text">{jobResult}</pre>}
        </Card>
      </div>
    </div>
  );
}
