# ReFurbish — source project

A deliberately lean React + Flask + Firebase CRUD application for redistributing useful furniture through ReFurbish community partners.

## Structure

```text
refurbish-platform/
├── frontend/src/
│   ├── app/                  # composition, routes and auth state
│   ├── common/               # shared UI, API client, Firebase and CSS
│   └── modules/              # auth, donors, social workers, furniture, matching
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
