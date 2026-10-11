import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import Card from "../../common/components/Card";
import StatusBadge from "../../common/components/StatusBadge";
import { api } from "../../common/api";
import { formatDate } from "../../common/dates";
import { useAuth } from "../../app/AuthProvider";
import {
  CONDITION_LABELS,
  DONOR_STAGES,
  STAGE_LABELS,
  type MyFurnitureResponse,
} from "../../common/dto/FurnitureDTO";
import { primaryPhoto } from "./useDonorFurniture";
import "./DonorFurniture.css";

export default function DonorDashboard() {
  const { user } = useAuth();

  const [data, setData] = useState<MyFurnitureResponse | null>(null);
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
        setData(await api<MyFurnitureResponse>("/api/furniture/mine"));
      } catch (err) {
        console.error("Could not load donor donations:", err);
        setError("We could not load your donations.");
      } finally {
        setLoading(false);
      }
    }

    loadDonations();
  }, [user]);

  const donations = data?.items ?? [];

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

      <div className="stage-counters">
        {DONOR_STAGES.map((stage) => (
          <div className="stage-counter" key={stage}>
            <strong>{data?.counts[stage] ?? 0}</strong>
            <span>{STAGE_LABELS[stage]}</span>
          </div>
        ))}
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
          <div className="donation-rows">
            {donations.map((donation) => {
              const photo = primaryPhoto(donation);

              return (
                <Link
                  key={donation.id}
                  className="donation-row"
                  to={`/donor/furniture/${donation.id}`}
                >
                  {photo ? (
                    <img src={photo.url} alt="" />
                  ) : (
                    <div className="donation-row-photo" />
                  )}

                  <div>
                    <h3>{donation.title}</h3>
                    <p>{CONDITION_LABELS[donation.condition] ?? donation.condition}</p>
                    {donation.private?.pickupAddress && (
                      <p>Pick up: {donation.private.pickupAddress}</p>
                    )}
                    {donation.expectedDeliveryDate && (
                      <p>Deliver by {formatDate(donation.expectedDeliveryDate)}</p>
                    )}
                  </div>

                  <StatusBadge stage={donation.donorStage} />
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
