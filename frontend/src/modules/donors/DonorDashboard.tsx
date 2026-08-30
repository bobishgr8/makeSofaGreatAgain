import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import Card from "../../common/components/Card";
import { api } from "../../common/api";
import { useAuth } from "../../app/AuthProvider";
import {
  FURNITURE_STATUS_LABELS,
  type Furniture,
} from "../../common/dto/FurnitureDTO";

export default function DonorDashboard() {
  const { user } = useAuth();

  const [donations, setDonations] = useState<Furniture[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    async function loadDonations() {
      try {
        setLoading(true);
        setError("");

        const items = await api<Furniture[]>("/api/furniture/mine");

        setDonations(items);
      } catch (err) {
        console.error("Could not load donor donations:", err);
        setError("We could not load your donations.");
      } finally {
        setLoading(false);
      }
    }

    loadDonations();
  }, [user]);

  const activeDonations = useMemo(
    () =>
      donations.filter((item) =>
        ["pending_review", "available", "matched"].includes(item.status),
      ).length,
    [donations],
  );

  const completedDonations = useMemo(
    () => donations.filter((item) => item.status === "collected").length,
    [donations],
  );

  const matchedDonations = useMemo(
    () => donations.filter((item) => item.status === "matched").length,
    [donations],
  );

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
          <strong>{activeDonations}</strong>
          <small>Items currently in the donation process.</small>
        </Card>

        <Card className="metric">
          <span>Matched</span>
          <strong>{matchedDonations}</strong>
          <small>Items matched with a recipient.</small>
        </Card>

        <Card className="metric">
          <span>Completed</span>
          <strong>{completedDonations}</strong>
          <small>Items successfully donated.</small>
        </Card>

        <Card className="metric">
          <span>Total donations</span>
          <strong>{donations.length}</strong>
          <small>Everything you have submitted.</small>
        </Card>
      </div>

      <section>
        <div className="page-heading">
          <div>
            <h2>Your items</h2>
          </div>
        </div>

        {loading && <p>Loading your donations...</p>}

        {error && <p className="error">{error}</p>}

        {!loading && !error && donations.length === 0 && (
          <Card>
            <h3>No donations yet.</h3>

            <p>
              When you offer furniture, it will appear here.
            </p>

            <Link className="button" to="/donate">
              Give your first item
            </Link>
          </Card>
        )}

        {!loading && !error && donations.length > 0 && (
          <div className="grid">
            {donations.map((donation) => {
              const primaryPhoto =
                donation.photos?.find((photo) => photo.isPrimary) ??
                donation.photos?.[0];

              return (
                <Card key={donation.id}>
                  {primaryPhoto && (
                    <img
                      src={primaryPhoto.url}
                      alt={donation.title}
                      className="donation-image"
                    />
                  )}

                  <div>
                    <small>
                      {donation.category ?? "Furniture"}
                    </small>

                    <h3>{donation.title}</h3>

                    <p>
                      Status:{" "}
                      <strong>
                        {FURNITURE_STATUS_LABELS[donation.status]}
                      </strong>
                    </p>

                    {donation.createdAt && (
                      <small>
                        Submitted{" "}
                        {new Date(donation.createdAt).toLocaleDateString()}
                      </small>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
