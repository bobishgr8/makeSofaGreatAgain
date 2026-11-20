"""Thank-you notes (PRD EPICs 4 and 7f). After a delivery, the matched social
worker passes on a note from the household; the donor gets it on WhatsApp and
on their Thanks page. One note per delivered item: the note's id is the item's.
"""

from datetime import datetime, timezone

from firebase_admin import firestore
from flask import Blueprint, abort, g, jsonify, request

from . import lifecycle
from .auth import require_auth
from .firebase import get_db
from .validation import clean_text

thanks_bp = Blueprint("thanks", __name__, url_prefix="/api")
NOTES = "thankYouNotes"
MESSAGE_MAX_LEN = 500
DELIVERED_STATUSES = ("delivered", "collected")


def _note_view(snapshot):
    note = snapshot.to_dict() or {}
    created = note.get("createdAt")
    return {
        "id": snapshot.id,
        "furnitureId": note.get("furnitureId"),
        "itemTitle": note.get("itemTitle"),
        "category": note.get("category"),
        "organisation": note.get("organisation"),
        "message": note.get("message"),
        "createdAt": created.isoformat() if hasattr(created, "isoformat") else created,
    }


@thanks_bp.post("/furniture/<item_id>/thank-you")
@require_auth({"social_worker"}, require_approval=True)
def send_thank_you(item_id):
    body = request.get_json(silent=True) or {}
    try:
        message = clean_text(body.get("message"), MESSAGE_MAX_LEN)
    except ValueError as error:
        abort(400, description=f"Message {error}")
    if not message:
        abort(400, description="Please write a short note")

    db = get_db()
    item_ref = db.collection(lifecycle.COLLECTION).document(item_id)
    note_ref = db.collection(NOTES).document(item_id)
    now = datetime.now(timezone.utc)

    @firestore.transactional
    def write(transaction):
        snapshot = item_ref.get(transaction=transaction)
        item = {**(snapshot.to_dict() or {}), "id": item_id} if snapshot.exists else None
        match = lifecycle.active_match(item)
        if not item or match.get("socialWorkerId") != g.user["uid"]:
            abort(404)
        if item.get("status") not in DELIVERED_STATUSES:
            abort(409, description="You can send a note once the delivery is complete")
        if note_ref.get(transaction=transaction).exists:
            abort(409, description="A thank-you note has already been sent for this item")
        transaction.set(note_ref, {
            "furnitureId": item_id,
            "donorId": item.get("donorId"),
            "socialWorkerId": g.user["uid"],
            "caseId": match.get("caseId"),
            "organisation": match.get("organisation"),
            "itemTitle": item.get("title"),
            "category": item.get("category"),
            "message": message,
            "createdAt": now,
        })
        transaction.update(item_ref, {"thankYouSentAt": now})
        transaction.set(
            db.collection(lifecycle.OUTBOX).document(),
            lifecycle.outbox_entry(
                "thank_you", item_id, item.get("donorId"), now,
                toRole="donor", organisation=match.get("organisation"),
            ),
        )

    write(db.transaction())
    return jsonify(_note_view(note_ref.get())), 201


@thanks_bp.get("/thank-you-notes")
@require_auth({"donor", "social_worker", "admin"})
def list_notes():
    """A donor's notes received, a social worker's notes sent, or every note for an admin."""
    query = get_db().collection(NOTES)
    role = g.user.get("role")
    if role == "social_worker":
        query = query.where("socialWorkerId", "==", g.user["uid"])
    elif role != "admin":
        query = query.where("donorId", "==", g.user["uid"])
    notes = [_note_view(snapshot) for snapshot in query.limit(200).stream()]
    notes.sort(key=lambda note: note.get("createdAt") or "", reverse=True)
    return jsonify(notes)
