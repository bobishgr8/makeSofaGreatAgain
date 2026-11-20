"""Admin-only tools: platform stats (PRD EPIC 15) and running the background
jobs on demand (EPIC 14, for when no scheduler is set up)."""

from collections import Counter
from datetime import datetime, timedelta, timezone

from flask import Blueprint, jsonify

from . import jobs, lifecycle
from .auth import require_auth
from .firebase import get_db

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")


def compute_stats(furniture, cases, notes, outbox, now):
    """Pure: the dashboard numbers from plain dicts, so it can be unit-tested."""
    week_ago = now - timedelta(days=7)
    by_status = Counter(item.get("status") or "unknown" for item in furniture)
    delivered = [item for item in furniture if item.get("status") in ("delivered", "collected")]

    def delivered_at(item):
        return lifecycle.active_match(item).get("deliveredAt")

    return {
        "furnitureByStatus": dict(by_status),
        "furnitureTotal": len(furniture),
        "deliveredTotal": len(delivered),
        "deliveredThisWeek": sum(1 for item in delivered if (delivered_at(item) or week_ago) > week_ago),
        "deliveredByCategory": dict(Counter(item.get("category") or "other" for item in delivered)),
        "activeMatches": sum(by_status.get(status, 0) for status in lifecycle.ACTIVE_MATCH_STATUSES),
        "waitlistEntries": sum(len(lifecycle.waitlist(item)) for item in furniture),
        "awaitingReview": by_status.get("pending_review", 0),
        "openCases": sum(1 for case in cases if (case.get("status") or "open") == "open"),
        "casesTotal": len(cases),
        "thankYouNotes": len(notes),
        "notificationsPending": sum(1 for entry in outbox if entry.get("sentAt") is None),
        "notificationsFailed": sum(1 for entry in outbox if entry.get("failed")),
    }


@admin_bp.get("/stats")
@require_auth({"admin"})
def stats():
    db = get_db()

    def rows(collection):
        return [snapshot.to_dict() or {} for snapshot in db.collection(collection).stream()]

    return jsonify(
        compute_stats(
            rows(lifecycle.COLLECTION),
            rows(lifecycle.CASES),
            rows("thankYouNotes"),
            rows(lifecycle.OUTBOX),
            datetime.now(timezone.utc),
        )
    )


@admin_bp.post("/run-jobs")
@require_auth({"admin"})
def run_jobs():
    return jsonify(jobs.run_all(get_db(), datetime.now(timezone.utc)))
