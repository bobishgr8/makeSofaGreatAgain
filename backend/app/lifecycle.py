"""Furniture status lifecycle.

This is the only module allowed to change a furniture item's ``status``. Every
change goes through ``apply_action`` (or ``apply_edit`` for the one edit that
sends an item back to review), which writes the item, a ``statusHistory`` entry
and a ``notificationsOutbox`` entry in one transaction.

A match lives on the item as ``activeMatch`` and on the case as a ``fulfilment``
slot; both are written here, in the same transaction as the status.

The rules themselves (``decide``, ``plan_edit``, ``allowed_actions``, ``view``,
``is_expired``, ``ineligible_reason``) are pure functions so they can be tested
without Firestore.
"""

from collections import namedtuple
from datetime import date, datetime, timedelta, timezone

from firebase_admin import firestore

from .scoring import category_key, fits, need_for
from .validation import SINGAPORE, clean_text, parse_delivery_date

COLLECTION = "furniture"
HISTORY = "statusHistory"
OUTBOX = "notificationsOutbox"
CASES = "cases"
PROFILES = "socialWorkerProfiles"

# Mirrored by FURNITURE_STATUSES in frontend/src/common/dto/FurnitureDTO.ts
# (backend/tests/test_type_sync.py keeps the two in step).
STATUSES = (
    "pending_review",
    "available",
    "rejected",
    "matched",
    "to_deliver",
    "in_delivery",
    "delivered",
    "collected",
    "withdrawn",
)

INITIAL_STATUS = "pending_review"

# An item in one of these is held for a case and still on its way there.
ACTIVE_MATCH_STATUSES = ("matched", "to_deliver", "in_delivery")

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
    "to_deliver": "to_deliver",
    "in_delivery": "in_delivery",
    "delivered": "delivered",
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
    # State 2. A social worker's request holds the item for their case; the
    # donor approves by connecting.
    ("available", "accept_match"): Transition("matched", {"social_worker"}, False),
    ("matched", "connect"): Transition("matched", {"donor"}, False),
    ("matched", "rematch"): Transition("available", {"donor"}, False),
    ("matched", "cancel_donation"): Transition("withdrawn", {"donor"}, True),
    ("matched", "release_match"): Transition("available", {"social_worker", "admin"}, True),
    ("matched", "lapse_match"): Transition("withdrawn", {"system"}, False),
    # State 3. Once connected, the donor proposes a provider, a date and the two
    # addresses; the social worker confirms, or asks for the details again.
    ("matched", "arrange_delivery"): Transition("to_deliver", {"donor"}, False),
    ("to_deliver", "propose_logistics"): Transition("to_deliver", {"donor"}, False),
    ("to_deliver", "confirm_logistics"): Transition("in_delivery", {"social_worker"}, False),
    ("to_deliver", "rearrange_logistics"): Transition("to_deliver", {"social_worker"}, False),
    ("to_deliver", "cancel_donation"): Transition("withdrawn", {"donor"}, True),
    ("to_deliver", "release_match"): Transition("available", {"social_worker", "admin"}, True),
    # States 4 and 5. Either side can say the delivery is done, or call it off.
    ("in_delivery", "complete_delivery"): Transition("delivered", {"donor", "social_worker"}, False),
    ("in_delivery", "cancel_delivery"): Transition(
        "available", {"donor", "social_worker", "admin"}, True
    ),
}

# Actions whose actor is not yet a party to the item.
OPEN_ACTIONS = {"accept_match"}

# What a signed-in person can be offered. Mirrored by FURNITURE_ACTIONS in
# frontend/src/common/dto/FurnitureDTO.ts (checked by test_type_sync.py).
CLIENT_ACTIONS = tuple(
    dict.fromkeys(
        action for (_, action), rule in TRANSITIONS.items() if rule.roles - {"system"}
    )
) + ("edit",)

Decision = namedtuple(
    "Decision",
    "to item_updates case_updates notify_uids reason history_extra private_updates",
    defaults=(None,),
)

CANCELLED_STATUSES = {"rejected", "withdrawn"}
EDITABLE_STATUSES = {"pending_review", "available"}

# Changing any of these on an approved item sends it back for review.
CONTENT_FIELDS = {"title", "condition", "conditionNotes", "dimensionsCm"}

