"""Furniture status lifecycle.

This is the only module allowed to change a furniture item's ``status``. Every
change goes through ``apply_action`` (or ``apply_edit`` for the one edit that
sends an item back to review), which writes the item, a ``statusHistory`` entry
and a ``notificationsOutbox`` entry in one transaction.

The rules themselves (``decide``, ``plan_edit``, ``allowed_actions``, ``view``,
``is_expired``) are pure functions so they can be tested without Firestore.
"""

from collections import namedtuple
from datetime import date, datetime, timedelta, timezone

from firebase_admin import firestore

from .validation import clean_text

COLLECTION = "furniture"
HISTORY = "statusHistory"
OUTBOX = "notificationsOutbox"

# Mirrored by FURNITURE_STATUSES in frontend/src/common/dto/FurnitureDTO.ts
# (backend/tests/test_type_sync.py keeps the two in step).
STATUSES = (
    "pending_review",
    "available",
    "rejected",
    "matched",
    "collected",
    "withdrawn",
)

INITIAL_STATUS = "pending_review"

# What the donor sees: the six stages on the status dashboard.
DONOR_STAGES = (
    "submitted",
    "matched",
    "to_deliver",
    "in_delivery",
    "delivered",
    "cancelled",
)

DONOR_STAGE = {
    "pending_review": "submitted",
    "available": "submitted",
    "matched": "matched",
    "collected": "delivered",  # legacy status, read as delivered
    "rejected": "cancelled",
    "withdrawn": "cancelled",
}

Transition = namedtuple("Transition", "to roles needs_reason")

TRANSITIONS = {
    # (from, action): Transition(to, roles, needs_reason)
    ("pending_review", "approve"): Transition("available", {"admin"}, False),
    ("pending_review", "reject"): Transition("rejected", {"admin"}, True),
    ("available", "flag_for_review"): Transition("pending_review", {"admin"}, False),
    ("pending_review", "cancel_request"): Transition("withdrawn", {"donor"}, True),
    ("available", "cancel_request"): Transition("withdrawn", {"donor"}, True),
    ("available", "expire"): Transition("withdrawn", {"system"}, False),
}

CANCELLED_STATUSES = {"rejected", "withdrawn"}
EDITABLE_STATUSES = {"pending_review", "available"}

# Changing any of these on an approved item sends it back for review.
CONTENT_FIELDS = {"title", "condition", "conditionNotes", "dimensionsCm"}

REASON_MAX_LEN = 500
NO_MATCH_REASON = "no_match"
EXPIRY_DAYS_BEFORE_DELIVERY = 3
SYSTEM_USER = {"uid": "system", "role": "system"}

# Fields anyone may see on a listing. Addresses never live on the item document.
PUBLIC_FIELDS = (
    "title",
    "category",
    "subcategory",
    "description",
    "condition",
    "conditionNotes",
    "quantity",
    "photos",
    "location",
    "dimensionsCm",
    "collection",
    "safety",
    "createdAt",
    "donorId",
)

# Extra fields for the donor who owns the item and for admins.
PARTY_FIELDS = (
    "expectedDeliveryDate",
    "cancelReason",
    "statusChangedAt",
    "updatedAt",
)


class LifecycleError(Exception):
    def __init__(self, status_code, message, current_status=None):
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.current_status = current_status


def donor_stage(item):
    return DONOR_STAGE.get(item.get("status"), "submitted")


def is_party(user, item):
    if not user or not item:
        return False
    if user.get("role") in ("admin", "system"):
        return True
    return user.get("role") == "donor" and item.get("donorId") == user.get("uid")


def allowed_actions(item, user):
    if not is_party(user, item):
        return []
    role = user.get("role")
    actions = [
        action
        for (from_status, action), rule in TRANSITIONS.items()
        if from_status == item.get("status") and role in rule.roles
    ]
    if role == "donor" and item.get("status") in EDITABLE_STATUSES:
        actions.append("edit")
    return actions


def decide(item, action, user, payload, now):
    """Check an action against the rules. Returns (to_status, item_updates, reason)."""
    if not is_party(user, item):
        raise LifecycleError(404, "Furniture not found")

    current = item.get("status")
    expected = payload.get("expected_status")
    if not expected:
        raise LifecycleError(400, "expected_status is required")
    if expected != current:
        raise LifecycleError(
            409,
            "This item was updated elsewhere",
            current_status=current,
        )

    rule = TRANSITIONS.get((current, action))
    if rule is None or user.get("role") not in rule.roles:
        raise LifecycleError(403, "This action is not available")

    try:
        reason = clean_text(payload.get("reason"), REASON_MAX_LEN)
    except ValueError as error:
        raise LifecycleError(400, f"Reason {error}") from None
    if rule.needs_reason and not reason:
        raise LifecycleError(400, "Please tell us why")

    updates = {"status": rule.to, "statusChangedAt": now, "updatedAt": now}
    if rule.to in CANCELLED_STATUSES:
        updates["cancelReason"] = reason
        updates["cancelledBy"] = user["uid"]
    return rule.to, updates, reason


