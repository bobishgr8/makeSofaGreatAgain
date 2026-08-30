---
name: refurbish-design-system
description: Refurbish's brand system — exact color tokens, Petrona/Source Sans 3 typography, spacing scale, component patterns (buttons, cards, step markers), the orange usage rule, voice guide, and slide/deck-specific translation rules. Use whenever building, styling, editing, or reviewing any Refurbish page, component, slide deck, or piece of UI/deck copy — even if the request doesn't explicitly mention design or branding.
---

# Refurbish Design System

## When to use this

Apply these rules whenever you're building, editing, styling, or reviewing any page, component, or piece of UI copy for Refurbish — the Singapore non-profit furniture donation platform. This is the source of truth. Don't introduce colors, fonts, or spacing values that aren't listed here, even ones that seem close enough or "basically the same."

If a request conflicts with something here (e.g. asks for a color not in this list), flag the conflict rather than silently picking the closest match.

## Brand concept

Core value: **Care**. Two things have to hold true at the same time — don't sacrifice one for the other:

- **Calm interface**: minimal, thoughtful, trustworthy, timeless, simple
- **Warm stories**: rehoming, community, warmth, humanness, connection

Petrona, the orange hairline, and the cream background supply the warmth. Generous negative space supplies the trust and professionalism. Both are load-bearing.

## Color tokens

```css
:root{
  /* Orange — signature, rationed (see budget below) */
  --orange: #E35526;
  --orange-tint-light: #F8DCCB;   /* in the palette, NOT currently used as a fill — see budget */
  --orange-tint: #E97751;
  --orange-hover: #E6663C;        /* primary button hover */
  --orange-shade: #B6441E;        /* primary button active/pressed */
  --orange-shade-deep: #8F3517;   /* rare case: orange text directly on cream */

  /* Ink — always charcoal-family. Never introduce a separate grey hue. */
  --charcoal: #16161D;
  --ink-heading: #16161D;
  --ink-body: #3A3A42;
  --ink-muted: #6E6E76;
  --ink-faint: #9A9AA1;

  /* Cream — background and surfaces */
  --cream-base: #FCF7E9;
  --cream-card: #F5EFDE;
  --cream-card-soft: #F9F3E4;
  --cream-deep: #EFE6CE;          /* dividers, borders */
  --cream-white: #FFFDF7;
}
```

## The orange budget — the most important rule

Orange is **one repeated hairline motif**, not a general-purpose accent color. It appears in exactly these places:

- Header and footer top border (1.5px)
- The extending underline under one key headline phrase per page — an inline `border-bottom` on an inline-block span, sized to that specific text's own width. **Never** a fixed-width decorative bar unrelated to the text above/below it.
- The meta divider line on listing cards (top border of the meta row only)
- Primary button fills, including hover (`--orange-hover`) and active (`--orange-shade`) states

It does **not** appear in: section labels, body text, card borders, step-number circles, illustration, or as a tinted/light background fill for badges or callout boxes.

**If you need a callout or highlighted box:** use a cream background (`--cream-white` or `--cream-card`) with a hairline orange border. Never a tinted orange fill (`--orange-tint-light` exists in the palette but is intentionally unused on the live build).

## Typography

- **Headings** (h1–h4): Petrona, weights 500/600/700
- **Body, buttons, nav, labels**: Source Sans 3, weights 400/500/600/700
- Never substitute another font, including visually similar ones (no Inter, no other serif).

```css
h1,h2,h3,h4{ font-family:'Petrona', serif; font-weight:600; }
body{ font-family:'Source Sans 3', sans-serif; }
```

Google Fonts import:
```
https://fonts.googleapis.com/css2?family=Petrona:wght@500;600;700&family=Source+Sans+3:wght@400;500;600;700&display=swap
```

## Spacing

Whitespace is not incidental — it's carrying the "professional and trustworthy" half of the brand as much as any color choice. Don't compress it to fit more content above the fold; cut content instead.

| Value | Use |
|---|---|
| 22px | Tight grid gap (listing cards) |
| 24px | Standard grid gap (feature cards) |
| 32px | Generous grid gap (how-it-works steps) |
| 44px | Section head to content below it |
| 56px | Hero column gap |
| 76–96px | Section vertical padding — don't go below ~76px |

## Components

**Buttons** — pill-shaped, `border-radius: 999px`, padding `14px 28px`.
- Primary: `background: var(--orange)`, hover `var(--orange-hover)`, active `var(--orange-shade)`, text `var(--cream-white)`
- Secondary: transparent background, `border: 1.5px solid var(--charcoal)`, text `var(--ink-heading)`

**Step markers** — circle, 38px, `border: 1.5px solid var(--charcoal)`, transparent fill, Petrona numeral (never filled orange, never colored titles beneath).

