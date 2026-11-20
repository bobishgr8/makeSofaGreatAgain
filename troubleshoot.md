# Troubleshooting

## 2026-10-29: pytest not found when running backend tests
- Symptom: `python -m pytest` fails with `No module named pytest`.
- Cause: the `python` on PATH is another tool's virtualenv, not the project's.
- Fix: run tests with the backend virtualenv: `backend/.venv/Scripts/python -m pytest`.

## 2026-10-29: 33 API tests skipped
- Symptom: `backend/tests/test_furniture_api.py` tests are skipped with `FIRESTORE_EMULATOR_HOST not set`.
- Cause: the API tests need the Firestore emulator.
- Fix: from the repo root, run `firebase emulators:exec --only firestore --project demo-refurbish "cd backend && .venv\Scripts\python -m pytest -q"`. The command inside `emulators:exec` runs under cmd, so the path needs backslashes: `.venv/Scripts/python` fails with `'.venv' is not recognized`. Delete the `firestore-debug.log` it leaves behind.

## 2026-10-31: pushed commit not visible on GitHub main
- Symptom: after a push, the commit did not appear on `main`.
- Cause: it was pushed to a new `enhanced-matching-logic` branch.
- Fix: fast-forwarded `main` to the commit and pushed `main`. This repo commits straight to `main`.

## 2026-11-15: donated items never suggested for any case
- Symptom: the social worker's Suggested matches tab showed "No suitable matches found" for every test case, while Browse furniture listed the items as available.
- Cause: `lifecycle.ineligible_reason` dropped every item whose `expectedDeliveryDate` was 3 days away or less (`is_expired`). The donor form allows any date from today, so items created with a near date were never matchable, and older test items had October dates. They still showed as available because the expiry job (`/api/internal/expire`) does not run locally without `INTERNAL_SCHEDULER_TOKEN`.
- Fix: removed the delivery-date rule (`is_expired`, `expire_stale`, `expire_if_stale`, the `expire` transition) from `backend/app/lifecycle.py`, `backend/app/furniture.py` and `backend/app/internal.py`. Items are tagged urgent on their delivery date instead (`backend/app/scoring.py`, `frontend/src/modules/matching/MatchCard.tsx`). The suggestions approval/ownership check was removed at the same time. The category check stays, as a simple same-category match.
- Found with: a read-only script that loads `create_app()`, reads both collections with the service account, and runs each case and item pair through `ineligible_reason` and `score_match`.

## 2026-11-15: standalone script fails with "Invalid certificate argument: None"
- Symptom: a script outside `backend/` calling `create_app()` raised `ValueError: Invalid certificate argument: "None"`.
- Cause: `load_dotenv()` searches from the script's own folder, so `FIREBASE_SERVICE_ACCOUNT` from `backend/.env` was never loaded.
- Fix: run the script from `backend/` and call `load_dotenv(os.path.join(os.getcwd(), ".env"))`.

## 2026-11-21: backend would not start, frontend build failed
- Symptom: every backend import failed with `ImportError: cannot import name 'validate_donor_profile'` (then `CATEGORY_LABELS`); 4 test modules could not load; `npm run build` had 23 TypeScript errors (`AdminTab`, `RoleFilter`, `furnitureSearch`, `showCase`, `Match` not found; `delivered` listed twice in `FurnitureDTO.ts`).
- Cause: the 2026-10-11 merge `7e4a565` kept one side's callers (`donors.py`, `whatsapp.py`, `AdminDashboard.tsx`, the old reservation card in `MatchList.tsx`) but the other side's definitions (`validation.py`, `config.py`, `FurnitureDTO.ts`, `MatchCard.tsx`). Server-side donation-form validation was silently dropped with it.
- Fix: restored `validate_furniture` / `validate_donor_profile` (blank values now count as "not given", since admins can switch form fields off) and `CATEGORY_LABELS` from `897aed6`; create validates in the route, edit validates in `lifecycle.plan_edit` after the ownership/status checks; restored the admin filter declarations; removed the dead "My reservations" tab (it filtered on statuses that no longer exist).
- Check after any merge: `python -m unittest discover -s backend/tests` and `cd frontend && npm run build` must both pass. Neither is run automatically.
