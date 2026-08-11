import { useEffect, useState } from "react";
import { api } from "../../common/api";
import LoadingSpinner from "../../common/components/LoadingSpinner";
import FurnitureCard, { Furniture } from "./FurnitureCard";
export default function FurnitureList() {
  const [items, setItems] = useState<Furniture[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api<Furniture[]>("/api/furniture?status=available")
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);
  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <h1>Available furniture.</h1>
          <p>Useful things looking for their next home.</p>
        </div>
      </div>
      {loading ? (
        <LoadingSpinner />
      ) : items.length ? (
        <div className="grid">
          {items.map((i) => (
            <FurnitureCard key={i.id} item={i} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <h2>No available items yet.</h2>
          <p>New donations will appear here after review.</p>
        </div>
      )}
    </main>
  );
}
