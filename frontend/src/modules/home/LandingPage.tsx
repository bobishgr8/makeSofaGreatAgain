import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import Card from "../../common/components/Card";
import LoadingSpinner from "../../common/components/LoadingSpinner";
import { api } from "../../common/api";
import { useFormConfig } from "../../app/FormConfigContext";
import type { WishlistItem } from "../../common/dto/WishlistItemDTO";
import "./LandingPage.css";

// How many wishlist items to preview here — the full list lives on /wishlist.
const WISHLIST_PREVIEW_COUNT = 6;

const WHY_CARDS = [
  {
    title: "100% non-profit",
    body: "ReFurbish is a volunteer-run initiative with no listing fees and no cut taken from anyone. Every part of the platform exists purely to help your donation reach the right home, faster.",
    icon: (
      <path
        d="M12 21s-7.5-4.7-10-9.3C.4 8 1.8 4 5.6 3.2c2.2-.5 4.2.6 6.4 3 2.2-2.4 4.2-3.5 6.4-3C22.2 4 23.6 8 22 11.7 19.5 16.3 12 21 12 21z"
        stroke="var(--ink-heading)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    ),
  },
  {
    title: "Faster matching, quality checked",
    body: "Every item you donate is screened for cleanliness, damage and usability before it's matched — so you're never left wondering whether it reached someone, or if it was even suitable.",
    icon: (
      <path
        d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"
        stroke="var(--ink-heading)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    ),
  },
  {
    title: "Real impact for families in need",
    body: "Your sofa, bed, fridge or washing machine goes to a family matched on real need — not just whoever scrolled past it first. That's the difference your donation makes.",
    icon: (
      <path
        d="M3 10.5 12 3l9 7.5M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"
        stroke="var(--ink-heading)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    ),
  },
];

export default function LandingPage() {
  const rootRef = useRef<HTMLDivElement>(null);
  const { categoryLabels } = useFormConfig();

  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [wishlistLoading, setWishlistLoading] = useState(true);

  useEffect(() => {
    api<WishlistItem[]>("/api/cases/wishlist")
      .then(setWishlist)
      .catch((err) => {
        console.error("Failed to load the wishlist preview:", err);
      })
      .finally(() => setWishlistLoading(false));
  }, []);

  // Quiet fade-up as sections enter view. Everything is shown immediately if
  // IntersectionObserver isn't available or the visitor prefers reduced
  // motion (the CSS also forces .reveal visible in that case as a backstop).
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const items = root.querySelectorAll<HTMLElement>(".reveal");

    const prefersReduced =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReduced || !("IntersectionObserver" in window)) {
      items.forEach((el) => el.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
    );

    items.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={rootRef}>
      {/* HERO */}
      <section className="landing-hero">
        <div className="landing-wrap landing-hero-grid">
          <div>
            <h1>
              <span className="line">Help make a</span>
              <span className="line line-accent">house a home.</span>
            </h1>

            <p className="lead">
              Moving out or changing your furniture? If your furniture is
              still in good condition, why not consider donating it to
              families in need? Our platform will quality-check items and
              match them with a verified social worker supporting
              low-income beneficiaries, so you know exactly where it's
              going.
            </p>

            <div className="landing-hero-actions">
              <Link className="button" to="/furniture/new">
                Donate furniture
              </Link>
              <Link className="button secondary" to="/wishlist">
                See what's needed
              </Link>
            </div>
          </div>

          <div className="landing-hero-photo">
            <span className="landing-hero-photo-badge">
              Photo placeholder — to be replaced with real photography of a
              donor family handover
            </span>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="landing-section">
        <div className="landing-wrap">
          <div className="landing-section-head reveal">
            <span className="eyebrow">How it works</span>
            <h2>Three steps, and your furniture's on its way to a new home</h2>
            <p>
              From your living room to theirs — here's what happens after you
              submit your item.
            </p>
          </div>

          <div className="landing-steps">
            <div className="landing-step reveal">
              <div className="landing-step-num">1</div>
              <h3>Upload a few photos</h3>
              <p>
                Snap 3–5 photos of the item you're giving away and tell us a
                bit about its type, size and condition. Takes about 3
                minutes.
              </p>
            </div>

            <div className="landing-step reveal">
              <div className="landing-step-num">2</div>
              <h3>We check &amp; match it</h3>
              <p>
                Our platform screens the item for cleanliness and usability,
                then matches it with a verified NGO or social worker based on
                type, size, urgency and location.
              </p>
            </div>

            <div className="landing-step reveal">
              <div className="landing-step-num">3</div>
              <h3>Connect &amp; hand it over</h3>
              <p>
                We only share your contact details once a social worker
                accepts — then you arrange collection or delivery together.
                No chasing multiple organisations.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* WISHLIST */}
      <section id="wishlist" className="landing-section">
        <div className="landing-wrap">
          <div className="landing-section-head reveal">
            <span className="eyebrow">Wishlist</span>
            <h2>What families are hoping for</h2>
            <p>
              Real needs from families we support right now. If something
              close to this is sitting unused at home, it could be exactly
              what they're waiting for.
            </p>
          </div>

          {wishlistLoading ? (
            <LoadingSpinner />
          ) : wishlist.length === 0 ? (
            <p className="muted-text">
              No open needs right now — check back soon.
            </p>
          ) : (
            <div className="landing-listings-grid">
              {wishlist.slice(0, WISHLIST_PREVIEW_COUNT).map((item, index) => (
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

          <div className="landing-listings-more reveal">
            <Link className="button secondary" to="/wishlist">
              See the full wishlist
            </Link>
          </div>
        </div>
      </section>

      {/* WHY */}
      <section id="why" className="landing-section">
        <div className="landing-wrap">
          <div className="landing-section-head reveal">
            <span className="eyebrow">Why ReFurbish</span>
            <h2>A better way to donate — one that actually gets there</h2>
            <p>
              Existing options like PassItOn and Facebook giveaway groups
              rely on manual scrolling and "fastest fingers first." We built
              ReFurbish to do better for you as a donor.
            </p>
          </div>

          <div className="landing-cards-3">
            {WHY_CARDS.map((item) => (
              <Card key={item.title} className="reveal">
                <div className="landing-card-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    {item.icon}
                  </svg>
                </div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ABOUT */}
      <section id="about" className="landing-section">
        <div className="landing-wrap">
          <div className="landing-about reveal">
            <span className="eyebrow">About us</span>
            <h2>It started with our own donation</h2>
            <p>
              The idea for ReFurbish came about after we wanted to donate
              some pieces of furniture from our home, and thought it was a
              simple process. We ended up spending weeks going through
              various platforms, liaising with various social workers and
              logistics providers, just to see through the donations to
              families who needed them. We then kept asking ourselves: how
              do we make this easier for fellow donors, and similarly, for
              social workers that are supporting low-income families?
            </p>
            <p>
              We thus built ReFurbish with other volunteers, to function as
              a free, non-profit platform that helps give your used
              furniture a second life, and help make a house a home for
              low-income beneficiaries.
            </p>
            <p className="signoff">— The ReFurbish team</p>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="landing-section">
        <div className="landing-wrap">
          <div className="landing-cta-final reveal">
            <h2>Ready to help furnish a home?</h2>
            <p>
              Got a sofa, bed, fridge or washing machine to give away? It
              takes about five minutes to get it in front of a family who
              needs it.
            </p>
            <div className="landing-hero-actions">
              <Link className="button" to="/furniture/new">
                Donate furniture
              </Link>
              <Link className="button secondary" to="/wishlist">
                See what's needed
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="landing-footer">
        <div className="landing-wrap">
          <div className="landing-footer-grid">
            <div className="landing-footer-brand">
              <strong>ReFurbish</strong>
              <p>
                Reusing furniture, minimising rubbish. A non-profit donation
                matching platform for Singapore.
              </p>
            </div>

            <div className="landing-footer-cols">
              <div className="landing-footer-col">
                <h5>Platform</h5>
                <Link to="/furniture/new">Donate furniture</Link>
                <Link to="/wishlist">See what's needed</Link>
                <a href="#about">About us</a>
              </div>
            </div>
          </div>

          <div className="landing-footer-bottom">
            <span>© 2026 ReFurbish. Made with care by volunteers in Singapore.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
