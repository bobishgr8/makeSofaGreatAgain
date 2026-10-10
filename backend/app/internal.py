import hmac
from datetime import datetime, timezone

from flask import Blueprint, abort, current_app, jsonify, request

from . import lifecycle
from .firebase import get_db
from .validation import today_sgt

internal_bp = Blueprint("internal", __name__, url_prefix="/api/internal")


@internal_bp.post("/expire")
def expire():
    """Withdraw listings with no match within 3 days of their delivery date, and
    matches whose donor did not connect within 5 days.

    Meant for a scheduler (not wired up yet). Disabled unless
    INTERNAL_SCHEDULER_TOKEN is set.
    """
    token = current_app.config.get("INTERNAL_SCHEDULER_TOKEN")
    if not token:
        abort(404)
    if not hmac.compare_digest(request.headers.get("X-Internal-Token", ""), token):
        return jsonify({"error": "unauthorized"}), 401

    db = get_db()
    expired = lifecycle.expire_stale(db, today_sgt())
    lapsed = lifecycle.lapse_overdue(db, datetime.now(timezone.utc))
    return jsonify({"expired": expired, "lapsed": lapsed})
