import time

from flask import Blueprint, g, jsonify, request

from . import lalamove
from .auth import require_auth
from .lifecycle import ADDRESS_MAX_LEN
from .validation import clean_text, parse_delivery_date, today_sgt

logistics_bp = Blueprint("logistics", __name__, url_prefix="/api/logistics")

# Each quote makes outside calls (geocoder + Lalamove), so keep one caller from
# hammering them. Per process, which is enough for a single Flask server.
COOLDOWN_SECONDS = 3
_last_quote = {}


def _address(value, label):
    try:
        address = clean_text(value, ADDRESS_MAX_LEN)
    except ValueError as error:
        raise ValueError(f"{label} {error}") from None
    if not address:
        raise ValueError(f"{label} is required")
    return address


@logistics_bp.post("/quote")
@require_auth({"donor", "admin"})
def quote():
    """Live Lalamove prices for a pick-up and delivery address. Read-only: no
    order is placed. The client falls back to the static estimates on any error."""
    body = request.get_json(silent=True) or {}
    try:
        pickup = _address(body.get("pickupAddress"), "Pick-up address")
        delivery = _address(body.get("deliveryAddress"), "Delivery address")
        delivery_date = parse_delivery_date(body.get("deliveryDate"), today_sgt())
    except ValueError as error:
        return jsonify({"error": str(error).replace("Expected delivery date", "Delivery date")}), 400

    now = time.monotonic()
    uid = g.user["uid"]
    if now - _last_quote.get(uid, -COOLDOWN_SECONDS) < COOLDOWN_SECONDS:
        return jsonify({"error": "Please wait a moment before asking again"}), 429
    _last_quote[uid] = now

    try:
        quotes = lalamove.quote_trip(pickup, delivery, _to_date(delivery_date))
    except lalamove.QuoteError as error:
        return jsonify({"error": str(error)}), error.status
    return jsonify({"provider": "Lalamove", "quotes": quotes})


def _to_date(iso):
    from datetime import date

    return date.fromisoformat(iso)
