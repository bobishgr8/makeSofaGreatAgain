import hmac
from datetime import datetime, timezone

from flask import Blueprint, abort, current_app, jsonify, request

from . import jobs, lifecycle
from .firebase import get_db

internal_bp = Blueprint("internal", __name__, url_prefix="/api/internal")


def _check_token():
    """Disabled (404) unless INTERNAL_SCHEDULER_TOKEN is set; 401 on a wrong token."""
    token = current_app.config.get("INTERNAL_SCHEDULER_TOKEN")
    if not token:
        abort(404)
    if not hmac.compare_digest(request.headers.get("X-Internal-Token", ""), token):
        return jsonify({"error": "unauthorized"}), 401
    return None


@internal_bp.post("/expire")
def expire():
    """Withdraw matches whose donor did not connect within 5 days. Kept for
    existing callers; /run-jobs does this and everything else."""
    denied = _check_token()
    if denied:
        return denied
    lapsed = lifecycle.lapse_overdue(get_db(), datetime.now(timezone.utc))
    return jsonify({"lapsed": lapsed})


@internal_bp.post("/run-jobs")
def run_jobs():
    """Run every background job (see jobs.py). Meant for a scheduler: locally,
    backend/scripts/scheduler.py runs them without this endpoint."""
    denied = _check_token()
    if denied:
        return denied
    return jsonify(jobs.run_all(get_db(), datetime.now(timezone.utc)))
