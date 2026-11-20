"""WhatsApp notifications (PRD EPICs 3a and 5c): turns notificationsOutbox
entries into messages and sends them through the WhatsApp bot.

The lifecycle writes an outbox entry per person to tell in the same
transaction as each status change (lifecycle.outbox_entry). ``send_pending``
runs as a background job (jobs.py), so a slow or offline bot never blocks a
user action, and an entry is retried until it goes out.

``compose`` is pure: it picks the wording from the entry type and whether the
recipient is the item's donor or the matched social worker. The wording follows
the WhatsApp frames in the Figma flow (Refurbish Mock Design v1).
"""

import logging
import re

from . import lifecycle

logger = logging.getLogger(__name__)

OUTBOX = lifecycle.OUTBOX
BATCH_SIZE = 50
MAX_ATTEMPTS = 5
DONOR_PROFILES = "donorProfiles"
SOCIAL_WORKER_PROFILES = lifecycle.PROFILES

# {title}, {org} and {link} are filled in by compose().
DONOR_MESSAGES = {
    "submitted": (
        "Thanks for submitting your {title}! 🛋️\n"
        "We will let you know when we have a match.\n\nTrack it here: {link}"
    ),
    "approve": (
        "Your {title} is now listed, so social workers can find it for families in need. "
        "We will let you know when there is a match.\n\n{link}"
    ),
    "reject": "Sorry, we could not list your {title}. You can see why here: {link}",
    "withdraw_listing": (
        "Our team has taken down the listing for your {title}. You can see why here: {link}"
    ),
    "flag_for_review": (
        "Our team is taking another look at your {title} before it is shown again. "
        "We will let you know once it is back.\n\n{link}"
    ),
    "accept_match": (
        "Yay, you have a match! 🎉\n"
        "Your {title} has been matched with {org}. They support local families and "
        "community members in need.\n\n"
        "Please connect with the social worker within 5 days, or the match closes: {link}"
    ),
    "release_match": (
        "The social worker has released your {title}, so it is back in the pool. "
        "We will let you know when there is a new match.\n\n{link}"
    ),
    "lapse_match": (
        "The match for your {title} has closed because there was no connection within "
        "5 days.\n\n{link}"
    ),
    "rearrange_logistics": (
        "The social worker asked to rearrange the delivery of your {title}. "
        "Please send new delivery details: {link}"
    ),
    "confirm_logistics": (
        "Delivery is in progress! 🚚\n"
        "The social worker confirmed the delivery details for your {title}. "
        "Thank you for arranging it.\n\n{link}"
    ),
    "complete_delivery": (
        "Delivery complete! 🎉\nThank you for making a difference with your {title}.\n\n{link}"
    ),
    "cancel_delivery": (
        "The delivery of your {title} was called off, so it is back in the pool.\n\n{link}"
    ),
    "waitlist_promoted": (
        "Yay, you have a match! 🎉\n"
        "Your {title} has been matched with {org}, the next social worker on the waitlist.\n\n"
        "Please connect with the social worker within 5 days: {link}"
    ),
    "thank_you": (
        "You received a thank-you note! 💚\n"
        "A family supported by {org} has sent you a note for your {title}.\n\n"
        "Read it here: {thanks}"
    ),
}

SOCIAL_WORKER_MESSAGES = {
    "connect": (
        "Yay, the donor wants to connect with you! 🎉\n"
        "The donor of the {title} will contact you directly on WhatsApp. "
        "Please coordinate the next steps together:\n"
        "• Get more photos of the condition of the furniture\n"
        "• Confirm the delivery location and time\n"
        "• Once the donor chooses a delivery, you will be asked to confirm it\n\n{link}"
    ),
    "rematch": (
        "The donor of the {title} chose to find another match, so it has been released "
        "from your case. Your request is open again.\n\n{link}"
    ),
    "cancel_donation": (
        "The donor has cancelled the donation of the {title}. Your case's need is open "
        "again.\n\n{link}"
    ),
    "arrange_delivery": (
        "The donor of the {title} is arranging the delivery. You will be asked to confirm "
        "the details shortly.\n\n{link}"
    ),
    "propose_logistics": (
        "The donor wants to arrange the delivery of the {title}. Please confirm the "
        "logistics, or ask the donor to rearrange.\n\n{link}"
    ),
    "complete_delivery": (
        "Delivery complete! 🎉\nThank you for making a difference. You can send the donor "
        "a thank-you note from your workspace: {link}"
    ),
    "cancel_delivery": "The delivery of the {title} was called off.\n\n{link}",
    "release_match": (
        "The match for the {title} has been released, so your case's need is open again.\n\n{link}"
    ),
    "lapse_match": (
        "The donor of the {title} did not connect within 5 days, so the match has closed. "
        "Your case's need is open again.\n\n{link}"
    ),
    "waitlist_promoted": (
        "Good news! The {title} you are waiting for is now matched to your case. "
        "The donor has 5 days to connect with you on WhatsApp.\n\n{link}"
    ),
    "waitlist_closed": (
        "The {title} you were waiting for can no longer be matched to your case, so your "
        "waitlist request has closed. You can find other furniture here: {link}"
    ),
    "waitlist_expired": (
        "Your waitlist request for the {title} has closed after 30 days without a match. "
        "You can find other furniture here: {link}"
    ),
}


