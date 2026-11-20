"""Ranks furniture for a household case out of 100, in two halves:

- Request fit (50): how well the item suits what the case asked for
  (size and condition).
- Delivery feasibility (50): how easy it is to get there (lift access,
  distance, transport, urgency). How much lift access counts depends on how
  hard the item is to carry.

Items below MIN_SCORE are marked weak. Pure and import-light so it is easy to test.
"""

from datetime import date
from math import asin, cos, radians, sin, sqrt

# How much lift access matters for each category: 0 = carry it by hand,
# 1 = impractical without a lift.
CATEGORY_LIFT_IMPORTANCE = {
    "fridge": 1.0, "washing_machine": 0.9,
    "sofa": 0.9, "bed": 0.9, "storage": 0.8, "table": 0.5, "chair": 0.1, "other": 0.5,
}
DEFAULT_LIFT_IMPORTANCE = 0.5
# Size moves an item's lift importance up or down from its category's.
BULKY_SIDE_CM = 180
SMALL_SIDE_CM = 60
SIZE_ADJUSTMENT = 0.2
# From this importance on, the reasons say lift access was weighted highly.
HIGH_LIFT_IMPORTANCE = 0.7

# Request fit: 50 points.
SIZE_POINTS = 30
# The footprint fits but the item is taller than the height the case gave.
TALLER_SIZE_POINTS = 20
UNCHECKED_SIZE_POINTS = 12
CONDITION_POINTS = 20
CONDITION_SHARE = {"excellent": 1.0, "good": 0.8, "usable": 0.6, "repair_needed": 0.3}
CONDITION_LABELS = {
    "excellent": "Excellent condition",
    "good": "Good condition",
    "usable": "Usable condition",
    "repair_needed": "Needs minor repair",
}
UNKNOWN_CONDITION_SHARE = 0.6

# Delivery feasibility: 50 points.
FEASIBILITY_POINTS = 50
TRANSPORT_POINTS = 10
# "Yes, near my area" counts as full delivery help within this distance.
LOCAL_DELIVERY_KM = 10
# Items below this score are weak: hidden until the social worker asks to see them.
MIN_SCORE = 50
# Full urgency points at this many days before the delivery date, none at RELAXED_DAYS.
URGENT_DAYS = 7
RELAXED_DAYS = 30

# No proximity points from this distance on.
FAR_KM = 20
EARTH_RADIUS_KM = 6371
# Approximate neighbourhood centres, as there are no addresses to measure from.
# Every neighbourhood in config.NEIGHBOURHOODS needs an entry (checked by
# backend/tests/test_matching.py).
NEIGHBOURHOOD_CENTROIDS = {
    "Ang Mo Kio": (1.3691, 103.8454),
    "Bedok": (1.3236, 103.9273),
    "Bishan": (1.3526, 103.8352),
    "Bukit Batok": (1.3590, 103.7637),
    "Bukit Merah": (1.2819, 103.8239),
    "Bukit Panjang": (1.3774, 103.7719),
    "Bukit Timah": (1.3294, 103.8021),
    "Choa Chu Kang": (1.3840, 103.7470),
    "Clementi": (1.3162, 103.7649),
    "Geylang": (1.3201, 103.8918),
    "Hougang": (1.3612, 103.8863),
    "Jurong East": (1.3329, 103.7436),
    "Jurong West": (1.3404, 103.7090),
    "Kallang": (1.3100, 103.8651),
    "Marine Parade": (1.3020, 103.8971),
    "Pasir Ris": (1.3721, 103.9474),
    "Punggol": (1.3984, 103.9072),
    "Queenstown": (1.2942, 103.7861),
    "Sembawang": (1.4491, 103.8185),
    "Sengkang": (1.3868, 103.8914),
    "Serangoon": (1.3554, 103.8679),
    "Tampines": (1.3496, 103.9568),
    "Toa Payoh": (1.3343, 103.8563),
    "Woodlands": (1.4382, 103.7890),
    "Yishun": (1.4304, 103.8354),
}


def category_key(item):
    return (item.get("category") or "").lower()


def need_for(item, case):
    """The case's need this item would fill, or None."""
    category = category_key(item)
    if not category:
        return None
    for need in case.get("needs") or []:
        if (need.get("category") or "").lower() == category:
            return need
    return None


