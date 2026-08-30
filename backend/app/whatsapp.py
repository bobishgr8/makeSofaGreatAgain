import logging

import requests
from flask import current_app

logger = logging.getLogger(__name__)


def notify_new_listing(item: dict) -> None:
    """Best-effort ping to the WhatsApp bot to announce a newly approved listing.

    Never raises: the bot being offline or unconfigured shouldn't block an admin
    from approving furniture.
    """
    bot_url = current_app.config.get("WHATSAPP_BOT_URL")
    secret = current_app.config.get("WHATSAPP_BOT_SECRET")

    if not bot_url or not secret:
        return

    location = item.get("location") or {}
    payload = {
        "title": item.get("title") or "Untitled furniture",
        "category": item.get("category"),
        "condition": item.get("condition"),
        "neighbourhood": location.get("district"),
        "url": f"{current_app.config.get('WEB_ORIGIN')}/furniture/{item.get('id')}",
    }

    try:
        requests.post(
            f"{bot_url.rstrip('/')}/internal/announce",
            json=payload,
            headers={"X-Internal-Secret": secret},
            timeout=5,
        )
    except requests.RequestException:
        logger.warning(
            "Failed to notify WhatsApp bot of new listing %s", item.get("id")
        )
