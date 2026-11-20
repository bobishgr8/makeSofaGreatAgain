# ReFurbish — source project

A deliberately lean React + Flask + Firebase CRUD application for redistributing useful furniture through ReFurbish community partners.

## Structure

```text
refurbish-platform/
├── frontend/src/
│   ├── app/                  # composition, routes and auth state
│   ├── common/               # shared UI, API client, Firebase and CSS
│   └── modules/              # auth, donors, social workers, furniture, matching, admin
├── backend/app/              # Flask blueprints and Firebase Admin
├── backend/tests/            # matching tests
├── firebase.json
├── firestore.rules
└── storage.rules
```

There are intentionally no repository classes, dependency-injection container or domain framework. Components call one shared API client; each Flask Blueprint performs its own straightforward Firestore operations. The scoring function is separate because it is pure business logic and independently testable.

## Quickstart

You need Python 3.11+, Node 20+ and access to the team's Firebase project. Java and the Firebase CLI are only needed for the emulator tests.

**1. Get the secrets (once).** Ask a teammate for the Firebase web config and the service-account JSON, or download the JSON yourself from Firebase console → Project settings → Service accounts → Generate new private key. Save it as `firebaseServiceAccount.json` in the repo root. It is gitignored; never commit it.

**2. Backend (terminal 1):**

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env               # FIREBASE_SERVICE_ACCOUNT already points at ../firebaseServiceAccount.json
python run.py                      # http://localhost:5000
```

**3. Frontend (terminal 2):**

```bash
cd frontend
cp .env.example .env               # fill in the VITE_FIREBASE_* values from the web config
npm install
npm run dev                        # http://localhost:3000
```

**4. Make yourself admin (once).** Sign up in the app, then run this from the repo root and sign out and back in:

```bash
python backend/scripts/set_role.py --service-account firebaseServiceAccount.json --email you@example.org --role admin
```

**5. Optional extras:**

- **Background jobs** (expire old matches and waitlists, weekly summaries, send WhatsApp): `cd backend && python scripts/scheduler.py`, or press "Run jobs now" on the admin Dashboard tab.
- **WhatsApp bot:** see `whatsapp-bot/README.md`. Without it, messages wait in `notificationsOutbox` and nothing is lost.
- **Firestore emulator** (for the route tests): `firebase emulators:start`.

`requirements.txt` is what a server installs; `requirements-dev.txt` adds the test tools.

If something breaks, check `troubleshoot.md` first.

## Assigning roles (server-side)

A small helper script is included to set Firebase custom claims (role) for a user. Use this from a secure machine with your Firebase service account JSON.

Examples:

```bash
python backend/scripts/set_role.py --service-account /path/to/serviceAccount.json --email admin@example.org --role admin
python backend/scripts/set_role.py --service-account /path/to/serviceAccount.json --uid someFirebaseUid --role admin
```

After updating a user's role, they must refresh their ID token in the client (e.g. call `getIdToken(true)` or sign in again) to pick up the new role claim.

`AUTH_DISABLED=1` is only for local development. Production must verify Firebase ID tokens.

## Photos

Photos are redrawn in the browser before upload (`frontend/src/common/images.ts`): at most 1600 px on the long side, saved as JPEG. Redrawing drops the file's metadata, including the GPS position phones record, which would otherwise reveal the donor's home on the public listing. A photo the browser can't read is refused rather than uploaded as it is.

## Test

```bash
python -m unittest discover -s backend/tests -v
# Route tests run only against the Firestore emulator (needs Java):
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 python -m unittest backend/tests/test_furniture_api.py -v
cd frontend && npm run build
```

## Primary API routes

```text
GET/PATCH          /api/donors/me
GET/PATCH          /api/social-workers/me
GET/POST           /api/furniture
GET                /api/furniture/mine
GET/PATCH          /api/furniture/:id
POST               /api/furniture/:id/actions/:action
GET/POST           /api/cases
GET/PATCH/DELETE   /api/cases/:id
GET                /api/matches
GET                /api/matches/suggestions?caseId=   (available items, then held ones with waitlist: true)
GET                /api/matches/waitlist
POST               /api/furniture/:id/thank-you
GET                /api/thank-you-notes
GET                /api/admin/stats
POST               /api/admin/run-jobs
POST               /api/internal/run-jobs              (X-Internal-Token)
```

### Matching

Matching suggests furniture for one case. Suggestions are computed on each request and never stored. `lifecycle.ineligible_reason` decides which items a case can take; `backend/app/scoring.py` holds the score.

**1. Which items are considered.** An item is left out only when one of these fails:

| Check | Left out when |
|---|---|
| Available | The item isn't approved yet, or is already matched, delivered, withdrawn or rejected |
| Case open | The case is closed |
| Same category | The item's category isn't the one the case asked for |
| Not released before | The item was already released or rematched away from this case |
| Need still open | The case already has a matched or delivered item in that category |

**2. How each item is scored (out of 100).** `k` is lift importance, from 0 to 1: fridge 1.0, washing machine, sofa and bed 0.9, storage 0.8, table and other 0.5, chair 0.1, plus 0.2 if any side is 180 cm or more, minus 0.2 if all sides are 60 cm or less.

| Half | Part | Points | How it is scored |
|---|---|---|---|
| Request fit (50) | Size | 30 | Fits the space: 30. Fits the floor space but is taller than the height given: 20. Footprint too big, even turned round: 0, and the item is always weak. A width or depth missing: 12. |
| | Condition | 20 | Excellent 20, good 16, usable 12, needs minor repair 6 |
| Delivery feasibility (50) | Lift access | 5 + 15k | Half for each end. Pickup: a lift is full; no lift but the item can be dismantled is half. Delivery: the household's lift is full, unless the item doesn't fit a lift. |
| | Distance | 20 − 10k | Full in the same neighbourhood, less with each km between neighbourhood centres, none from 20 km |
| | Transport | 10 | Full if the household has transport or the donor delivers across the network. "Near my area": full within 10 km, else half. "Possibly": half. "Collection only": none. |
| | Urgency | the rest (15 − 5k) | Full when the donor's delivery date is 7 days away or less (or past), none at 30 days or more |

The bulkier the item, the more lift access counts and the less distance does, so a sofa from further away with a lift beats a nearby one without.

**3. How matches are ranked and shown.**

| Order | What | How it is shown |
|---|---|---|
| 1 | Strong matches: score 50 or more, and the footprint fits or wasn't checked | Highest score first, up to 10 |
| 2 | Weak matches: score below 50, or too big for the space | Hidden behind "Show N weaker matches", highest score first, up to 10, each with a "Weak match" pill |
| 3 | Waitlist: items already held for another case that would fit this one, scored as if free | Under "Join a waitlist", highest score first, up to 5 |

Each card shows the score, "Fit x/50 · Delivery y/50", the reasons behind the score, and an "Urgent" pill on the donor's delivery date.

A match is made when a social worker requests an item for a case (`accept_match`), which moves it to `matched` and holds it for that case. The donor approves by connecting on WhatsApp (`connect`); they can also cancel the match, or find another match once connected. The social worker can release it. If the donor does not connect within 5 days the donation is withdrawn. The active match lives on the item (`activeMatch`) and the case's `fulfilment` field records which need it fills; there is no separate matches collection.

Once connected, the donor starts the delivery (`arrange_delivery`, status `to_deliver`) and sends a provider, a date and the pick-up and delivery addresses (`propose_logistics`). The social worker confirms (`confirm_logistics`, status `in_delivery`), asks for the details again (`rearrange_logistics`) or releases the item. Either side then marks the delivery complete (`complete_delivery`, status `delivered`) or calls it off (`cancel_delivery`), which returns the item to the pool. The proposal lives on the match (`activeMatch.logistics`); the beneficiary's address is kept in `furniture/{id}/private/contact` only while the delivery is being arranged. A delivered need moves from the case's `fulfilment` to its `delivered` field. No logistics provider is contacted: the choice is recorded and the donor books it themselves.

Furniture status changes only through `backend/app/lifecycle.py`: the transition table says which role can move an item from which status, and `POST /api/furniture/:id/actions/:action` (with the `expected_status` the screen was showing) is the only way to run one. Each change writes the item, the case it is matched to, a `statusHistory` entry and a `notificationsOutbox` entry per person to tell, in one transaction. Pick-up addresses live in `furniture/{id}/private/contact`, never on the listing.
