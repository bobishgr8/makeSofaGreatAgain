from datetime import datetime, timezone

from flask import Blueprint, g, jsonify, request

from .auth import require_auth
from .firebase import get_db, serialise
from .scoring import score_match

matching_bp = Blueprint("matching", __name__, url_prefix="/api/matches")

MATCH_STATUSES = {
    "reviewed", "offered", "accepted", "declined",
    "reserved", "collected", "delivered", "completed", "cancelled",
}

# Match statuses that also drive the furniture record's own status, so the
# public listing, admin console and donor dashboard all reflect a reservation
# without the frontend having to update two records itself.
FURNITURE_MIRROR_STATUS = {
    "reserved": "matched",
    "collected": "collected",
    "delivered": "delivered",
}

MAX_NOTES_LENGTH = 1000


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
    data = request.get_json(force=True)
    status = data.get("status")
    if status not in MATCH_STATUSES:
        return jsonify({"error": "Unsupported match status"}), 400

    db = get_db()
    reference = db.collection("matches").document(match_id)
    document = reference.get()
    if not document.exists:
        return jsonify({"error": "Match not found"}), 404
    match = document.to_dict()

    if g.user["role"] == "social_worker" and match.get("socialWorkerId") != g.user["uid"]:
        return jsonify({"error": "This match belongs to another social worker"}), 403

    updates = {"status": status, "updatedAt": datetime.now(timezone.utc)}

    if status == "reserved":
        notes = (data.get("notes") or "").strip()
        if not notes:
            return jsonify({
                "error": "Add a note on how you'll contact the recipient before reserving"
            }), 400
        if len(notes) > MAX_NOTES_LENGTH:
            return jsonify({
                "error": f"Reservation notes must be at most {MAX_NOTES_LENGTH} characters"
            }), 400
        updates["notes"] = notes
        updates["reservedAt"] = datetime.now(timezone.utc)

    if status in ("collected", "delivered") and match.get("status") not in ("reserved", "collected"):
        return jsonify({"error": "Reserve this item before marking it collected or delivered"}), 409

    furniture_status = FURNITURE_MIRROR_STATUS.get(status)
    if furniture_status:
        furniture_ref = db.collection("furniture").document(match.get("furnitureId"))
        furniture_document = furniture_ref.get()
        if not furniture_document.exists:
            return jsonify({"error": "Furniture no longer exists"}), 404
        if status == "reserved" and furniture_document.to_dict().get("status") != "available":
            return jsonify({"error": "This item is no longer available to reserve"}), 409
        furniture_ref.update({"status": furniture_status, "updatedAt": datetime.now(timezone.utc)})

    reference.update(updates)
    return jsonify(serialise(reference.get()))
