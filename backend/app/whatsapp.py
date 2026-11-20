import logging

import requests
from flask import current_app

from .config import CATEGORY_LABELS

logger = logging.getLogger(__name__)


def bot_configured() -> bool:
    return bool(
        current_app.config.get("WHATSAPP_BOT_URL") and current_app.config.get("WHATSAPP_BOT_SECRET")
    )


def send_direct(phone: str, text: str) -> bool:
    """Send one WhatsApp message to a person through the bot. Returns True when
    the bot accepted it. Never raises."""
    bot_url = current_app.config.get("WHATSAPP_BOT_URL")
    secret = current_app.config.get("WHATSAPP_BOT_SECRET")
    if not bot_url or not secret:
        return False
    try:
        response = requests.post(
            f"{bot_url.rstrip('/')}/internal/send",
            json={"to": phone, "text": text},
            headers={"X-Internal-Secret": secret},
            timeout=10,
        )
        return response.ok
    except requests.RequestException:
        logger.warning("Failed to reach the WhatsApp bot")
        return False


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
    category = item.get("category")
    payload = {
        "title": item.get("title") or "Untitled furniture",
        "category": CATEGORY_LABELS.get(category, category),
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
