from datetime import datetime, timezone

from flask import Blueprint, abort, g, jsonify, request

from .auth import require_auth
from .firebase import get_db, serialise
from .validation import public_patch, require_fields

cases_bp = Blueprint("cases", __name__, url_prefix="/api/cases")
COLLECTION = "cases"
# "fulfilment" (which furniture fills which need) is deliberately absent: only
# lifecycle.py writes it.
EDITABLE = {"reference", "household", "location", "delivery", "priority", "status", "needs"}
DIMENSION_KEYS = ("width", "depth", "height")


def _clean_needs(needs):
    """Each need is a category plus, optionally, the space the item must fit in."""
    if not isinstance(needs, list):
        abort(400, description="needs must be a list")
    cleaned = []
    for need in needs:
        if not isinstance(need, dict) or not isinstance(need.get("category"), str):
            abort(400, description="Each need requires a category")
        entry = {"category": need["category"]}
        space = need.get("maxDimensionsCm")
        if space:
            if not isinstance(space, dict):
                abort(400, description="maxDimensionsCm must be width, depth and height")
            sizes = {key: space.get(key) for key in DIMENSION_KEYS if space.get(key) is not None}
            if any(
                isinstance(size, bool) or not isinstance(size, (int, float)) or size <= 0
                for size in sizes.values()
            ):
                abort(400, description="Space dimensions must be positive numbers")
            if sizes:
                entry["maxDimensionsCm"] = sizes
        cleaned.append(entry)
    return cleaned


def _owned_case(case_id):
    """The case reference and data, or a 404/403 for callers who may not touch it."""
    reference = get_db().collection(COLLECTION).document(case_id)
    document = reference.get()
    if not document.exists:
        abort(404)
    case = document.to_dict()
    if g.user["role"] != "admin" and case.get("socialWorkerId") != g.user["uid"]:
        abort(403, description="This case belongs to another worker")
    return reference, document, case


@cases_bp.errorhandler(403)
def forbidden(error):
    return jsonify({"error": str(error.description)}), 403


@cases_bp.errorhandler(409)
def conflict(error):
    return jsonify({"error": str(error.description)}), 409


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
    case["needs"] = _clean_needs(case["needs"])
    case.update({"socialWorkerId": g.user["uid"], "status": "open", "createdAt": now, "updatedAt": now})
    reference = get_db().collection(COLLECTION).document()
    reference.set(case)
    return jsonify(serialise(reference.get())), 201


@cases_bp.get("/<case_id>")
@require_auth({"social_worker", "admin"})
def get_case(case_id):
    _, document, _ = _owned_case(case_id)
    return jsonify(serialise(document))


@cases_bp.patch("/<case_id>")
@require_auth({"social_worker", "admin"})
def update_case(case_id):
    reference, _, case = _owned_case(case_id)
    changes = public_patch(request.get_json(force=True), EDITABLE)
    if "needs" in changes:
        changes["needs"] = _clean_needs(changes["needs"])
    # A matched item points at this case, so its needs and status stay put
    # until the match ends.
    if case.get("fulfilment") and ("needs" in changes or "status" in changes):
        abort(409, description="Release this case's matched furniture first")
    changes["updatedAt"] = datetime.now(timezone.utc)
    reference.update(changes)
    return jsonify(serialise(reference.get()))


@cases_bp.delete("/<case_id>")
@require_auth({"social_worker", "admin"})
def close_case(case_id):
    reference, _, case = _owned_case(case_id)
    if case.get("fulfilment"):
        abort(409, description="Release this case's matched furniture first")
    reference.update({"status": "closed", "updatedAt": datetime.now(timezone.utc)})
    return "", 204
