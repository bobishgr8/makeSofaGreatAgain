from datetime import date, datetime, timedelta, timezone

from flask import abort

# Singapore has been UTC+8 with no daylight saving since 1982. A fixed offset
# avoids needing the tz database, which Windows Python doesn't ship.
SINGAPORE = timezone(timedelta(hours=8), "SGT")


def require_fields(data, fields):
    missing = [field for field in fields if data.get(field) in (None, "", [])]
    if missing:
        abort(400, description=f"Missing required fields: {', '.join(missing)}")


def public_patch(data, allowed):
    return {key: value for key, value in data.items() if key in allowed}


def today_sgt():
    """Today's date in Singapore, which is what donors mean by 'today'."""
    return datetime.now(SINGAPORE).date()


def clean_text(value, max_len):
    """Trim a free-text field. Returns None when blank, raises ValueError when invalid."""
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("must be text")
    text = value.strip()
    if len(text) > max_len:
        raise ValueError(f"must be {max_len} characters or fewer")
    return text or None


def parse_delivery_date(value, today: date):
    """Validate a YYYY-MM-DD date that is today or later. Returns the ISO string."""
    if not isinstance(value, str):
        raise ValueError("Expected delivery date is required")
    try:
        parsed = date.fromisoformat(value)
    except ValueError:
        raise ValueError("Expected delivery date must be YYYY-MM-DD") from None
    if parsed < today:
        raise ValueError("Expected delivery date cannot be in the past")
    return parsed.isoformat()
