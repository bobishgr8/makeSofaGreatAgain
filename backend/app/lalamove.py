"""Lalamove v3 price quotes (quotations only: nothing is ordered or paid).

Configured by LALAMOVE_API_KEY / LALAMOVE_API_SECRET. LALAMOVE_ENV selects the
sandbox (default) or production host; LALAMOVE_SERVICE_TYPES is a comma list of
vehicle types to price (check GET /v3/cities with ``Market: SG`` for the valid
ones). Addresses are free text, so they are geocoded first (OpenStreetMap
Nominatim, Singapore only) because Lalamove wants coordinates for every stop.
"""

import hashlib
import hmac
import json
import os
import time
import uuid
from datetime import datetime, time as day_time, timezone

import requests

from .validation import SINGAPORE

HOSTS = {
    "sandbox": "https://rest.sandbox.lalamove.com",
    "production": "https://rest.lalamove.com",
}
GEOCODER_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "refurbish-platform/0.1 (furniture redistribution)"
TIMEOUT = 10


class QuoteError(Exception):
    def __init__(self, message, status=502):
        super().__init__(message)
        self.status = status


def credentials():
    key = os.getenv("LALAMOVE_API_KEY")
    secret = os.getenv("LALAMOVE_API_SECRET")
    return (key, secret) if key and secret else None


def service_types():
    raw = os.getenv("LALAMOVE_SERVICE_TYPES", "VAN")
    return [value.strip() for value in raw.split(",") if value.strip()]


def sign(secret, timestamp_ms, method, path, body):
    """Lalamove's HMAC-SHA256 hex signature over the request."""
    raw = f"{timestamp_ms}\r\n{method}\r\n{path}\r\n\r\n{body}"
    return hmac.new(secret.encode(), raw.encode(), hashlib.sha256).hexdigest()


def geocode(address):
    """(lat, lng) strings for a Singapore address, or raise QuoteError."""
    try:
        response = requests.get(
            GEOCODER_URL,
            params={"q": address, "format": "jsonv2", "countrycodes": "sg", "limit": 1},
            headers={"User-Agent": USER_AGENT},
            timeout=TIMEOUT,
        )
        response.raise_for_status()
        hits = response.json()
    except (requests.RequestException, ValueError):
        raise QuoteError("Couldn't look up that address right now") from None
    if not hits:
        raise QuoteError(f"Couldn't find \"{address}\" in Singapore", status=422)
    return str(hits[0]["lat"]), str(hits[0]["lon"])


def schedule_at(delivery_date, now):
    """09:00 SGT on the delivery date as UTC ISO, or None if that is not ahead."""
    when = datetime.combine(delivery_date, day_time(9, 0), tzinfo=SINGAPORE)
    if when <= now:
        return None
    return when.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def build_body(service_type, pickup, delivery, scheduled):
    data = {
        "serviceType": service_type,
        "language": "en_SG",
        "stops": [
            {"coordinates": {"lat": pickup[0], "lng": pickup[1]}, "address": pickup[2]},
            {"coordinates": {"lat": delivery[0], "lng": delivery[1]}, "address": delivery[2]},
        ],
    }
    if scheduled:
        data["scheduleAt"] = scheduled
    return {"data": data}


def _quotation(keys, body):
    path = "/v3/quotations"
    payload = json.dumps(body, separators=(",", ":"))
    timestamp = str(int(time.time() * 1000))
    signature = sign(keys[1], timestamp, "POST", path, payload)
    host = HOSTS.get(os.getenv("LALAMOVE_ENV", "sandbox"), HOSTS["sandbox"])
    try:
        response = requests.post(
            host + path,
            data=payload,
            headers={
                "Authorization": f"hmac {keys[0]}:{timestamp}:{signature}",
                "Market": "SG",
                "Request-ID": str(uuid.uuid4()),
                "Content-Type": "application/json",
            },
            timeout=TIMEOUT,
        )
    except requests.RequestException:
        raise QuoteError("Lalamove is not reachable right now") from None
    if response.status_code >= 400:
        raise QuoteError("Lalamove couldn't price this trip", status=502)
    return response.json().get("data") or {}


def quote_trip(pickup_address, delivery_address, delivery_date, now=None):
    """Live Lalamove prices for each configured vehicle type. Indicative only:
    the quotation is not kept and nothing is booked."""
    keys = credentials()
    if not keys:
        raise QuoteError("Live Lalamove prices are not set up", status=503)
    now = now or datetime.now(timezone.utc)

    pickup = (*geocode(pickup_address), pickup_address)
    delivery = (*geocode(delivery_address), delivery_address)
    scheduled = schedule_at(delivery_date, now)

    quotes = []
    for service_type in service_types():
        data = _quotation(keys, build_body(service_type, pickup, delivery, scheduled))
        breakdown = data.get("priceBreakdown") or {}
        quotes.append(
            {
                "serviceType": service_type,
                "total": breakdown.get("total"),
                "currency": breakdown.get("currency", "SGD"),
                "expiresAt": data.get("expiresAt"),
                "distanceMetres": (data.get("distance") or {}).get("value"),
            }
        )
    return quotes
