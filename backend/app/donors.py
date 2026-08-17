from datetime import datetime, timezone
from http.client import HTTPException

from flask import Blueprint, g, jsonify, request

from .auth import require_auth
from .firebase import get_db, serialise
from .validation import public_patch

donors_bp = Blueprint("donors", __name__, url_prefix="/api/donors")


@donors_bp.get("/me")
@require_auth({"donor", "admin", "social_worker"})
def get_profile():
    document = get_db().collection("donorProfiles").document(g.user["uid"]).get()
    if not document.exists:
        return jsonify({"id": g.user["uid"], "status": "new"})
    return jsonify(serialise(document))


@donors_bp.patch("/me")
@require_auth({"donor", "admin", "social_worker"})
def update_profile():
    data = public_patch(
        request.get_json(force=True),
        {"displayName", "phone", "preferredContactMethod", "address", "consent"},
    )
    data["updatedAt"] = datetime.now(timezone.utc)
    reference = get_db().collection("donorProfiles").document(g.user["uid"])
    reference.set(data, merge=True)
    return jsonify(serialise(reference.get()))

@donors_bp.get("/me/<donor_id>")
@require_auth({"donor", "admin", "social_worker"})
def get_donor_profile(donor_id: str):
    doc = get_db().collection("donorProfiles").document(donor_id).get()

    if not doc.exists:
        raise HTTPException(
            status_code=404,
            detail="Donor profile not found",
        )

    data = doc.to_dict()

    return {
        "id": doc.id,
        "displayName": data.get("displayName"),
        "phone": data.get("phone"),
        "preferredContactMethod": data.get("preferredContactMethod"),
        "consent": data.get("consent"),
        "updatedAt": data.get("updatedAt"),
    }