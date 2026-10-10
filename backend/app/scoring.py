"""Ranks furniture for a household case on what drives logistics cost:
proximity, dimensions and urgency. Pure and import-free so it is easy to test.
"""

from datetime import date

WEIGHTS = {"proximity": 40, "dimensions": 35, "urgency": 25}
SAME_REGION_POINTS = 20
UNCHECKED_DIMENSIONS_POINTS = 15
# Full urgency points at this many days before the delivery date, none at RELAXED_DAYS.
URGENT_DAYS = 7
RELAXED_DAYS = 30

# There are no coordinates to measure distance with, so proximity is by
# neighbourhood, then by region. Every neighbourhood in config.NEIGHBOURHOODS
# needs an entry (checked by backend/tests/test_matching.py).
NEIGHBOURHOOD_REGIONS = {
    "Ang Mo Kio": "North-East",
    "Bedok": "East",
    "Bishan": "Central",
    "Bukit Batok": "West",
    "Bukit Merah": "Central",
    "Bukit Panjang": "West",
    "Bukit Timah": "Central",
    "Choa Chu Kang": "West",
    "Clementi": "West",
    "Geylang": "Central",
    "Hougang": "North-East",
    "Jurong East": "West",
    "Jurong West": "West",
    "Kallang": "Central",
    "Marine Parade": "Central",
    "Pasir Ris": "East",
    "Punggol": "North-East",
    "Queenstown": "Central",
    "Sembawang": "North",
    "Sengkang": "North-East",
    "Serangoon": "North-East",
    "Tampines": "East",
    "Toa Payoh": "Central",
    "Woodlands": "North",
    "Yishun": "North",
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

    breakdown = {"proximity": 0, "dimensions": 0, "urgency": 0}
    reasons = []

    item_district = (item.get("location") or {}).get("district")
    case_district = (case.get("location") or {}).get("district")
    if item_district and case_district:
        region = NEIGHBOURHOOD_REGIONS.get(item_district)
        if item_district == case_district:
            breakdown["proximity"] = WEIGHTS["proximity"]
            reasons.append("Same neighbourhood")
        elif region and region == NEIGHBOURHOOD_REGIONS.get(case_district):
            breakdown["proximity"] = SAME_REGION_POINTS
            reasons.append(f"Same region ({region})")

    if fit:
        breakdown["dimensions"] = WEIGHTS["dimensions"]
        reasons.append("Fits the space")
    else:
        breakdown["dimensions"] = UNCHECKED_DIMENSIONS_POINTS
        reasons.append("Size not checked")

    days = _days_left(item, today)
    if days is not None:
        span = RELAXED_DAYS - URGENT_DAYS
        share = min(max((RELAXED_DAYS - days) / span, 0), 1)
        breakdown["urgency"] = round(WEIGHTS["urgency"] * share)
        if breakdown["urgency"]:
            reasons.append(
                "Needs a home today" if days <= 0
                else f"Needs a home within {days} day{'' if days == 1 else 's'}"
            )

    return {"score": sum(breakdown.values()), "scoreBreakdown": breakdown, "reasons": reasons}
