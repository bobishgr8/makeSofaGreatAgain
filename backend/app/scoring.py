def score_match(item, case):
    """Transparent MVP score. Return None when a hard constraint fails."""
    needs = case.get("needs", [])
    categories = {need.get("category", "").lower() for need in needs}
    if item.get("category", "").lower() not in categories:
        return None
    if item.get("status") != "available":
        return None

    breakdown = {"category": 30, "location": 0, "condition": 0, "logistics": 0, "priority": 0}
    reasons = ["Exact furniture category"]

    item_location = item.get("location", {})
    case_location = case.get("location", {})
    if item_location.get("district") == case_location.get("district"):
        breakdown["location"] = 20
        reasons.append("Same neighbourhood")
    elif item_location.get("city") == case_location.get("city"):
        breakdown["location"] = 12
        reasons.append("Same service area")

    condition = item.get("condition", "").lower()
    condition_points = {"new": 15, "excellent": 15, "good": 12, "usable": 7}
    breakdown["condition"] = condition_points.get(condition, 0)
    if breakdown["condition"]:
        reasons.append("Suitable usable condition")

    collection = item.get("collection", {})
    delivery = case.get("delivery", {})
    if collection.get("donorCanDeliver"):
        breakdown["logistics"] = 20
        reasons.append("Donor can deliver")
    elif delivery.get("transportAvailable"):
        breakdown["logistics"] = 15
        reasons.append("Collection transport available")
    elif collection.get("hasLift") and delivery.get("hasLift"):
        breakdown["logistics"] = 8
        reasons.append("Lift access at both locations")

    priority_points = {"urgent": 15, "high": 12, "standard": 7}
    breakdown["priority"] = priority_points.get(case.get("priority", "").lower(), 0)
    return {"score": sum(breakdown.values()), "scoreBreakdown": breakdown, "reasons": reasons}