def plan_edit(item, user, changes, now):
    """Check a donor's edit. Returns (item_updates, history_entry_or_None)."""
    if not item or user.get("role") != "donor" or item.get("donorId") != user.get("uid"):
        raise LifecycleError(404, "Furniture not found")

    current = item.get("status")
    if current not in EDITABLE_STATUSES:
        raise LifecycleError(
            409,
            "This donation can no longer be edited",
            current_status=current,
        )

    updates = {**changes, "updatedAt": now}
    content_changed = any(
        key in CONTENT_FIELDS and item.get(key) != value
        for key, value in changes.items()
    )
    if current == "available" and content_changed:
        updates.update(status="pending_review", statusChangedAt=now)
        return updates, history_entry(
            "available", "pending_review", "edit_resubmit", user, now
        )
    return updates, None


def history_entry(from_status, to_status, action, user, now, reason=None):
    return {
        "from": from_status,
        "to": to_status,
        "action": action,
        "actorUid": user["uid"],
        "role": user.get("role"),
        "at": now,
        "reason": reason,
    }


def outbox_entry(kind, furniture_id, to_uid, now):
    return {
        "type": kind,
        "furnitureId": furniture_id,
        "toUid": to_uid,
        "createdAt": now,
        "sentAt": None,
    }


def _iso(value):
    return value.isoformat() if hasattr(value, "isoformat") else value


def view(item, user, private=None):
    """What the client gets: public fields, plus owner-only fields for a party."""
    out = {key: _iso(item[key]) for key in PUBLIC_FIELDS if key in item}
    out.update({
        "id": item["id"],
        "status": item.get("status"),
        "donorStage": donor_stage(item),
        "allowedActions": allowed_actions(item, user),
        "submittedAt": _iso(item.get("submittedAt") or item.get("createdAt")),
    })
    if is_party(user, item):
        out.update({key: _iso(item[key]) for key in PARTY_FIELDS if key in item})
        if private is not None:
            out["private"] = private
    return out


def is_expired(item, today: date):
    """No match within 3 days of the expected delivery date."""
    if item.get("status") != "available":
        return False
    try:
        delivery = date.fromisoformat(item.get("expectedDeliveryDate") or "")
    except ValueError:
        return False
    return today >= delivery - timedelta(days=EXPIRY_DAYS_BEFORE_DELIVERY)


def _utcnow():
    return datetime.now(timezone.utc)


def _snapshot_item(snapshot):
    return {**snapshot.to_dict(), "id": snapshot.id} if snapshot.exists else None


def apply_action(db, reference, action, user, payload):
    """Run an action in a transaction. Returns (item, changed).

    ``changed`` is False when a repeat tap of an action that already went
    through is answered with the current item instead of a 409.
    """
    return _apply_action(db.transaction(), db, reference, action, user, payload)


@firestore.transactional
def _apply_action(transaction, db, reference, action, user, payload):
    item = _snapshot_item(reference.get(transaction=transaction))

    if (
        is_party(user, item)
        and payload.get("expected_status")
        and payload.get("expected_status") != item.get("status")
    ):
        latest = list(transaction.get(
            reference.collection(HISTORY)
            .order_by("at", direction=firestore.Query.DESCENDING)
            .limit(1)
        ))
        last = latest[0].to_dict() if latest else None
        if (
            last
            and last.get("action") == action
            and last.get("actorUid") == user["uid"]
            and last.get("to") == item.get("status")
        ):
            return item, False

    now = _utcnow()
    to_status, updates, reason = decide(item, action, user, payload, now)

    transaction.update(reference, updates)
    transaction.set(
        reference.collection(HISTORY).document(),
        history_entry(item["status"], to_status, action, user, now, reason),
    )
    transaction.set(
        db.collection(OUTBOX).document(),
        outbox_entry(action, item["id"], item.get("donorId"), now),
    )
    return {**item, **updates}, True


def apply_edit(db, reference, user, changes, private_changes):
    return _apply_edit(db.transaction(), reference, user, changes, private_changes)


@firestore.transactional
def _apply_edit(transaction, reference, user, changes, private_changes):
    item = _snapshot_item(reference.get(transaction=transaction))
    now = _utcnow()
    updates, history = plan_edit(item, user, changes, now)

    transaction.update(reference, updates)
    if private_changes:
        transaction.set(
            reference.collection("private").document("contact"),
            private_changes,
            merge=True,
        )
    if history:
        transaction.set(reference.collection(HISTORY).document(), history)
    return {**item, **updates}


def expire_stale(db, today: date):
    """Withdraw available items that found no match in time. Returns their ids."""
    expired = []
    query = db.collection(COLLECTION).where("status", "==", "available")
    for snapshot in query.stream():
        if not is_expired(_snapshot_item(snapshot), today):
            continue
        try:
            _, changed = apply_action(
                db,
                snapshot.reference,
                "expire",
                SYSTEM_USER,
                {"expected_status": "available", "reason": NO_MATCH_REASON},
            )
        except LifecycleError:
            continue  # the item moved on since the query ran
        if changed:
            expired.append(snapshot.id)
    return expired
