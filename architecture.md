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

   Size is not a filter. An item that is too big for the space is still suggested, as a weak match (see Scoring), and can still be requested.
3. Scores the rest with `scoring.score_match` and returns the top `SUGGESTION_LIMIT` (10), highest first.

The endpoint needs a signed-in `social_worker` or `admin`. It does not check social worker approval or case ownership. Requesting an item (`accept_match`, `lifecycle._guard_accept_match`) still requires an approved social worker who owns the case and has an organisation and WhatsApp number on their profile.

The delivery date is not a filter: items are never dropped or withdrawn for being near or past `expectedDeliveryDate`. The category match is deliberately simple for now; a comparison of more fields between the donor and case forms is planned.

### Scoring (`backend/app/scoring.py`)

Pure, standard library only, unit tested in `backend/tests/test_matching.py`. `score_match` returns `score` (out of 100), `fit` and `feasibility` (each out of 50, adding up to `score`), `scoreBreakdown`, `weights`, `reasons`, `urgent` and `weak`. Only structured form fields are used (Stage 1). Household summary text matching is planned as Stage 2.

**Request fit (50):** how well the item suits what the case asked for.

| Component | How it is scored |
|---|---|
| `size` | From `size_fit(item, need)`: "fits" 30 (`SIZE_POINTS`); "taller" (the footprint fits but the item is taller than the height given) 20; "too_big" (the width × depth footprint does not fit, even turned round) 0 and the item is always weak; a width or depth missing on either side 12 (`UNCHECKED_SIZE_POINTS`). |
| `condition` | `CONDITION_POINTS` (20) times `CONDITION_SHARE`: excellent 1.0, good 0.8, usable 0.6, repair_needed 0.3 (unknown 0.6). |

**Delivery feasibility (50):** how easy it is to get the item there. `feasibility_weights(k)` sets the points from lift importance `k`.

| Component | Points | How it is scored |
|---|---|---|
| `access` | `5 + 15k` | Half for the pickup end, half for the delivery end (`_access`). Pickup: a lift (`item.collection.hasLift`) is full; no lift but `disassembly` "yes" or "already" is half. Delivery: a lift (`case.delivery.hasLift`) is full, unless the donor said `fitsInLift` "no". Only an explicit `True` counts as a lift. |
| `proximity` | `20 - 10k` | Full for the same neighbourhood. Otherwise scaled by km between approximate neighbourhood centres (`NEIGHBOURHOOD_CENTROIDS`, haversine `_km`), zero from `FAR_KM` (20 km). |
| `transport` | 10 | `_transport`: full if `case.delivery.transportAvailable`. Otherwise by `item.collection.deliveryArea`: "network" full, "local" full within `LOCAL_DELIVERY_KM` (10 km) else half, "maybe" half, "no" zero, missing half. |
| `urgency` | the rest (`15 - 5k`) | Full at 7 days or less to `expectedDeliveryDate` (including past dates), none at 30 days or more, linear between. |

`lift_importance(item)` gives 0 to 1 from `CATEGORY_LIFT_IMPORTANCE` (sofa and bed 0.9, storage 0.8, table and other 0.5, chair 0.1), plus 0.2 if any side is 180 cm or more, minus 0.2 if all sides are 60 cm or less. Bulky items therefore weigh lift access above distance.

`weak` is true when `score < MIN_SCORE` (50) or the item is too big for the space. `urgent` is true on the donor's delivery date itself, with the reason "Last day for donation". Items past the date get "Past the donor's delivery date".

`matching.suggest_matches` returns strong matches first, then weak ones, up to `SUGGESTION_LIMIT` (10) of each, in one list.

`backend/app/config.py` `NEIGHBOURHOODS` and `scoring.NEIGHBOURHOOD_CENTROIDS` must list the same neighbourhoods (checked by `test_every_neighbourhood_has_a_centre`).

### Frontend

- `frontend/src/modules/matching/MatchList.tsx` calls the suggestions endpoint for the selected case. It shows strong matches, and a "Show N weaker matches" button reveals the weak ones. With no strong matches it says so and still offers the button.
- `frontend/src/modules/matching/MatchCard.tsx` shows the score, "Fit x/50 · Delivery y/50", the reasons, an `Urgent` pill when `suggestion.urgent` is true and a `Weak match` pill when `suggestion.weak` is true (both `pill pill-warning`).
- `frontend/src/common/dto/MatchDTO.ts` `Suggestion` mirrors the `score_match` output, including optional `fit`, `feasibility`, `weak`, `weights` and `urgent`.
- `frontend/src/modules/socialWorkers/CaseForm.tsx`: the Lift access select starts on an empty "Choose one" option, so the social worker has to answer.

### Match lifecycle (`backend/app/lifecycle.py` `TRANSITIONS`)

`available` > `accept_match` (social worker) > `matched` > `connect` (donor, within `CONNECT_DAYS` = 5) > `arrange_delivery` > `to_deliver` > `confirm_logistics` (social worker) > `in_delivery` > `complete_delivery` (either side) > `delivered`. A match is successful only at `delivered`, which moves the category from the case's `fulfilment` to `delivered`.

Rematch, release and cancel delivery return the item to `available` and add the case to `declinedCaseIds`. A donor who does not connect in time is lapsed to `withdrawn` by `lapse_overdue`.

### Scheduler endpoint

`POST /api/internal/expire` (`backend/app/internal.py`) runs `lifecycle.lapse_overdue` only and returns `{"lapsed": [...]}`. It is disabled unless `INTERNAL_SCHEDULER_TOKEN` is set, and no scheduler calls it yet. The path keeps its old name. `NO_MATCH_REASON` stays in `lifecycle.py` for items withdrawn by the old expiry rule.
