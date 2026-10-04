from datetime import datetime, timezone

from firebase_admin import firestore
from flask import Blueprint, abort, g, jsonify, request

from . import lifecycle
from .auth import optional_user, require_auth
from .firebase import get_db
from .validation import (
    clean_text,
    parse_delivery_date,
    public_patch,
    require_fields,
    today_sgt,
)
from .whatsapp import notify_new_listing

furniture_bp = Blueprint("furniture", __name__, url_prefix="/api/furniture")
COLLECTION = lifecycle.COLLECTION

# "status" is deliberately absent: only lifecycle.py changes it.
CREATE_FIELDS = {
    "title", "category", "subcategory", "description", "condition",
    "conditionNotes", "dimensionsCm", "quantity", "photos", "location",
    "collection", "safety", "expectedDeliveryDate",
}
EDITABLE = {"title", "condition", "conditionNotes", "dimensionsCm", "expectedDeliveryDate"}
PICKUP_ADDRESS_MAX_LEN = 200


@furniture_bp.errorhandler(lifecycle.LifecycleError)
def lifecycle_error(error):
    body = {"error": error.message}
    if error.current_status:
        body["currentStatus"] = error.current_status
    return jsonify(body), error.status_code


def _item(snapshot):
    return {**(snapshot.to_dict() or {}), "id": snapshot.id}


def _private_ref(reference):
    return reference.collection("private").document("contact")


def _read_private(reference):
    return _private_ref(reference).get().to_dict() or {}


def _validated_pickup_address(value):
    try:
        address = clean_text(value, PICKUP_ADDRESS_MAX_LEN)
    except ValueError as error:
        abort(400, description=f"Pick-up address {error}")
    if not address:
        abort(400, description="Pick-up address is required")
    return address


def _validated_delivery_date(value):
    try:
        return parse_delivery_date(value, today_sgt())
    except ValueError as error:
        abort(400, description=str(error))


@furniture_bp.get("")
def list_furniture():
    """Public listing of furniture. Authentication is required for create/update/delete
    operations, but the list view is intentionally public so donors and recipients can
    browse available items without signing in. Only public fields are returned.
    """
    query = get_db().collection(COLLECTION)
    status = request.args.get("status")
    if status:
        query = query.where("status", "==", status)
    return jsonify([
        lifecycle.view(_item(document), None)
        for document in query.limit(100).stream()
    ])


@furniture_bp.get("/mine")
@require_auth({"donor", "admin"})
def list_my_furniture():
    """A donor's own donations, in every status, newest first, with stage counts."""
    db = get_db()
    snapshots = list(
        db.collection(COLLECTION)
        .where("donorId", "==", g.user["uid"])
        .order_by("createdAt", direction=firestore.Query.DESCENDING)
        .stream()
    )

    privates = {}
    if snapshots:
        for private in db.get_all([_private_ref(s.reference) for s in snapshots]):
            privates[private.reference.parent.parent.id] = private.to_dict() or {}

    counts = {stage: 0 for stage in lifecycle.DONOR_STAGES}
    items = []
    for snapshot in snapshots:
        item = _item(snapshot)
        counts[lifecycle.donor_stage(item)] += 1
        items.append(lifecycle.view(item, g.user, privates.get(snapshot.id, {})))

    return jsonify({"items": items, "counts": counts})


@furniture_bp.post("")
@require_auth({"donor", "admin", "social_worker"})
def create_furniture():
    data = request.get_json(force=True)
    require_fields(data, [
        "title", "category", "condition", "location", "collection",
        "expectedDeliveryDate", "pickupAddress",
    ])
    item = public_patch(data, CREATE_FIELDS)
    item["expectedDeliveryDate"] = _validated_delivery_date(data["expectedDeliveryDate"])
    pickup_address = _validated_pickup_address(data["pickupAddress"])

    now = datetime.now(timezone.utc)
    item.update({
        "donorId": g.user["uid"],
        "status": lifecycle.INITIAL_STATUS,
        "submittedAt": now,
        "statusChangedAt": now,
        "createdAt": now,
        "updatedAt": now,
    })

    db = get_db()
    reference = db.collection(COLLECTION).document()
    batch = db.batch()
    batch.set(reference, item)
    batch.set(_private_ref(reference), {"pickupAddress": pickup_address})
    batch.set(
        reference.collection(lifecycle.HISTORY).document(),
        lifecycle.history_entry(None, lifecycle.INITIAL_STATUS, "create", g.user, now),
    )
    batch.set(
        db.collection(lifecycle.OUTBOX).document(),
        lifecycle.outbox_entry("submitted", reference.id, g.user["uid"], now),
    )
    batch.commit()

    created = {**item, "id": reference.id}
    return jsonify(lifecycle.view(created, g.user, {"pickupAddress": pickup_address})), 201


@furniture_bp.get("/<item_id>")
def get_furniture(item_id):
    """The owner and admins see everything; anyone else sees an available listing only."""
    user = optional_user()
    reference = get_db().collection(COLLECTION).document(item_id)
    snapshot = reference.get()
    if not snapshot.exists:
        abort(404)
    item = _item(snapshot)

    if lifecycle.is_party(user, item):
        return jsonify(lifecycle.view(item, user, _read_private(reference)))
    if item.get("status") != "available":
        abort(404)
    return jsonify(lifecycle.view(item, user))


@furniture_bp.patch("/<item_id>")
@require_auth({"donor"})
def update_furniture(item_id):
    body = request.get_json(force=True) or {}
    changes = public_patch(body, EDITABLE)
    if "expectedDeliveryDate" in changes:
        changes["expectedDeliveryDate"] = _validated_delivery_date(changes["expectedDeliveryDate"])
    private_changes = {}
    if "pickupAddress" in body:
        private_changes["pickupAddress"] = _validated_pickup_address(body["pickupAddress"])
    if not changes and not private_changes:
        abort(400, description="Nothing to update")

    db = get_db()
    reference = db.collection(COLLECTION).document(item_id)
    item = lifecycle.apply_edit(db, reference, g.user, changes, private_changes)
    return jsonify(lifecycle.view(item, g.user, _read_private(reference)))


@furniture_bp.post("/<item_id>/actions/<action>")
@require_auth()
def run_action(item_id, action):
    payload = request.get_json(silent=True) or {}
    db = get_db()
    reference = db.collection(COLLECTION).document(item_id)
    item, changed = lifecycle.apply_action(db, reference, action, g.user, payload)

    result = lifecycle.view(item, g.user, _read_private(reference))
    if changed and action == "approve":
        notify_new_listing(result)
    return jsonify(result)


@furniture_bp.get("/admin/all")
@require_auth({"admin"})
def admin_list_furniture():
    return jsonify([
        lifecycle.view(_item(document), g.user)
        for document in get_db().collection(COLLECTION).stream()
    ]), 200