def _size(dimensions, key):
    value = (dimensions or {}).get(key)
    return value if isinstance(value, (int, float)) and value > 0 else None


def size_fit(item, need):
    """How the item's size compares with the need's space:

    - "fits": the footprint fits, and so does the height when both are given
    - "taller": the footprint fits but the item is taller than the height given
    - "too_big": the footprint does not fit, even turned round
    - None: a width or depth is missing on either side

    Never excludes an item: a too-big one is shown as a weak match instead.
    """
    item_size = item.get("dimensionsCm")
    space = need.get("maxDimensionsCm")
    width, depth, max_width, max_depth = (
        _size(d, k) for d in (item_size, space) for k in ("width", "depth")
    )
    if None in (width, depth, max_width, max_depth):
        return None
    # The item can be turned, so either orientation of the footprint counts.
    if not ((width <= max_width and depth <= max_depth) or (width <= max_depth and depth <= max_width)):
        return "too_big"
    height, max_height = _size(item_size, "height"), _size(space, "height")
    if height and max_height and height > max_height:
        return "taller"
    return "fits"


def lift_importance(item):
    """0 to 1: how much lift access matters for moving this item."""
    importance = CATEGORY_LIFT_IMPORTANCE.get(category_key(item), DEFAULT_LIFT_IMPORTANCE)
    sides = [
        size for size in (_size(item.get("dimensionsCm"), key) for key in ("width", "depth", "height"))
        if size is not None
    ]
    if sides and max(sides) >= BULKY_SIDE_CM:
        importance += SIZE_ADJUSTMENT
    elif len(sides) == 3 and max(sides) <= SMALL_SIDE_CM:
        importance -= SIZE_ADJUSTMENT
    return min(max(importance, 0), 1)


def feasibility_weights(importance):
    """The 50 delivery feasibility points. As lift importance rises, points
    move from proximity and urgency to lift access."""
    weights = {
        "access": round(5 + 15 * importance),
        "proximity": round(20 - 10 * importance),
        "transport": TRANSPORT_POINTS,
    }
    weights["urgency"] = FEASIBILITY_POINTS - sum(weights.values())
    return weights


def _km(a, b):
    """Great-circle distance between two (lat, lng) points."""
    lat1, lng1, lat2, lng2 = map(radians, (*a, *b))
    h = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lng2 - lng1) / 2) ** 2
    return 2 * EARTH_RADIUS_KM * asin(sqrt(h))


def _distance_km(item, case):
    """Km between the two neighbourhoods (0 for the same one), or None if unknown."""
    item_district = (item.get("location") or {}).get("district")
    case_district = (case.get("location") or {}).get("district")
    if not item_district or not case_district:
        return None
    if item_district == case_district:
        return 0
    here = NEIGHBOURHOOD_CENTROIDS.get(item_district)
    there = NEIGHBOURHOOD_CENTROIDS.get(case_district)
    if not here or not there:
        return None
    return _km(here, there)


def _proximity(km):
    """The share of the proximity points and the reason, or (0, None)."""
    if km is None or km >= FAR_KM:
        return 0, None
    if km == 0:
        return 1, "Same neighbourhood"
    return 1 - km / FAR_KM, f"About {round(km)} km away"


def _has_lift(side):
    """Lift is a yes/no answer; anything but an explicit yes counts as no."""
    return (side or {}).get("hasLift") is True


def _access(item, case):
    """The share of the access points (half per end) and the reasons."""
    collection = item.get("collection") or {}
    if _has_lift(collection):
        pickup, pickup_reason = 1, "Lift at pickup"
    elif collection.get("disassembly") in ("yes", "already"):
        # Carrying it down in parts is easier than carrying it whole.
        pickup, pickup_reason = 0.5, "No lift at pickup, but it can be dismantled"
    else:
        pickup, pickup_reason = 0, "No lift at pickup"
    if not _has_lift(case.get("delivery")):
        delivery, delivery_reason = 0, "No lift at delivery"
    elif collection.get("fitsInLift") == "no":
        delivery, delivery_reason = 0, "Lift at delivery, but the item doesn't fit a lift"
    else:
        delivery, delivery_reason = 1, "Lift at delivery"
    return (pickup + delivery) / 2, [pickup_reason, delivery_reason]


