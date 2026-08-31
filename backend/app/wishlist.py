"""Pure transform from case documents to the public wishlist. Kept dependency
-free (no Flask, no Firestore) so it's directly unit-testable, the same way
scoring.py is.
"""

PRIORITY_RANK = {"urgent": 0, "high": 1, "standard": 2}
MAX_WISHLIST_ITEMS = 60


def build_wishlist(cases):
    """Raw case dicts -> the public, anonymised wishlist.

    Deliberately excludes case id, social worker id and anything from the
    case beyond what a social worker is told to keep non-identifying
    (household.summary is instructed to be e.g. "Parent with two children",
    never a name or address — see CaseForm's field guidance).

    Known gap: that "non-identifying" guidance is convention only, not
    enforced anywhere. A social worker could still type a name, address or
    other PII into household.summary, and it would be published here as-is
    since this endpoint has no auth and no content filtering on that field.
    Accepted as a judgement call for now; if it becomes a real concern, add
    validation on household.summary (e.g. length cap, a basic PII/name
    heuristic, or requiring social workers to pick from a template) the same
    way backend/app/validation.py does for the donor-facing form fields.
    """
    items = []
    for case in cases:
        if case.get("status") == "closed":
            continue

        summary = (case.get("household") or {}).get("summary")
        district = (case.get("location") or {}).get("district")
        priority = case.get("priority") or "standard"
        created_at = case.get("createdAt")

        for need in case.get("needs") or []:
            category = need.get("category") if isinstance(need, dict) else None
            if not category:
                continue
            items.append({
                "category": category,
                "neighbourhood": district,
                "summary": summary,
                "priority": priority,
                "createdAt": created_at,
            })

    items.sort(
        key=lambda item: (
            PRIORITY_RANK.get(item["priority"], 2),
            -(item["createdAt"].timestamp() if item.get("createdAt") else 0),
        ),
    )

    for item in items:
        item.pop("createdAt", None)

    return items[:MAX_WISHLIST_ITEMS]
