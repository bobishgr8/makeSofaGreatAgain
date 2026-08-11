from datetime import datetime, timezone

from flask import Blueprint, abort, g, jsonify, request

from .auth import require_auth
from .firebase import get_db, serialise
from .validation import public_patch, require_fields

cases_bp = Blueprint("cases", __name__, url_prefix="/api/cases")
COLLECTION = "cases"
EDITABLE = {"reference", "household", "location", "delivery", "priority", "status", "needs"}


@cases_bp.get("")
@require_auth({"social_worker", "admin"})
def list_cases():
    query = get_db().collection(COLLECTION)
    if g.user["role"] != "admin":
        query = query.where("socialWorkerId", "==", g.user["uid"])
    return jsonify([serialise(document) for document in query.limit(100).stream()])


@cases_bp.post("")
@require_auth({"social_worker", "admin"})
def create_case():
    data = request.get_json(force=True)
    require_fields(data, ["household", "location", "priority", "needs"])
    now = datetime.now(timezone.utc)
    case = public_patch(data, EDITABLE)
    case.update({"socialWorkerId": g.user["uid"], "status": "open", "createdAt": now, "updatedAt": now})
    reference = get_db().collection(COLLECTION).document()
    reference.set(case)
    return jsonify(serialise(reference.get())), 201


@cases_bp.get("/<case_id>")
@require_auth({"social_worker", "admin"})
def get_case(case_id):
    document = get_db().collection(COLLECTION).document(case_id).get()
    if not document.exists:
        abort(404)
    case = document.to_dict()
    if g.user["role"] != "admin" and case.get("socialWorkerId") != g.user["uid"]:
        return jsonify({"error": "This case belongs to another worker"}), 403
    return jsonify(serialise(document))


@cases_bp.patch("/<case_id>")
@require_auth({"social_worker", "admin"})
def update_case(case_id):
    reference = get_db().collection(COLLECTION).document(case_id)
    document = reference.get()
    if not document.exists:
        abort(404)
    case = document.to_dict()
    if g.user["role"] != "admin" and case.get("socialWorkerId") != g.user["uid"]:
        return jsonify({"error": "This case belongs to another worker"}), 403
    changes = public_patch(request.get_json(force=True), EDITABLE)
    changes["updatedAt"] = datetime.now(timezone.utc)
    reference.update(changes)
    return jsonify(serialise(reference.get()))


@cases_bp.delete("/<case_id>")
@require_auth({"social_worker", "admin"})
def close_case(case_id):
    reference = get_db().collection(COLLECTION).document(case_id)
    if not reference.get().exists:
        abort(404)
    reference.update({"status": "closed", "updatedAt": datetime.now(timezone.utc)})
    return "", 204