def _transport(item, case, km):
    """The share of the transport points and the reason."""
    if (case.get("delivery") or {}).get("transportAvailable") is True:
        return 1, "Household has transport"
    area = (item.get("collection") or {}).get("deliveryArea")
    if area == "network":
        return 1, "Donor can deliver"
    if area == "local":
        if km is not None and km <= LOCAL_DELIVERY_KM:
            return 1, "Donor can deliver nearby"
        return 0.5, "Donor delivers near their area only"
    if area == "maybe":
        return 0.5, "Donor may help deliver"
    if area == "no":
        return 0, "No transport on either side"
    return 0.5, "Transport not confirmed"


def _days_left(item, today):
    try:
        delivery = date.fromisoformat(item.get("expectedDeliveryDate") or "")
    except ValueError:
        return None
    return (delivery - today).days


def score_match(item, case, today):
    """Transparent score out of 100. Return None when a hard constraint fails
    (wrong category, or the item is no longer available)."""
    need = need_for(item, case)
    if need is None:
        return None
    if item.get("status") != "available":
        return None

    importance = lift_importance(item)
    weights = {"size": SIZE_POINTS, "condition": CONDITION_POINTS, **feasibility_weights(importance)}
    breakdown = dict.fromkeys(weights, 0)
    reasons = []

    # Request fit.
    fit = size_fit(item, need)
    size, space = item.get("dimensionsCm") or {}, need.get("maxDimensionsCm") or {}
    if fit == "fits":
        breakdown["size"] = SIZE_POINTS
        reasons.append("Fits the space")
    elif fit == "taller":
        breakdown["size"] = TALLER_SIZE_POINTS
        reasons.append(
            f"Fits the floor space, but taller than the height given "
            f"({size['height']} cm vs {space['height']} cm)"
        )
    elif fit == "too_big":
        reasons.append(
            f"Too big for the space: {size['width']}×{size['depth']} cm "
            f"vs {space['width']}×{space['depth']} cm"
        )
    else:
        breakdown["size"] = UNCHECKED_SIZE_POINTS
        reasons.append("Size not checked")

    condition = item.get("condition")
    breakdown["condition"] = round(
        CONDITION_POINTS * CONDITION_SHARE.get(condition, UNKNOWN_CONDITION_SHARE)
    )
    if condition in CONDITION_LABELS:
        reasons.append(CONDITION_LABELS[condition])

    # Delivery feasibility.
    km = _distance_km(item, case)
    share, reason = _proximity(km)
    breakdown["proximity"] = round(weights["proximity"] * share)
    if reason:
        reasons.append(reason)

    share, access_reasons = _access(item, case)
    breakdown["access"] = round(weights["access"] * share)
    reasons.extend(access_reasons)
    if importance >= HIGH_LIFT_IMPORTANCE:
        reasons.append("Lift access weighted highly for this item")

    share, reason = _transport(item, case, km)
    breakdown["transport"] = round(weights["transport"] * share)
    reasons.append(reason)

    days = _days_left(item, today)
    # Urgent on the donor's delivery date itself. Items past it are still shown.
    urgent = days == 0
    if days is not None:
        span = RELAXED_DAYS - URGENT_DAYS
        share = min(max((RELAXED_DAYS - days) / span, 0), 1)
        breakdown["urgency"] = round(weights["urgency"] * share)
        if days < 0:
            reasons.append("Past the donor's delivery date")
        elif urgent:
            reasons.append("Last day for donation")
        elif breakdown["urgency"]:
            reasons.append(f"Needs a home within {days} day{'' if days == 1 else 's'}")

    fit_points = breakdown["size"] + breakdown["condition"]
    score = sum(breakdown.values())
    return {
        "score": score,
        "fit": fit_points,
        "feasibility": score - fit_points,
        "scoreBreakdown": breakdown,
        "weights": weights,
        "reasons": reasons,
        "urgent": urgent,
        # A too-big item is always weak: shown, but only behind the reveal.
        "weak": score < MIN_SCORE or fit == "too_big",
    }
