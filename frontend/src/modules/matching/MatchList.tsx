import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { api } from "../../common/api";
import LoadingSpinner from "../../common/components/LoadingSpinner";
import MatchCard from "./MatchCard";
import FurnitureCard from "../furniture/FurnitureCard";
import type { Furniture } from "../../common/dto/FurnitureDTO";
import type { Suggestion } from "../../common/dto/MatchDTO";
import ProfilePrompt, {
  type SocialWorkerProfile,
} from "../socialWorkers/ProfilePrompt";

type Mode = "matches" | "browse" | "saved";

const SAVED_KEY = "refurbish-saved-furniture";

export default function MatchList() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const caseId = searchParams.get("case");

  const [mode, setMode] = useState<Mode>(
    caseId ? "matches" : "browse",
  );

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [furniture, setFurniture] = useState<Furniture[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [profile, setProfile] = useState<SocialWorkerProfile | null>(null);

  // A request needs the organisation and WhatsApp number the donor will see,
  // so ask for them here rather than letting the request fail.
  useEffect(() => {
    api<SocialWorkerProfile>("/api/social-workers/me")
      .then(setProfile)
      .catch(() => {});
  }, []);

  const profileComplete = Boolean(profile?.organisation && profile?.whatsapp);

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
      void loadSuggestions(caseId);
      return;
    }

    void loadFurniture();
  }, [caseId]);

  // Read-only: the server ranks what is available right now. A match only
  // exists once an item is requested.
  async function loadSuggestions(selectedCaseId: string) {
    try {
      setLoading(true);
      setError("");

      setSuggestions(
        await api<Suggestion[]>(
          `/api/matches/suggestions?caseId=${encodeURIComponent(selectedCaseId)}`,
        ),
      );
      setMode("matches");
    } catch (err) {
      console.error("Failed to load suggestions:", err);

      setError(
        "We couldn't find furniture matches for this case.",
      );
    } finally {
      setLoading(false);
    }
  }

  // Most often someone else requested the item first, so show what is left.
  function requestFailed(message: string) {
    const sentence = /[.!?]$/.test(message) ? message : `${message}.`;
    setNotice(`${sentence} The list has been refreshed.`);
    if (caseId) void loadSuggestions(caseId);
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

      {caseId && profile && !profileComplete && (
        <ProfilePrompt
          profile={profile}
          onSaved={(saved) => {
            setProfile(saved);
            setNotice("");
          }}
        />
      )}

      {notice && <p className="error-text">{notice}</p>}

      {loading ? (
        <LoadingSpinner />
      ) : (
        <>
          {mode === "matches" && caseId && (
            <MatchResults
              suggestions={suggestions}
              caseId={caseId}
              canRequest={profileComplete}
              onRequested={() => navigate("/workspace")}
              onFailed={requestFailed}
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
  suggestions,
  caseId,
  canRequest,
  onRequested,
  onFailed,
}: {
  suggestions: Suggestion[];
  caseId: string;
  canRequest: boolean;
  onRequested: () => void;
  onFailed: (message: string) => void;
}) {
  if (!suggestions.length) {
    return (
      <div className="empty">
        <h2>No suitable matches found.</h2>

        <p>
          Nothing available fits this case right now. Try browsing the
          available furniture manually.
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
            {suggestions.length} candidates found for this case, ranked by
            distance, fit and how soon the donor needs it gone.
          </p>
        </div>
      </div>

      <div className="grid match-grid">
        {suggestions.map((suggestion, index) => (
          <MatchCard
            key={suggestion.furniture.id}
            suggestion={suggestion}
            caseId={caseId}
            rank={index + 1}
            canRequest={canRequest}
            onRequested={onRequested}
            onFailed={onFailed}
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