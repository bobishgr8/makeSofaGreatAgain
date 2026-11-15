# Architecture

## Furniture matching

Matching connects two banks: furniture that donors submit (`furniture` collection) and cases that social workers create (`cases` collection, each with a list of `needs`). Suggestions are worked out on each request and never stored. A match only exists once a social worker requests an item.

### Suggestion pipeline

`GET /api/matches/suggestions?caseId=` in `backend/app/matching.py` (`suggest_matches`):

1. Reads every item with `status == "available"`. Items are `pending_review` until an admin approves them.
2. Drops items that fail `lifecycle.ineligible_reason(item, case, today)` (`backend/app/lifecycle.py`). This is the one definition of eligibility, shared with the request guard. An item is dropped when:
   - it is not `available`
   - the case is not `open`
   - the item was released or rematched away from this case before (`declinedCaseIds`)
   - the item's category is not one of the case's needs (`scoring.need_for`: exact, case-insensitive match; the donor and case forms pick from the same `categoryLabels` list in `config.py`)
   - the case already has a match or a delivery for the item's category (`fulfilment` / `delivered`, one item per category per case)
   - the need has a full `maxDimensionsCm` and the item does not fit it (`scoring.fits`, footprint can be turned)
3. Scores the rest with `scoring.score_match` and returns the top `SUGGESTION_LIMIT` (10), highest first.

The endpoint needs a signed-in `social_worker` or `admin`. It does not check social worker approval or case ownership. Requesting an item (`accept_match`, `lifecycle._guard_accept_match`) still requires an approved social worker who owns the case and has an organisation and WhatsApp number on their profile.

The delivery date is not a filter: items are never dropped or withdrawn for being near or past `expectedDeliveryDate`. The category match is deliberately simple for now; a comparison of more fields between the donor and case forms is planned.

### Scoring (`backend/app/scoring.py`)

Pure, standard library only, unit tested in `backend/tests/test_matching.py`. `score_match` returns `score` (out of 100), `scoreBreakdown`, `weights`, `reasons` and `urgent`.

Four components:

| Component | How it is scored |
|---|---|
| `access` | Half the points for a lift at pickup (`item.collection.hasLift`), half for a lift at delivery (`case.delivery.hasLift`). Only an explicit `True` counts. |
| `proximity` | Full points for the same neighbourhood. Otherwise scaled by km between approximate neighbourhood centres (`NEIGHBOURHOOD_CENTROIDS`, haversine `_km`), zero from `FAR_KM` (20 km). |
| `dimensions` | Full points when the item fits the space, `UNCHECKED_DIMENSIONS_SHARE` (0.4) when a size is missing on either side. |
| `urgency` | Full points at 7 days or less to `expectedDeliveryDate` (including past dates), none at 30 days or more, linear between. |

Weights depend on the item. `lift_importance(item)` gives 0 to 1 from `CATEGORY_LIFT_IMPORTANCE` (sofa and bed 0.9, storage 0.8, table and other 0.5, chair 0.1), plus 0.2 if any side is 180 cm or more, minus 0.2 if all sides are 60 cm or less. `weights_for(importance)` then moves points from proximity, urgency and dimensions to access (access `10 + 30k`, proximity `40 - 20k`, urgency `20 - 5k`, dimensions takes the remainder so the total is 100).

`urgent` is true on the donor's delivery date itself, with the reason "Last day for donation". Items past the date get "Past the donor's delivery date".

`backend/app/config.py` `NEIGHBOURHOODS` and `scoring.NEIGHBOURHOOD_CENTROIDS` must list the same neighbourhoods (checked by `test_every_neighbourhood_has_a_centre`).

### Frontend

- `frontend/src/modules/matching/MatchList.tsx` calls the suggestions endpoint for the selected case.
- `frontend/src/modules/matching/MatchCard.tsx` shows the score, the reasons, and an `Urgent` pill (`pill pill-warning`) when `suggestion.urgent` is true.
- `frontend/src/common/dto/MatchDTO.ts` `Suggestion` mirrors the `score_match` output, including optional `weights` and `urgent`.
- `frontend/src/modules/socialWorkers/CaseForm.tsx`: the Lift access select starts on an empty "Choose one" option, so the social worker has to answer.

### Match lifecycle (`backend/app/lifecycle.py` `TRANSITIONS`)

`available` > `accept_match` (social worker) > `matched` > `connect` (donor, within `CONNECT_DAYS` = 5) > `arrange_delivery` > `to_deliver` > `confirm_logistics` (social worker) > `in_delivery` > `complete_delivery` (either side) > `delivered`. A match is successful only at `delivered`, which moves the category from the case's `fulfilment` to `delivered`.

Rematch, release and cancel delivery return the item to `available` and add the case to `declinedCaseIds`. A donor who does not connect in time is lapsed to `withdrawn` by `lapse_overdue`.

### Scheduler endpoint

`POST /api/internal/expire` (`backend/app/internal.py`) runs `lifecycle.lapse_overdue` only and returns `{"lapsed": [...]}`. It is disabled unless `INTERNAL_SCHEDULER_TOKEN` is set, and no scheduler calls it yet. The path keeps its old name. `NO_MATCH_REASON` stays in `lifecycle.py` for items withdrawn by the old expiry rule.
