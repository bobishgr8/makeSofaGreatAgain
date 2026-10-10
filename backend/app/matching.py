from flask import Blueprint, g, jsonify, request

from . import lifecycle
from .auth import require_auth
from .firebase import get_db
from .furniture import _item, _private_ref
from .scoring import score_match
from .validation import today_sgt

matching_bp = Blueprint("matching", __name__, url_prefix="/api/matches")

SUGGESTION_LIMIT = 10


@matching_bp.get("")
@require_auth({"social_worker", "admin"}, require_approval=True)
def list_matches():
    """The furniture matched to the caller's cases, from the request through to
    delivery (every match for an admin)."""
    db = get_db()
    query = db.collection(lifecycle.COLLECTION)
    if g.user["role"] == "admin":
        query = query.where("status", "in", [*lifecycle.ACTIVE_MATCH_STATUSES, "delivered"])
    else:
        query = query.where("activeMatch.socialWorkerId", "==", g.user["uid"])
    snapshots = list(query.limit(100).stream())

    privates = {}
    if snapshots:
        for private in db.get_all([_private_ref(s.reference) for s in snapshots]):
            privates[private.reference.parent.parent.id] = private.to_dict() or {}

    return jsonify([
        lifecycle.view(_item(snapshot), g.user, privates.get(snapshot.id, {}))
        for snapshot in snapshots
    ])


@matching_bp.get("/suggestions")
@require_auth({"social_worker", "admin"}, require_approval=True)
def suggest_matches():
    """Rank the available furniture for one case. Nothing is stored: a match
    only exists once the social worker requests an item (lifecycle accept_match)."""
    db = get_db()
    case_id = request.args.get("caseId")
    if not case_id:
        return jsonify({"error": "caseId is required"}), 400
    case_document = db.collection(lifecycle.CASES).document(case_id).get()
    if not case_document.exists:
        return jsonify({"error": "Case not found"}), 404
    case = {**case_document.to_dict(), "id": case_document.id}
    if g.user["role"] != "admin" and case.get("socialWorkerId") != g.user["uid"]:
        return jsonify({"error": "Case not found"}), 404

    today = today_sgt()
    suggestions = []
    available = db.collection(lifecycle.COLLECTION).where("status", "==", "available")
    for document in available.stream():
        item = _item(document)
        if lifecycle.ineligible_reason(item, case, today):
            continue
        result = score_match(item, case, today)
        if result is None:
            continue
        suggestions.append({"furniture": lifecycle.view(item, g.user), **result})

    suggestions.sort(key=lambda suggestion: suggestion["score"], reverse=True)
    return jsonify(suggestions[:SUGGESTION_LIMIT])
