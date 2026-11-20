"""Background jobs. Each takes the Firestore client and the current time and
returns a small summary, so ``run_all`` can be called from the internal endpoint
(``POST /api/internal/run-jobs``, for a cron or cloud scheduler) or from
``backend/scripts/scheduler.py`` during local development.

Every job is safe to run repeatedly and concurrently with user actions: status
changes still go through ``lifecycle.apply_action`` transactions.
"""

import logging
from datetime import timedelta

from . import lifecycle, notifications, whatsapp

logger = logging.getLogger(__name__)


def lapse_overdue_matches(db, now):
    return {"lapsed": lifecycle.lapse_overdue(db, now)}


def expire_waitlists(db, now):
    return lifecycle.expire_waitlists(db, now)


WEEK = timedelta(days=7)
JOB_STATE = ("platformConfig", "jobs")


def weekly_summary_text(open_cases, new_items, in_progress, delivered, web_origin):
    """The weekly WhatsApp summary for a social worker (EPIC 12), or None when
    there is nothing new to say."""
    if not (new_items or in_progress or delivered):
        return None
    lines = ["Your week on Refurbish 🛋️", ""]
    lines.append(f"• {open_cases} open case{'s' if open_cases != 1 else ''}")
    if new_items:
        lines.append(f"• {new_items} new item{'s' if new_items != 1 else ''} listed that your households need")
    if in_progress:
        lines.append(f"• {in_progress} match{'es' if in_progress != 1 else ''} in progress")
    if delivered:
        lines.append(f"• {delivered} deliver{'ies' if delivered != 1 else 'y'} completed this week 🎉")
    lines.extend(["", f"See the details: {(web_origin or '').rstrip('/')}/workspace"])
    return "\n".join(lines)


def weekly_summaries(db, now):
    """Queue a weekly summary for each social worker with open cases."""
    state_ref = db.collection(JOB_STATE[0]).document(JOB_STATE[1])
    last = (state_ref.get().to_dict() or {}).get("weeklySummaryAt")
    if last and now - last < WEEK:
        return {"skipped": "not due"}

    from flask import current_app

    week_ago = now - WEEK
    items = [snapshot.to_dict() or {} for snapshot in db.collection(lifecycle.COLLECTION).stream()]
    cases_by_worker = {}
    for snapshot in db.collection(lifecycle.CASES).where("status", "==", "open").stream():
        case = snapshot.to_dict() or {}
        cases_by_worker.setdefault(case.get("socialWorkerId"), []).append(case)

    queued = 0
    for worker, cases in cases_by_worker.items():
        if not worker:
            continue
        needs = {
            (need.get("category") or "").lower()
            for case in cases for need in (case.get("needs") or []) if isinstance(need, dict)
        }
        new_items = sum(
            1 for item in items
            if item.get("status") == "available"
            and (item.get("category") or "").lower() in needs
            and (item.get("createdAt") or week_ago) > week_ago
        )
        mine = [item for item in items if lifecycle.active_match(item).get("socialWorkerId") == worker]
        in_progress = sum(1 for item in mine if item.get("status") in lifecycle.ACTIVE_MATCH_STATUSES)
        delivered = sum(
            1 for item in mine
            if item.get("status") == "delivered"
            and (lifecycle.active_match(item).get("deliveredAt") or week_ago) > week_ago
        )
        text = weekly_summary_text(
            len(cases), new_items, in_progress, delivered, current_app.config.get("WEB_ORIGIN")
        )
        if text:
            db.collection(lifecycle.OUTBOX).document().set(
                lifecycle.outbox_entry("weekly_summary", None, worker, now, toRole="social_worker", text=text)
            )
            queued += 1

    state_ref.set({"weeklySummaryAt": now}, merge=True)
    return {"queued": queued}


def send_notifications(db, now):
    """Send pending outbox entries over WhatsApp. Left queued while the bot is
    not configured, so nothing is lost before it is set up."""
    if not whatsapp.bot_configured():
        return {"skipped": "WHATSAPP_BOT_URL / WHATSAPP_BOT_SECRET not set"}
    return notifications.send_pending(db, now, whatsapp.send_direct)


# (name, function). Later jobs see the effects of earlier ones in the same run,
# so notifications go last and include what the other jobs queued.
JOBS = [
    ("lapse_overdue_matches", lapse_overdue_matches),
    ("expire_waitlists", expire_waitlists),
    ("weekly_summaries", weekly_summaries),
    ("send_notifications", send_notifications),
]


def run_all(db, now):
    """Run every job; one failing job does not stop the others."""
    results = {}
    for name, job in JOBS:
        try:
            results[name] = job(db, now)
        except Exception as error:  # noqa: BLE001 - reported, not raised
            logger.exception("Job %s failed", name)
            results[name] = {"error": str(error)}
    return results