REASON_MAX_LEN = 500
NO_MATCH_REASON = "no_match"
NO_CONNECT_REASON = "no_connect"
EXPIRY_DAYS_BEFORE_DELIVERY = 3
CONNECT_DAYS = 5
ADDRESS_MAX_LEN = 200
# "own" is the donor arranging transport themselves. The rest are the providers
# priced in config.LOGISTICS_ESTIMATES (test_lifecycle.py keeps the two in step).
OWN_LOGISTICS = "own"
LOGISTICS_PROVIDERS = ("Ninja Van", "Lalamove", "GoGoVan", OWN_LOGISTICS)
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


def active_match(item):
    return (item or {}).get("activeMatch") or {}


def is_connected(item):
    return bool(active_match(item).get("connectedAt"))


def proposal(item):
    """The delivery details the donor has sent, or {} when none are waiting."""
    return active_match(item).get("logistics") or {}


def has_proposal(item):
    return bool(proposal(item))


def is_party(user, item):
    if not user or not item:
        return False
    role, uid = user.get("role"), user.get("uid")
    if role in ("admin", "system"):
        return True
    if not uid:
        return False
    if role == "donor":
        return item.get("donorId") == uid
    return role == "social_worker" and active_match(item).get("socialWorkerId") == uid


def _may_act(user, item, action):
    """Parties can act. A social worker can also request an available listing,
    which is public anyway; every other status stays hidden from non-parties."""
    if is_party(user, item):
        return True
    return bool(
        user
        and item
        and action in OPEN_ACTIONS
        and user.get("role") == "social_worker"
        and item.get("status") == "available"
    )


def _offered(action, item, user):
    """Rules that need only the item, so a button is never shown in vain."""
    if action == "accept_match":
        return user.get("approval") == "approved" and item.get("donorId") != user.get("uid")
    if action == "connect":
        return not is_connected(item)
    if action == "rematch":
        # The mockup offers "Find another match" only after connecting.
        return is_connected(item)
    if action == "arrange_delivery":
        return is_connected(item)
    if action == "propose_logistics":
        return not has_proposal(item)
    if action in ("confirm_logistics", "rearrange_logistics"):
        return has_proposal(item)
    return True


def allowed_actions(item, user):
    if not user or not item:
        return []
    role = user.get("role")
    actions = [
        action
        for (from_status, action), rule in TRANSITIONS.items()
        if from_status == item.get("status")
        and role in rule.roles
        and _may_act(user, item, action)
        and _offered(action, item, user)
    ]
    if role == "donor" and is_party(user, item) and item.get("status") in EDITABLE_STATUSES:
        actions.append("edit")
    return actions


def ineligible_reason(item, case, today: date):
    """Why this item cannot be matched to this case, or None when it can.

    The one definition of eligibility: the suggestion list and the request
    guard both use it.
    """
    if item.get("status") != "available":
        return "This item is no longer available"
    if is_expired(item, today):
        return "This item is too close to its delivery date"
    if (case.get("status") or "open") != "open":
        return "This case is closed"
    if case.get("id") in (item.get("declinedCaseIds") or []):
        return "This item was already released for this case"
    need = need_for(item, case)
    if need is None:
        return "This case does not need this kind of furniture"
    if category_key(item) in {**(case.get("fulfilment") or {}), **(case.get("delivered") or {})}:
        return "This case already has a match for this need"
    if fits(item, need) is False:
        return "This item is too big for the space"
    return None


def is_connect_overdue(item, now):
    match = active_match(item)
    connect_by = match.get("connectBy")
    return bool(
        item.get("status") == "matched"
        and connect_by
        and not match.get("connectedAt")
        and now > connect_by
    )


def _guard_accept_match(item, user, payload, ctx, now):
    if user.get("approval") != "approved":
        raise LifecycleError(403, "Your social worker account is awaiting admin approval")
    if item.get("donorId") == user.get("uid"):
        raise LifecycleError(403, "You cannot request your own donation")
    case = ctx.get("case")
    if not case or case.get("socialWorkerId") != user.get("uid"):
        raise LifecycleError(404, "Case not found")
    profile = ctx.get("profile") or {}
    if not profile.get("organisation") or not profile.get("whatsapp"):
        raise LifecycleError(400, "Add your organisation and WhatsApp number first")
    message = ineligible_reason(item, case, now.astimezone(SINGAPORE).date())
    if message:
        raise LifecycleError(400, message)


def _guard_connect(item, user, payload, ctx, now):
    if is_connected(item):
        raise LifecycleError(409, "You are already connected", current_status=item.get("status"))


def _guard_rematch(item, user, payload, ctx, now):
    if not is_connected(item):
        raise LifecycleError(403, "This action is not available")


