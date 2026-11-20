import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../../common/api";
import Card from "../../common/components/Card";
import LoadingSpinner from "../../common/components/LoadingSpinner";
import { formatDate } from "../../common/dates";
import type { ThankYouNote } from "../../common/dto/ThankYouNoteDTO";
import "../../common/styles/pages.css";

// EPIC 4: the donor's thank-you notes, passed on by social workers after a
// delivery (backend/app/thanks.py).
export default function ThanksPage() {
  const [notes, setNotes] = useState<ThankYouNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api<ThankYouNote[]>("/api/thank-you-notes")
      .then(setNotes)
      .catch(() => setError("We couldn't load your thank-you notes. Try refreshing."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <p className="page-eyebrow">Thanks</p>
          <h1>
            Thank-you <span className="page-underline">notes</span>
          </h1>
          <p>Messages from families and the organisations who received your donations.</p>
        </div>
      </div>

      <aside className="page-callout">
        <strong>Your donations are making a difference.</strong>
        <p>Real homes, brighter futures — one piece of furniture at a time.</p>
      </aside>

      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <div className="empty">
          <p>{error}</p>
        </div>
      ) : notes.length === 0 ? (
        <div className="empty">
          <h2>No notes yet.</h2>
          <p>
            When a delivery is complete, the family&rsquo;s social worker can send you a
            note. It will appear here, and we&rsquo;ll let you know on WhatsApp.
          </p>
          <Link className="button secondary" to="/donor">
            See your donations
          </Link>
        </div>
      ) : (
        <div className="page-stack">
          {notes.map((note) => (
            <Card key={note.id} className="thanks-note">
              <span className="muted-text">
                A family supported by {note.organisation ?? "a community organisation"}
              </span>
              <blockquote>&ldquo;{note.message}&rdquo;</blockquote>
              <small className="muted-text">
                Received: {note.itemTitle ?? "your donation"}
                {note.createdAt ? ` · ${formatDate(note.createdAt)}` : ""}
              </small>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
