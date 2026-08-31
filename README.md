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

## Start Firebase emulators

```bash
firebase emulators:start
```

## Start Flask

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp env.example .env
flask --app run.py run --debug
```

### Assigning admin roles (server-side)

A small helper script is included to set Firebase custom claims (role) for a user. Use this from a secure machine with your Firebase service account JSON.

Examples:

```bash
python backend/scripts/set_role.py --service-account /path/to/serviceAccount.json --email admin@example.org --role admin
python backend/scripts/set_role.py --service-account /path/to/serviceAccount.json --uid someFirebaseUid --role admin
```

After updating a user's role, they must refresh their ID token in the client (e.g. call `getIdToken(true)` or sign in again) to pick up the new role claim.

`AUTH_DISABLED=1` is only for local development. Production must verify Firebase ID tokens.

## Start React

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

## Test

```bash
python -m unittest backend/tests/test_matching.py -v
cd frontend && npm run build
```

## Primary API routes

```text
GET/PATCH          /api/donors/me
GET                /api/social-workers/me
GET/POST           /api/furniture
GET/PATCH/DELETE   /api/furniture/:id
GET/POST           /api/cases
GET/PATCH/DELETE   /api/cases/:id
GET                /api/matches
POST               /api/matches/generate
PATCH              /api/matches/:id
```

The matching engine first rejects incompatible or unavailable furniture, then scores category, neighbourhood, condition, delivery logistics and household priority. Every result includes a score breakdown and plain-language reasons.

## Donation form validation limits

`backend/app/validation.py` is the source of truth — it runs on every `POST /api/furniture`, `PATCH /api/furniture/:id` and `PATCH /api/donors/me`, so it can't be bypassed by calling the API directly. `frontend/src/modules/furniture/FurnitureForm.tsx` mirrors the same numbers so a donor gets an immediate, specific message (e.g. "Quantity must be a whole number between 1 and 20") instead of a round trip to the server to find out `-9999` isn't a valid number of washing machines.

| Field | Rule |
|---|---|
| Quantity | whole number, 1–20 |
| Width / depth / height (cm) | whole number, 1–500 |
| Floor | whole number, 0–150 |
| Listing title | 3–120 characters |
| Subcategory | up to 80 characters |
| Condition note | 5–800 characters |
| Photos | up to 5 |
| Condition, fits-in-lift, disassembly, delivery area, deadline type | must be one of that field's allowed choices |
| Contact name | up to 80 characters |
| WhatsApp number | must match `+?[0-9()\- ]{7,20}` (optional leading `+`, digits, spaces/hyphens/parentheses) |

The validator only checks fields that are actually present in the request body, so a donor's partial `PATCH` isn't forced to resend every field. Covered by `backend/tests/test_validation.py` (`python -m pytest backend/tests -q`).

Two fields — "This item came from a home with pets" and "This item came from a smoking household" — are informational disclosures rather than constrained inputs: they're plain booleans with no format to validate, shown to the recipient/social worker on the listing's Safety section.
