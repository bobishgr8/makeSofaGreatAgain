from flask import Blueprint, g, jsonify

from .auth import require_auth
from .firebase import get_db, serialise

social_workers_bp = Blueprint(
    "social_workers", __name__, url_prefix="/api/social-workers"
)


@social_workers_bp.get("/me")
@require_auth({"social_worker", "admin"})
def get_profile():
    document = get_db().collection("socialWorkerProfiles").document(g.user["uid"]).get()
    if not document.exists:
        return jsonify({"id": g.user["uid"], "verificationStatus": "pending"})
    return jsonify(serialise(document))
