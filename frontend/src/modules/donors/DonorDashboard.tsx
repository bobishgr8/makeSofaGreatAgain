import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  collection,
  getDocs,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";

import Card from "../../common/components/Card";
import { db } from "../../common/firebase";
import { useAuth } from "../../app/AuthProvider";

type DonationStatus =
  | "available"
  | "reserved"
  | "matched"
  | "collected"
  | "donated"
  | "unavailable";

type Donation = {
  id: string;
  title: string;
  category?: string;
  status?: DonationStatus;
  createdAt?: Timestamp;
  imageUrls?: string[];
};

export default function DonorDashboard() {
  const { user } = useAuth();

  const [donations, setDonations] = useState<Donation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
  if (!user) {
    setLoading(false);
    return;
  }

  // Capture after null guard
  const uid = user.uid;

  async function loadDonations() {
    try {
      setLoading(true);
      setError("");

      const donationsQuery = query(
        collection(db, "furniture"),
        where("donorId", "==", uid),
        orderBy("createdAt", "desc"),
      );

      const snapshot = await getDocs(donationsQuery);

      const items: Donation[] = snapshot.docs.map((document) => ({
        id: document.id,
        ...(document.data() as Omit<Donation, "id">),
      }));

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
        ["available", "reserved", "matched"].includes(
          item.status ?? "available",
        ),
      ).length,
    [donations],
  );

  const completedDonations = useMemo(
    () =>
      donations.filter((item) =>
        ["collected", "donated"].includes(item.status ?? ""),
      ).length,
    [donations],
  );

  const matchedDonations = useMemo(
    () =>
      donations.filter(
        (item) => item.status === "matched",
      ).length,
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
            {donations.map((donation) => (
              <Card key={donation.id}>
                {donation.imageUrls?.[0] && (
                  <img
                    src={donation.imageUrls[0]}
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
                      {formatStatus(
                        donation.status ?? "available",
                      )}
                    </strong>
                  </p>

                  {donation.createdAt && (
                    <small>
                      Submitted{" "}
                      {donation.createdAt
                        .toDate()
                        .toLocaleDateString()}
                    </small>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function formatStatus(status: string) {
  return status
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase(),
    );
}