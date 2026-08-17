import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { api } from "../../common/api";
import LoadingSpinner from "../../common/components/LoadingSpinner";
import MatchCard, { type Match } from "./MatchCard";
import FurnitureCard from "../furniture/FurnitureCard";
import type { Furniture } from "../furniture/FurnitureDTO";

type Mode = "matches" | "browse" | "saved";

const SAVED_KEY = "refurbish-saved-furniture";

export default function MatchList() {
  const [searchParams] = useSearchParams();

  const caseId = searchParams.get("case");

  const [mode, setMode] = useState<Mode>(
    caseId ? "matches" : "browse",
  );

  const [matches, setMatches] = useState<Match[]>([]);
  const [furniture, setFurniture] = useState<Furniture[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem(SAVED_KEY);

    if (!stored) {
      return;
    }

    try {
      setSavedIds(JSON.parse(stored));
    } catch {
      localStorage.removeItem(SAVED_KEY);
    }
  }, []);

  useEffect(() => {
    if (caseId) {
      void generateMatches(caseId);
      return;
    }

    void loadFurniture();
  }, [caseId]);

  async function generateMatches(selectedCaseId: string) {
    try {
      setLoading(true);
      setGenerating(true);
      setError("");

      const generated = await api<Match[]>(
        "/api/matches/generate",
        {
          method: "POST",
          body: JSON.stringify({
            caseId: selectedCaseId,
          }),
        },
      );

      setMatches(generated);
      setMode("matches");
    } catch (err) {
      console.error("Failed to generate matches:", err);

      setError(
        "We couldn't generate furniture matches for this case.",
      );
    } finally {
      setLoading(false);
      setGenerating(false);
    }
  }

  async function loadFurniture() {
    try {
      setLoading(true);
      setError("");

      const items = await api<Furniture[]>(
        "/api/furniture?status=available",
      );

      setFurniture(items);
    } catch (err) {
      console.error("Failed to load furniture:", err);

      setError(
        "We couldn't load the available furniture.",
      );
    } finally {
      setLoading(false);
    }
  }

  function toggleSaved(furnitureId: string) {
    setSavedIds((current) => {
      const next = current.includes(furnitureId)
        ? current.filter((id) => id !== furnitureId)
        : [...current, furnitureId];

      localStorage.setItem(
        SAVED_KEY,
        JSON.stringify(next),
      );

      return next;
    });
  }

  const savedFurniture = useMemo(
    () =>
      furniture.filter((item) =>
        savedIds.includes(item.id),
      ),
    [furniture, savedIds],
  );

  function changeMode(nextMode: Mode) {
    setMode(nextMode);

    if (
      (nextMode === "browse" ||
        nextMode === "saved") &&
      furniture.length === 0
    ) {
      void loadFurniture();
    }
  }

  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <h1>
            {caseId
              ? "Furniture matching."
              : "Furniture browser."}
          </h1>

          <p>
            {caseId
              ? "Review ranked suggestions or browse the full catalogue yourself."
              : "Browse available furniture and save useful items for later."}
          </p>
        </div>

        <div className="actions">
          {caseId && (
            <Link
              className="button secondary"
              to="/workspace"
            >
              Back to cases
            </Link>
          )}
        </div>
      </div>

      <div className="match-tabs">
        {caseId && (
          <button
            type="button"
            className={
              mode === "matches"
                ? "button"
                : "button secondary"
            }
            onClick={() => changeMode("matches")}
          >
            Suggested matches
          </button>
        )}

        <button
          type="button"
          className={
            mode === "browse"
              ? "button"
              : "button secondary"
          }
          onClick={() => changeMode("browse")}
        >
          Browse furniture
        </button>

        <button
          type="button"
          className={
            mode === "saved"
              ? "button"
              : "button secondary"
          }
          onClick={() => changeMode("saved")}
        >
          Saved ({savedIds.length})
        </button>
      </div>

      {error && (
        <div className="empty">
          <h2>Something went wrong.</h2>
          <p>{error}</p>
        </div>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : (
        <>
          {mode === "matches" && (
            <MatchResults
              matches={matches}
              caseId={caseId}
              generating={generating}
            />
          )}

          {mode === "browse" && (
            <FurnitureBrowser
              items={furniture}
              savedIds={savedIds}
              onToggleSaved={toggleSaved}
            />
          )}

          {mode === "saved" && (
            <FurnitureBrowser
              items={savedFurniture}
              savedIds={savedIds}
              onToggleSaved={toggleSaved}
              savedMode
            />
          )}
        </>
      )}
    </main>
  );
}

function MatchResults({
  matches,
  caseId,
  generating,
}: {
  matches: Match[];
  caseId: string | null;
  generating: boolean;
}) {
  if (generating) {
    return <LoadingSpinner />;
  }

  if (!matches.length) {
    return (
      <div className="empty">
        <h2>No suitable matches found.</h2>

        <p>
          Try browsing the available furniture manually.
        </p>
      </div>
    );
  }

  return (
    <section>
      <div className="section-heading">
        <div>
          <h2>Suggested matches</h2>

          <p className="muted-text">
            {caseId
              ? `${matches.length} candidates found for this case.`
              : `${matches.length} candidates found.`}
          </p>
        </div>
      </div>

      <div className="grid match-grid">
        {matches.map((match, index) => (
          <MatchCard
            key={match.id}
            match={match}
            rank={index + 1}
          />
        ))}
      </div>
    </section>
  );
}

function FurnitureBrowser({
  items,
  savedIds,
  onToggleSaved,
  savedMode = false,
}: {
  items: Furniture[];
  savedIds: string[];
  onToggleSaved: (id: string) => void;
  savedMode?: boolean;
}) {
  if (!items.length) {
    return (
      <div className="empty">
        <h2>
          {savedMode
            ? "Nothing saved yet."
            : "No furniture available."}
        </h2>

        <p>
          {savedMode
            ? "Save interesting furniture while browsing and it will appear here."
            : "New approved furniture will appear here."}
        </p>
      </div>
    );
  }

  return (
    <section>
      <div className="section-heading">
        <div>
          <h2>
            {savedMode
              ? "Saved furniture"
              : "Available furniture"}
          </h2>

          <p className="muted-text">
            {savedMode
              ? "Items you've bookmarked for later."
              : "Browse all currently available donations."}
          </p>
        </div>
      </div>

      <div className="grid furniture-browser-grid">
        {items.map((item) => {
          const saved = savedIds.includes(item.id);

          return (
            <div
              className="browse-card"
              key={item.id}
            >
              <FurnitureCard item={item} />

              <button
                type="button"
                className={
                  saved
                    ? "button"
                    : "button secondary"
                }
                onClick={() =>
                  onToggleSaved(item.id)
                }
              >
                {saved
                  ? "Saved"
                  : "Save furniture"}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}