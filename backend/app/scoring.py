"""Ranks furniture for a household case on what drives logistics cost:
lift access, proximity, dimensions and urgency. How much each counts depends
on how hard the item is to carry. Pure and import-light so it is easy to test.
"""

from datetime import date
from math import asin, cos, radians, sin, sqrt

# How much lift access matters for each category: 0 = carry it by hand,
# 1 = impractical without a lift.
CATEGORY_LIFT_IMPORTANCE = {
    "sofa": 0.9, "bed": 0.9, "storage": 0.8, "table": 0.5, "chair": 0.1, "other": 0.5,
}
DEFAULT_LIFT_IMPORTANCE = 0.5
# Size moves an item's lift importance up or down from its category's.
BULKY_SIDE_CM = 180
SMALL_SIDE_CM = 60
SIZE_ADJUSTMENT = 0.2
# From this importance on, the reasons say lift access was weighted highly.
HIGH_LIFT_IMPORTANCE = 0.7
UNCHECKED_DIMENSIONS_SHARE = 0.4
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


def fits(item, need):
    """True when the item fits the need's space, False when it is too big,
    None when a size is missing on either side."""
    item_size = item.get("dimensionsCm")
    space = need.get("maxDimensionsCm")
    sizes = [_size(d, k) for d in (item_size, space) for k in ("width", "depth", "height")]
    if any(size is None for size in sizes):
        return None
    width, depth, height, max_width, max_depth, max_height = sizes
    if height > max_height:
        return False
    # The item can be turned, so either orientation of the footprint counts.
    return (width <= max_width and depth <= max_depth) or (
        width <= max_depth and depth <= max_width
    )


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


def weights_for(importance):
    """Points out of 100. As lift importance rises, points move from
    proximity, urgency and dimensions to lift access."""
    weights = {
        "access": round(10 + 30 * importance),
        "proximity": round(40 - 20 * importance),
        "urgency": round(20 - 5 * importance),
    }
    weights["dimensions"] = 100 - sum(weights.values())
    return weights


def _km(a, b):
    """Great-circle distance between two (lat, lng) points."""
    lat1, lng1, lat2, lng2 = map(radians, (*a, *b))
    h = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lng2 - lng1) / 2) ** 2
    return 2 * EARTH_RADIUS_KM * asin(sqrt(h))


def _proximity(item, case):
    """The share of the proximity points and the reason, or (0, None)."""
    item_district = (item.get("location") or {}).get("district")
    case_district = (case.get("location") or {}).get("district")
    if not item_district or not case_district:
        return 0, None
    if item_district == case_district:
        return 1, "Same neighbourhood"
    here = NEIGHBOURHOOD_CENTROIDS.get(item_district)
    there = NEIGHBOURHOOD_CENTROIDS.get(case_district)
    if not here or not there:
        return 0, None
    km = _km(here, there)
    if km >= FAR_KM:
        return 0, None
    return 1 - km / FAR_KM, f"About {round(km)} km away"


def _has_lift(side):
    """Lift is a yes/no answer; anything but an explicit yes counts as no."""
    return (side or {}).get("hasLift") is True


def _days_left(item, today):
    try:
        delivery = date.fromisoformat(item.get("expectedDeliveryDate") or "")
    except ValueError:
        return None
    return (delivery - today).days


def score_match(item, case, today):
    """Transparent score out of 100. Return None when a hard constraint fails."""
    need = need_for(item, case)
    if need is None:
        return None
    if item.get("status") != "available":
        return None
    fit = fits(item, need)
    if fit is False:
        return None

    importance = lift_importance(item)
    weights = weights_for(importance)
    breakdown = dict.fromkeys(weights, 0)
    reasons = []

    share, reason = _proximity(item, case)
    breakdown["proximity"] = round(weights["proximity"] * share)
    if reason:
        reasons.append(reason)

    pickup = _has_lift(item.get("collection"))
    delivery = _has_lift(case.get("delivery"))
    breakdown["access"] = round(weights["access"] * (pickup + delivery) / 2)
    reasons.append("Lift at pickup" if pickup else "No lift at pickup")
    reasons.append("Lift at delivery" if delivery else "No lift at delivery")
    if importance >= HIGH_LIFT_IMPORTANCE:
        reasons.append("Lift access weighted highly for this item")

    if fit:
        breakdown["dimensions"] = weights["dimensions"]
        reasons.append("Fits the space")
    else:
        breakdown["dimensions"] = round(weights["dimensions"] * UNCHECKED_DIMENSIONS_SHARE)
        reasons.append("Size not checked")

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

    return {
        "score": sum(breakdown.values()),
        "scoreBreakdown": breakdown,
        "weights": weights,
        "reasons": reasons,
        "urgent": urgent,
    }