def _guard_lapse_match(item, user, payload, ctx, now):
    if not is_connect_overdue(item, now):
        raise LifecycleError(403, "This action is not available")


def _clean_address(value, label):
    try:
        address = clean_text(value, ADDRESS_MAX_LEN)
    except ValueError as error:
        raise LifecycleError(400, f"{label} {error}") from None
    if not address:
        raise LifecycleError(400, f"{label} is required")
    return address


def logistics_request(payload, today: date):
    """The donor's delivery details, checked. Returns (logistics, addresses);
    the addresses are kept apart because they never live on the item."""
    provider = payload.get("provider")
    if provider not in LOGISTICS_PROVIDERS:
        raise LifecycleError(400, "Choose a logistics service")
    addresses = {
        "pickupAddress": _clean_address(payload.get("pickupAddress"), "Pick-up address"),
        "deliveryAddress": _clean_address(payload.get("deliveryAddress"), "Delivery address"),
    }
    try:
        delivery_date = parse_delivery_date(payload.get("deliveryDate"), today)
    except ValueError as error:
        message = str(error).replace("Expected delivery date", "Delivery date")
        raise LifecycleError(400, message) from None
    return {"provider": provider, "deliveryDate": delivery_date}, addresses


def _guard_arrange_delivery(item, user, payload, ctx, now):
    if not is_connected(item):
        raise LifecycleError(403, "This action is not available")


def _guard_propose_logistics(item, user, payload, ctx, now):
    if has_proposal(item):
        raise LifecycleError(
            409, "You have already sent these details", current_status=item.get("status")
        )
    logistics_request(payload, now.astimezone(SINGAPORE).date())


def _guard_needs_proposal(item, user, payload, ctx, now):
    if not has_proposal(item):
        raise LifecycleError(403, "This action is not available")


GUARDS = {
    "accept_match": _guard_accept_match,
    "connect": _guard_connect,
    "rematch": _guard_rematch,
    "lapse_match": _guard_lapse_match,
    "arrange_delivery": _guard_arrange_delivery,
    "propose_logistics": _guard_propose_logistics,
    "confirm_logistics": _guard_needs_proposal,
    "rearrange_logistics": _guard_needs_proposal,
}

# Actions that keep the status. A repeat tap of one that already went through is
# answered with the current item, as for the actions that change it.
ALREADY_DONE = {
    "connect": is_connected,
    "propose_logistics": has_proposal,
}


def _others(item, user):
    """The donor and the matched social worker, minus whoever acted."""
    uids = [item.get("donorId"), active_match(item).get("socialWorkerId")]
    return [uid for uid in uids if uid and uid != user.get("uid")]


def _case_slot_freed(item, ctx):
    case = ctx.get("case")
    if not case:
        return None
    fulfilment = {
        key: value
        for key, value in (case.get("fulfilment") or {}).items()
        if value != item["id"]
    }
    return {"fulfilment": fulfilment}


def _case_slot_delivered(item, ctx):
    """The need is filled for good: it leaves ``fulfilment`` (so the case is no
    longer locked) and is kept under ``delivered`` (so it is not matched again)."""
    case = ctx.get("case")
    if not case:
        return None
    delivered = {**(case.get("delivered") or {}), category_key(item): item["id"]}
    return {**_case_slot_freed(item, ctx), "delivered": delivered}


def _address_cleared(item):
    """The beneficiary's address is only kept while a delivery is being arranged."""
    if item.get("status") in ("to_deliver", "in_delivery"):
        return {"deliveryAddress": None}
    return None


def _match_with(item, **changes):
    return {"activeMatch": {**active_match(item), **changes}}


def _case_id(item):
    return {"caseId": active_match(item).get("caseId")}


# Effects return (item_updates, case_updates, notify_uids, history_extra,
# private_updates). They write whole values, never Firestore sentinels or dotted
# paths, so that {**item, **item_updates} is the item as it will be stored.
# private_updates go to the item's private/contact document: addresses never
# live on the item itself.


def _effect_accept_match(item, user, payload, ctx, now):
    case = ctx["case"]
    match = {
        "caseId": case["id"],
        "socialWorkerId": user["uid"],
        "organisation": ctx["profile"]["organisation"],
        "matchedAt": now,
        "connectBy": now + timedelta(days=CONNECT_DAYS),
        "connectedAt": None,
    }
    fulfilment = {**(case.get("fulfilment") or {}), category_key(item): item["id"]}
    return (
        {"activeMatch": match},
        {"fulfilment": fulfilment},
        [item.get("donorId")],
        {"caseId": case["id"]},
        None,
    )