**Listing cards** — `background: var(--cream-white)`, `border: 1px solid var(--cream-deep)`, `border-radius: 20px`. The orange hairline lives *only* in the meta-row divider at the bottom — not as a border around the whole card.

**Section labels (eyebrows)** — plain word or short phrase, sentence case in markup (`How it works`), rendered uppercase via `text-transform: uppercase` in CSS, color `var(--ink-muted)`. **No numbering** — never prefix with "01 —", "02 —", etc.

## Voice

Specific over generic, always:

| Generic | Refurbish |
|---|---|
| Fair condition | Needs a little love |
| Serves low-income families | For a family of four who don't yet have a place to sit down together |
| Available near you | Needed in Bedok |

## Logo

House-shaped mark containing "Re" in white on orange, next to "Furbish" in black. Give it clear space equal to the house shape's own height on all sides. Never recolor it or place it on busy photography without a solid cream/white background behind it.

## Photography

Same crop ratio across all listing photos, furniture filling ~70% of frame. Same rough white balance/warmth across shots — consistency matters more than any single photo being perfect. Real condition over polish; no stock photography. Captions live below the image, never overlaid on it.

## Slides (PowerPoint / .pptx)

**Read this before generating any Refurbish deck.** Anthropic's own slide-building skill defaults to two rules that will fight this brand specifically: *"never use accent lines under titles"* and *"avoid cream/beige backgrounds."* Those are sound defaults for a brand-less deck — but for Refurbish, the cream background and a restrained accent line are deliberate, established choices, not accidental defaults. Override both generic rules with what's below.

### Fonts — verify first, this is the most common failure

Petrona and Source Sans 3 don't load automatically in PowerPoint the way a Google Fonts link does on the web. Before generating anything:
- Confirm both fonts are installed on the machine that will open the file, or embed them in the `.pptx`
- If you can't guarantee either, say so explicitly rather than silently falling back — a silent fallback to Calibri or Arial is the single most common reason a Refurbish deck reads as off-brand even when every other rule was followed correctly

### Background & color

- Slide background: `--cream-base` (`FCF7E9`) exactly — not white
- Titles: `--ink-heading` (`16161D`). Body: `--ink-body` (`3A3A42`)
- Kicker labels (top-left of nearly every slide in the source deck — "INTRO," "CONCEPT," "LOGO," "AUGUST 2026"): `--ink-faint` (`9A9AA1`), uppercase, letter-spaced, small (11–12pt)
- pptxgenjs hex rule: no `#`, no 8-digit alpha — `color: "FCF7E9"`, never `"#FCF7E9"`

### The orange underline, as an actual shape

On the web this is a CSS `border-bottom` that sizes itself to the text automatically. PowerPoint has no equivalent — it's a separate rectangle or line shape that has to be manually measured and positioned to match the width of the specific title text above it.

- **Use once per deck** — the source deck uses it exactly once, under the title on the cover slide. Not on every section title.
- Thin: 2–3pt weight, a hairline, not a stripe
- Width must match the actual rendered text above it — a full-slide-width line, or one that doesn't reach the text's real edges, reads as generic. Check this specifically in visual QA.
- Color: `--orange` (`E35526`)

### Orange as a solid block — one deck-specific exception

The source deck has one slide that's a full-bleed solid orange panel with the "Re" mark reversed out in cream. This is a valid pattern for a single high-impact reveal or section-break slide (e.g. a logo reveal) — not something to repeat across multiple slides.

### Layout, from the source deck

- Kicker label top-left, same position every slide
- One idea per slide — the source deck never exceeds a title, one supporting line, and an optional short list
- Generous margins, roughly 0.7" from each edge
- Two-column comparisons (as in the "Concept" slide): a single thin vertical divider between columns, colored `--cream-deep`, not orange

### What does not translate from the web build

- Buttons, hover states, active states — no static-slide equivalent; skip entirely
- The listing-card component — not applicable to a deck
- The 22–96px web spacing scale — that's a browser-viewport scale; use the 0.7" margin figure above instead

### Slide-specific don'ts

- Don't add the orange underline to more than one slide per deck
- Don't swap the cream background for white to "fix" contrast — fix contrast by darkening text per the ink tokens above instead
- Don't let generic pptx-building instincts override the two items above — cream background and one restrained accent line are correct for this brand specifically, even though a generic checklist would flag both

## Quick "don't" list

- Don't introduce a separate warm-grey hue outside the charcoal ink ramp
- Don't use a tinted orange fill for badges, boxes, or callouts
- Don't number section labels
- Don't compress section padding below ~76px to fit more content in view
- Don't substitute Inter, or any font besides Petrona/Source Sans 3
- Don't make the underline a fixed-width bar unrelated to the text it sits under