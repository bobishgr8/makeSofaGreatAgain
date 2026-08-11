from datetime import datetime, timezone

from flask import Blueprint, abort, g, jsonify, request

from .auth import require_auth
from .firebase import get_db, serialise
from .validation import public_patch, require_fields

furniture_bp = Blueprint("furniture", __name__, url_prefix="/api/furniture")
COLLECTION = "furniture"
EDITABLE = {
    "title", "category", "subcategory", "description", "condition",
    "conditionNotes", "dimensionsCm", "quantity", "photos", "location",
    "collection", "safety", "status",
}


@furniture_bp.get("")
@require_auth({"donor", "social_worker", "admin"})
def list_furniture():
    query = get_db().collection(COLLECTION)
    status = request.args.get("status")
    if status:
        query = query.where("status", "==", status)
    return jsonify([serialise(document) for document in query.limit(100).stream()])


@furniture_bp.post("")
@require_auth({"donor", "admin", "social_worker"})
def create_furniture():
    data = request.get_json(force=True)
    require_fields(data, ["title", "category", "condition", "location", "collection"])
    now = datetime.now(timezone.utc)
    item = public_patch(data, EDITABLE)
    item.update({
        "donorId": g.user["uid"],
        "status": "pending_review",
        "createdAt": now,
        "updatedAt": now,
    })
    reference = get_db().collection(COLLECTION).document()
    reference.set(item)
    return jsonify(serialise(reference.get())), 201


@furniture_bp.get("/<item_id>")
@require_auth({"donor", "social_worker", "admin"})
def get_furniture(item_id):
    document = get_db().collection(COLLECTION).document(item_id).get()
    if not document.exists:
        abort(404)
    return jsonify(serialise(document))


@furniture_bp.patch("/<item_id>")
@require_auth({"donor", "social_worker", "admin"})
def update_furniture(item_id):
    reference = get_db().collection(COLLECTION).document(item_id)
    document = reference.get()
    if not document.exists:
        abort(404)
    existing = document.to_dict()
    if g.user["role"] == "donor" and existing.get("donorId") != g.user["uid"]:
        return jsonify({"error": "This donation belongs to another donor"}), 403
    changes = public_patch(request.get_json(force=True), EDITABLE)
    changes["updatedAt"] = datetime.now(timezone.utc)
    reference.update(changes)
    return jsonify(serialise(reference.get()))


@furniture_bp.delete("/<item_id>")
@require_auth({"donor", "admin"})
def withdraw_furniture(item_id):
    reference = get_db().collection(COLLECTION).document(item_id)
    document = reference.get()
    if not document.exists:
        abort(404)
    existing = document.to_dict()
    if g.user["role"] == "donor" and existing.get("donorId") != g.user["uid"]:
        return jsonify({"error": "This donation belongs to another donor"}), 403
    reference.update({"status": "withdrawn", "updatedAt": datetime.now(timezone.utc)})
    return "", 204
