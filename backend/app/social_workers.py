import re
from datetime import datetime, timezone

from flask import Blueprint, abort, g, jsonify, request

from .auth import require_auth
from .firebase import get_db, serialise
from .validation import clean_text

social_workers_bp = Blueprint(
    "social_workers", __name__, url_prefix="/api/social-workers"
)

ORGANISATION_MAX_LEN = 100
# International format without the +, which is what a wa.me link takes.
WHATSAPP_PATTERN = re.compile(r"\d{8,15}")


@social_workers_bp.get("/me")
@require_auth({"social_worker", "admin"})
def get_profile():
    document = get_db().collection("socialWorkerProfiles").document(g.user["uid"]).get()
    if not document.exists:
        return jsonify({"id": g.user["uid"], "verificationStatus": "pending"})
    return jsonify(serialise(document))


@social_workers_bp.patch("/me")
@require_auth({"social_worker", "admin"})
def update_profile():
    """A donor sees the organisation and connects on this WhatsApp number once matched."""
    body = request.get_json(force=True) or {}
    changes = {}

    if "organisation" in body:
        try:
            organisation = clean_text(body["organisation"], ORGANISATION_MAX_LEN)
        except ValueError as error:
            abort(400, description=f"Organisation {error}")
        if not organisation:
            abort(400, description="Organisation is required")
        changes["organisation"] = organisation

    if "whatsapp" in body:
        digits = re.sub(r"[\s+()-]", "", str(body["whatsapp"] or ""))
        if not WHATSAPP_PATTERN.fullmatch(digits):
            abort(400, description="WhatsApp number must be 8 to 15 digits, with the country code")
        changes["whatsapp"] = digits

    if not changes:
        abort(400, description="Nothing to update")

    changes["updatedAt"] = datetime.now(timezone.utc)
    reference = get_db().collection("socialWorkerProfiles").document(g.user["uid"])
    reference.set(changes, merge=True)
    return jsonify(serialise(reference.get()))
