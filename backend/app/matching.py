from datetime import datetime, timezone

from flask import Blueprint, g, jsonify, request

from .auth import require_auth
from .firebase import get_db, serialise
from .scoring import score_match

matching_bp = Blueprint("matching", __name__, url_prefix="/api/matches")


@matching_bp.get("")
@require_auth({"social_worker", "admin"})
def list_matches():
    query = get_db().collection("matches")
    if g.user["role"] != "admin":
        query = query.where("socialWorkerId", "==", g.user["uid"])
    return jsonify([serialise(document) for document in query.limit(100).stream()])


@matching_bp.post("/generate")
@require_auth({"social_worker", "admin"})
def generate_matches():
    db = get_db()
    case_id = request.get_json(force=True).get("caseId")
    case_document = db.collection("cases").document(case_id).get()
    if not case_document.exists:
        return jsonify({"error": "Case not found"}), 404
    case = case_document.to_dict()
    print(case)
    suggestions = []
    for item_document in db.collection("furniture").where("status", "==", "available").stream():
        item = item_document.to_dict()
        result = score_match(item, case)
        print(result)
        if result is None:
            continue
        suggestion = {
            "furnitureId": item_document.id,
            "caseId": case_id,
            "socialWorkerId": case.get("socialWorkerId"),
            "status": "suggested",
            "createdAt": datetime.now(timezone.utc),
            **result,
        }
        reference = db.collection("matches").document()
        reference.set(suggestion)
        suggestions.append({"id": reference.id, **suggestion})

    suggestions.sort(key=lambda match: match["score"], reverse=True)
    return jsonify(suggestions[:10])


@matching_bp.patch("/<match_id>")
@require_auth({"social_worker", "admin"})
def update_match(match_id):
    allowed_statuses = {"reviewed", "offered", "accepted", "declined", "reserved", "completed", "cancelled"}
    status = request.get_json(force=True).get("status")
    if status not in allowed_statuses:
        return jsonify({"error": "Unsupported match status"}), 400
    reference = get_db().collection("matches").document(match_id)
    if not reference.get().exists:
        return jsonify({"error": "Match not found"}), 404
    reference.update({"status": status, "updatedAt": datetime.now(timezone.utc)})
    return jsonify(serialise(reference.get()))
