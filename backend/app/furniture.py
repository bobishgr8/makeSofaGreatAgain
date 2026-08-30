from datetime import datetime, timezone

from firebase_admin import firestore
from flask import Blueprint, abort, g, jsonify, request

from .auth import require_auth
from .firebase import get_db, serialise
from .validation import public_patch, require_fields
from .whatsapp import notify_new_listing

furniture_bp = Blueprint("furniture", __name__, url_prefix="/api/furniture")
COLLECTION = "furniture"
EDITABLE = {
    "title", "category", "subcategory", "description", "condition",
    "conditionNotes", "dimensionsCm", "quantity", "photos", "location",
    "collection", "safety", "status",
}

FURNITURE_STATUSES = {
    "pending_review",
    "available",
    "rejected",
    "matched",
    "collected",
    "withdrawn",
}
@furniture_bp.get("")
def list_furniture():
    """Public listing of furniture. Authentication is required for create/update/delete
    operations, but the list view is intentionally public so donors and recipients can
    browse available items without signing in.
    """
    query = get_db().collection(COLLECTION)
    status = request.args.get("status")
    if status:
        query = query.where("status", "==", status)
    return jsonify([serialise(document) for document in query.limit(100).stream()])


@furniture_bp.get("/mine")
@require_auth({"donor", "admin"})
def list_my_furniture():
    """A donor's own donations, in every status, newest first."""
    query = (
        get_db()
        .collection(COLLECTION)
        .where("donorId", "==", g.user["uid"])
        .order_by("createdAt", direction=firestore.Query.DESCENDING)
    )
    return jsonify([serialise(document) for document in query.stream()])


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

@furniture_bp.get("/admin/all")
@require_auth({"admin"})
def admin_list_furniture():
    docs = get_db().collection("furniture").stream()

    items = []

    for doc in docs:
        item = doc.to_dict()
        item["id"] = doc.id
        items.append(item)

    return jsonify(items), 200

@furniture_bp.patch("/admin/<furniture_id>")
@require_auth({"admin"})
def admin_update_furniture(furniture_id):
    data = request.get_json(silent=True) or {}

    status = data.get("status")

    if status not in {
        "available",
        "pending_review",
        "rejected",
    }:
        return jsonify({
            "error": "Invalid furniture status"
        }), 400

    reference = (
        get_db()
        .collection(COLLECTION)
        .document(furniture_id)
    )

    document = reference.get()

    if not document.exists:
        abort(404)

    previous_status = document.to_dict().get("status")

    reference.update({
        "status": status,
        "updatedAt": datetime.now(timezone.utc),
    })

    updated = reference.get()

    if status == "available" and previous_status != "available":
        notify_new_listing(serialise(updated))

    return jsonify(
        serialise(updated)
    ), 200