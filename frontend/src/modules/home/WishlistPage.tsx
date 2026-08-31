import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../../common/api";
import { useFormConfig } from "../../app/FormConfigContext";
import Card from "../../common/components/Card";
import LoadingSpinner from "../../common/components/LoadingSpinner";
import type { WishlistItem } from "../../common/dto/WishlistItemDTO";
import "./LandingPage.css";

export default function WishlistPage() {
  const { categoryLabels } = useFormConfig();

  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api<WishlistItem[]>("/api/cases/wishlist")
      .then(setItems)
      .catch((err) => {
        console.error("Failed to load the wishlist:", err);
        setError("We couldn't load the wishlist. Try refreshing.");
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <h1>Wishlist.</h1>

          <p>
            Real, current needs from families supported by our social
            workers — pulled straight from their open cases. If something
            close to this is sitting unused at home, it could be exactly
            what one of them is waiting for.
          </p>
        </div>

        <div className="actions">
          <Link className="button" to="/furniture/new">
            Donate furniture
          </Link>
        </div>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <div className="empty">
          <h2>Something went wrong.</h2>
          <p>{error}</p>
        </div>
      ) : items.length === 0 ? (
        <div className="empty">
          <h2>No open needs right now.</h2>
          <p>
            Every case is currently matched or closed — check back soon, or
            browse{" "}
            <Link to="/furniture">available furniture</Link> in the
            meantime.
          </p>
        </div>
      ) : (
        <div className="landing-listings-grid">
          {items.map((item, index) => (
            <Card
              key={`${item.category}-${item.neighbourhood}-${index}`}
              className="landing-listing-card"
            >
              <div className="landing-listing-photo" />

              <div className="landing-listing-heading">
                <h3>{categoryLabels[item.category] ?? item.category}</h3>

                {item.priority !== "standard" && (
                  <span
                    className={`pill ${
                      item.priority === "urgent" ? "pill-danger" : "pill-warning"
                    }`}
                  >
                    {item.priority}
                  </span>
                )}
              </div>

              {item.summary && (
                <p className="landing-listing-condition">{item.summary}</p>
              )}

              <div className="landing-listing-meta">
                <span>
                  {item.neighbourhood
                    ? `Needed in ${item.neighbourhood}`
                    : "Neighbourhood not specified"}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