def _effect_connect(item, user, payload, ctx, now):
    return _match_with(item, connectedAt=now), None, _others(item, user), _case_id(item), None


def _effect_back_to_pool(item, user, payload, ctx, now):
    case_id = active_match(item).get("caseId")
    declined = [*(item.get("declinedCaseIds") or []), case_id]
    return (
        {"activeMatch": None, "declinedCaseIds": declined},
        _case_slot_freed(item, ctx),
        _others(item, user),
        {"caseId": case_id},
        _address_cleared(item),
    )


def _effect_match_cancelled(item, user, payload, ctx, now):
    return (
        {"activeMatch": None},
        _case_slot_freed(item, ctx),
        _others(item, user),
        _case_id(item),
        _address_cleared(item),
    )


def _effect_arrange_delivery(item, user, payload, ctx, now):
    return {}, None, _others(item, user), _case_id(item), None


def _effect_propose_logistics(item, user, payload, ctx, now):
    logistics, addresses = logistics_request(payload, now.astimezone(SINGAPORE).date())
    return (
        _match_with(item, logistics={**logistics, "proposedAt": now}),
        None,
        _others(item, user),
        _case_id(item),
        addresses,
    )


def _effect_confirm_logistics(item, user, payload, ctx, now):
    return (
        _match_with(item, logistics={**proposal(item), "confirmedAt": now}),
        None,
        _others(item, user),
        _case_id(item),
        None,
    )


def _effect_rearrange_logistics(item, user, payload, ctx, now):
    return _match_with(item, logistics=None), None, _others(item, user), _case_id(item), None


def _effect_complete_delivery(item, user, payload, ctx, now):
    # activeMatch stays, so the social worker still sees the item they received.
    return (
        _match_with(item, deliveredAt=now),
        _case_slot_delivered(item, ctx),
        _others(item, user),
        _case_id(item),
        _address_cleared(item),
    )


EFFECTS = {
    "accept_match": _effect_accept_match,
    "connect": _effect_connect,
    "rematch": _effect_back_to_pool,
    "release_match": _effect_back_to_pool,
    "cancel_donation": _effect_match_cancelled,
    "lapse_match": _effect_match_cancelled,
    "arrange_delivery": _effect_arrange_delivery,
    "propose_logistics": _effect_propose_logistics,
    "confirm_logistics": _effect_confirm_logistics,
    "rearrange_logistics": _effect_rearrange_logistics,
    "complete_delivery": _effect_complete_delivery,
    "cancel_delivery": _effect_back_to_pool,
}


def decide(item, action, user, payload, now, ctx=None):
    """Check an action against the rules. Returns a Decision.

    ``ctx`` holds the other documents a match action needs: ``case`` and, for a
    request, the social worker's ``profile``.
    """
    if not _may_act(user, item, action):
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

    ctx = ctx or {}
    guard = GUARDS.get(action)
    if guard:
        guard(item, user, payload, ctx, now)

    updates = {"updatedAt": now}
    if rule.to != current:
        updates.update(status=rule.to, statusChangedAt=now)
    if rule.to in CANCELLED_STATUSES:
        updates["cancelReason"] = reason
        updates["cancelledBy"] = user["uid"]

    case_updates, notify_uids, history_extra = None, [item.get("donorId")], {}
    private_updates = None
    effect = EFFECTS.get(action)
    if effect:
        item_updates, case_updates, notify_uids, history_extra, private_updates = effect(
            item, user, payload, ctx, now
        )
        updates.update(item_updates)
    return Decision(
        rule.to, updates, case_updates, notify_uids, reason, history_extra, private_updates
    )


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