def normalise_phone(value):
    """Digits in international format, or None. An 8-digit number is taken as
    Singaporean (country code 65), as the forms suggest +65."""
    digits = re.sub(r"\D", "", str(value or ""))
    if len(digits) == 8 and digits[0] in "689":
        digits = "65" + digits
    return digits if 8 <= len(digits) <= 15 else None


def compose(entry, item, recipient_is_donor, web_origin):
    """The message text for one outbox entry, or None when there is nothing to say."""
    if entry.get("text"):
        return entry["text"]
    item = item or {}
    messages = DONOR_MESSAGES if recipient_is_donor else SOCIAL_WORKER_MESSAGES
    template = messages.get(entry.get("type"))
    if not template:
        return None
    origin = (web_origin or "").rstrip("/")
    item_id = entry.get("furnitureId") or item.get("id")
    link = f"{origin}/donor/furniture/{item_id}" if recipient_is_donor else f"{origin}/workspace"
    if not recipient_is_donor and entry.get("type") in ("rematch", "waitlist_closed", "waitlist_expired"):
        link = f"{origin}/matches"
    return template.format(
        title=item.get("title") or "furniture",
        org=lifecycle.active_match(item).get("organisation") or entry.get("organisation") or "a social worker",
        link=link,
        thanks=f"{origin}/thanks",
    )


def _phone_for(db, uid, recipient_is_donor):
    """The recipient's WhatsApp number, or (None, reason)."""
    collections = (
        (DONOR_PROFILES, SOCIAL_WORKER_PROFILES)
        if recipient_is_donor
        else (SOCIAL_WORKER_PROFILES, DONOR_PROFILES)
    )
    for collection in collections:
        profile = db.collection(collection).document(uid).get().to_dict() or {}
        if collection == DONOR_PROFILES and (profile.get("consent") or {}).get("contactAllowed") is False:
            return None, "no_consent"
        phone = normalise_phone(profile.get("phone") or profile.get("whatsapp"))
        if phone:
            return phone, None
    return None, "no_phone"


def send_pending(db, now, send):
    """Send unsent outbox entries. ``send(phone, text)`` returns True when the bot
    accepted the message. Returns counts for the job summary."""
    counts = {"sent": 0, "skipped": 0, "failed": 0, "retrying": 0}
    pending = list(db.collection(OUTBOX).where("sentAt", "==", None).limit(BATCH_SIZE).stream())
    pending.sort(key=lambda snapshot: (snapshot.to_dict() or {}).get("createdAt") or now)
    items = {}

    for snapshot in pending:
        entry = snapshot.to_dict() or {}
        reference = snapshot.reference
        item_id = entry.get("furnitureId")
        if item_id and item_id not in items:
            item_snapshot = db.collection(lifecycle.COLLECTION).document(item_id).get()
            items[item_id] = (
                {**item_snapshot.to_dict(), "id": item_id} if item_snapshot.exists else None
            )
        item = items.get(item_id)
        to_uid = entry.get("toUid")
        recipient_is_donor = entry.get("toRole") == "donor" or bool(
            item and to_uid and item.get("donorId") == to_uid
        )

        text = compose(entry, item, recipient_is_donor, _web_origin())
        phone, reason = (None, "no_message") if not text else _phone_for(db, to_uid, recipient_is_donor)
        if not phone:
            reference.update({"sentAt": now, "skipped": reason})
            counts["skipped"] += 1
            continue

        if send(phone, text):
            reference.update({"sentAt": now, "channel": "whatsapp"})
            counts["sent"] += 1
            continue

        attempts = (entry.get("attempts") or 0) + 1
        if attempts >= MAX_ATTEMPTS:
            reference.update({"attempts": attempts, "sentAt": now, "failed": True})
            counts["failed"] += 1
        else:
            reference.update({"attempts": attempts})
            counts["retrying"] += 1
    return counts


def _web_origin():
    from flask import current_app

    return current_app.config.get("WEB_ORIGIN") or ""
