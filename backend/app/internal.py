import hmac
from datetime import datetime, timezone

from flask import Blueprint, abort, current_app, jsonify, request

from . import lifecycle
from .firebase import get_db

internal_bp = Blueprint("internal", __name__, url_prefix="/api/internal")


@internal_bp.post("/expire")
def expire():
    """Withdraw matches whose donor did not connect within 5 days. Listings are
    no longer withdrawn near their delivery date.

    Meant for a scheduler (not wired up yet). Disabled unless
    INTERNAL_SCHEDULER_TOKEN is set.
    """
    token = current_app.config.get("INTERNAL_SCHEDULER_TOKEN")
    if not token:
        abort(404)
    if not hmac.compare_digest(request.headers.get("X-Internal-Token", ""), token):
        return jsonify({"error": "unauthorized"}), 401

    lapsed = lifecycle.lapse_overdue(get_db(), datetime.now(timezone.utc))
    return jsonify({"lapsed": lapsed})