def history_entry(from_status, to_status, action, user, now, reason=None, **extra):
    return {
        "from": from_status,
        "to": to_status,
        "action": action,
        "actorUid": user["uid"],
        "role": user.get("role"),
        "at": now,
        "reason": reason,
        **extra,
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


def cancel_kind(item):
    """Why a cancelled item was cancelled, so the client need not read the free-text reason."""
    if item.get("status") == "rejected":
        return "rejected"
    if item.get("cancelledBy") != SYSTEM_USER["uid"]:
        return "donor"
    return NO_CONNECT_REASON if item.get("cancelReason") == NO_CONNECT_REASON else NO_MATCH_REASON


def match_summary(item, user, contact, now):
    """The active match as a party sees it. The social worker's WhatsApp number
    goes to the donor; the case goes to the social worker."""
    match = active_match(item)
    role = user.get("role")
    summary = {
        "organisation": match.get("organisation"),
        "matchedAt": _iso(match.get("matchedAt")),
        "connectBy": _iso(match.get("connectBy")),
        "connectedAt": _iso(match.get("connectedAt")),
        "connected": is_connected(item),
        "overdue": is_connect_overdue(item, now),
    }
    if has_proposal(item):
        summary["logistics"] = {key: _iso(value) for key, value in proposal(item).items()}
    if role in ("donor", "admin") and (contact or {}).get("whatsapp"):
        summary["whatsapp"] = contact["whatsapp"]
    if role in ("social_worker", "admin"):
        summary["caseId"] = match.get("caseId")
    return summary


def view(item, user, private=None, contact=None, now=None):
    """What the client gets: public fields, plus owner-only fields for a party.

    ``contact`` is the matched social worker's profile, when the caller loaded it.
    """
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
        if item.get("status") in CANCELLED_STATUSES:
            out["cancelKind"] = cancel_kind(item)
        if active_match(item):
            out["matchSummary"] = match_summary(item, user, contact, now or _utcnow())
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
            # A request for a different case is not a repeat of the first one.
            and (action != "accept_match" or last.get("caseId") == payload.get("caseId"))
        ):
            return item, False

    # These keep the status, so the check above never sees their repeat tap.
    already_done = ALREADY_DONE.get(action)
    if (
        already_done
        and is_party(user, item)
        and payload.get("expected_status") == item.get("status")
        and (item.get("status"), action) in TRANSITIONS
        and user.get("role") in TRANSITIONS[(item.get("status"), action)].roles
        and already_done(item)
    ):
        return item, False

    ctx, case_reference = _load_context(transaction, db, item, action, user, payload)

    now = _utcnow()
    decision = decide(item, action, user, payload, now, ctx)

    transaction.update(reference, decision.item_updates)
    if decision.case_updates and case_reference:
        transaction.update(case_reference, decision.case_updates)
    if decision.private_updates:
        transaction.set(
            reference.collection("private").document("contact"),
            decision.private_updates,
            merge=True,
        )
    transaction.set(
        reference.collection(HISTORY).document(),
        history_entry(
            item["status"], decision.to, action, user, now, decision.reason,
            **decision.history_extra,
        ),
    )
    for uid in decision.notify_uids:
        transaction.set(
            db.collection(OUTBOX).document(),
            outbox_entry(action, item["id"], uid, now),
        )
    return {**item, **decision.item_updates}, True


def _load_context(transaction, db, item, action, user, payload):
    """Read the case (and, for a request, the social worker's profile) a match
    action needs. Returns (ctx, case_reference). Reads only; writes come after."""
    if not item or action not in EFFECTS:
        return {}, None

    if action == "accept_match":
        case_id = payload.get("caseId")
    else:
        case_id = active_match(item).get("caseId")
    if not isinstance(case_id, str) or not case_id:
        return {}, None

    ctx = {}
    case_reference = db.collection(CASES).document(case_id)
    case_snapshot = case_reference.get(transaction=transaction)
    if case_snapshot.exists:
        ctx["case"] = {**case_snapshot.to_dict(), "id": case_snapshot.id}
    else:
        case_reference = None

    if action == "accept_match" and user.get("uid"):
        profile = db.collection(PROFILES).document(user["uid"]).get(transaction=transaction)
        ctx["profile"] = profile.to_dict() or {}
    return ctx, case_reference


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


def expire_if_stale(db, reference, item, today: date):
    """An item put back in the pool too close to its delivery date can no longer
    be matched, so withdraw it straight away. Returns the item as it now is."""
    if not is_expired(item, today):
        return item
    try:
        expired, _ = apply_action(
            db,
            reference,
            "expire",
            SYSTEM_USER,
            {"expected_status": "available", "reason": NO_MATCH_REASON},
        )
    except LifecycleError:
        return item
    return expired


def lapse_overdue(db, now):
    """Withdraw matched items whose donor did not connect in time. Returns their ids."""
    lapsed = []
    query = db.collection(COLLECTION).where("status", "==", "matched")
    for snapshot in query.stream():
        if not is_connect_overdue(_snapshot_item(snapshot), now):
            continue
        try:
            _, changed = apply_action(
                db,
                snapshot.reference,
                "lapse_match",
                SYSTEM_USER,
                {"expected_status": "matched", "reason": NO_CONNECT_REASON},
            )
        except LifecycleError:
            continue  # the donor connected since the query ran
        if changed:
            lapsed.append(snapshot.id)
    return lapsed
