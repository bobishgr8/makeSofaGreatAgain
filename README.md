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
GET                /api/matches/suggestions?caseId=
```

Matching ranks the available furniture for one case on what drives logistics cost: proximity (same neighbourhood, then same region), dimensions (the item must fit the space the case describes) and urgency (days left before the donor's delivery date). `backend/app/scoring.py` holds the score; `lifecycle.ineligible_reason` is the one definition of which items a case can take. Suggestions are computed on each request and never stored.

A match is made when a social worker requests an item for a case (`accept_match`), which moves it to `matched` and holds it for that case. The donor approves by connecting on WhatsApp (`connect`); they can also cancel the match, or find another match once connected. The social worker can release it. If the donor does not connect within 5 days the donation is withdrawn. The active match lives on the item (`activeMatch`) and the case's `fulfilment` field records which need it fills; there is no separate matches collection.

Once connected, the donor starts the delivery (`arrange_delivery`, status `to_deliver`) and sends a provider, a date and the pick-up and delivery addresses (`propose_logistics`). The social worker confirms (`confirm_logistics`, status `in_delivery`), asks for the details again (`rearrange_logistics`) or releases the item. Either side then marks the delivery complete (`complete_delivery`, status `delivered`) or calls it off (`cancel_delivery`), which returns the item to the pool. The proposal lives on the match (`activeMatch.logistics`); the beneficiary's address is kept in `furniture/{id}/private/contact` only while the delivery is being arranged. A delivered need moves from the case's `fulfilment` to its `delivered` field. No logistics provider is contacted: the choice is recorded and the donor books it themselves.

Furniture status changes only through `backend/app/lifecycle.py`: the transition table says which role can move an item from which status, and `POST /api/furniture/:id/actions/:action` (with the `expected_status` the screen was showing) is the only way to run one. Each change writes the item, the case it is matched to, a `statusHistory` entry and a `notificationsOutbox` entry per person to tell, in one transaction. Pick-up addresses live in `furniture/{id}/private/contact`, never on the listing.
