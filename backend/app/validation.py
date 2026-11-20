import re
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


def parse_delivery_date(value, today: date, min_days: int = 0):
    """Validate a YYYY-MM-DD date at least ``min_days`` after today. Returns the ISO string."""
    if not isinstance(value, str):
        raise ValueError("Expected delivery date is required")
    try:
        parsed = date.fromisoformat(value)
    except ValueError:
        raise ValueError("Expected delivery date must be YYYY-MM-DD") from None
    if parsed < today:
        raise ValueError("Expected delivery date cannot be in the past")
    if (parsed - today).days < min_days:
        raise ValueError(f"Expected delivery date must be at least {min_days} days from today")
    return parsed.isoformat()


POSTAL_CODE_PATTERN = re.compile(r"\d{6}")


def clean_postal_code(value):
    """A Singapore postal code: six digits, spaces allowed. Raises ValueError."""
    digits = re.sub(r"\s", "", value) if isinstance(value, str) else ""
    if not POSTAL_CODE_PATTERN.fullmatch(digits):
        raise ValueError("Postal code must be 6 digits")
    return digits


# ---------- Furniture listing bounds ----------
# Mirrors the limits enforced client-side in FurnitureForm.tsx. The client can
# always be bypassed by calling the API directly, so these are the real limits.
# Blank values ("", None, a 0 dimension) count as "not given": the admin can turn
# form fields off (platformConfig/formFields), and the form still sends them.

MIN_QUANTITY = 1
MAX_QUANTITY = 20

MIN_DIMENSION_CM = 1
MAX_DIMENSION_CM = 500

MIN_FLOOR = 0
MAX_FLOOR = 150

MIN_TITLE_LENGTH = 3
MAX_TITLE_LENGTH = 120

MAX_SUBCATEGORY_LENGTH = 80
MAX_BRAND_LENGTH = 80
MAX_DETAILS = 20
MAX_DETAIL_KEY_LENGTH = 40
MAX_DETAIL_VALUE_LENGTH = 500

MIN_CONDITION_NOTES_LENGTH = 5
MAX_CONDITION_NOTES_LENGTH = 800

MAX_PHOTOS = 5

# The five PRD levels, plus excellent / usable / repair_needed from older listings.
ALLOWED_CONDITIONS = {
    "like_new", "good", "visible_wear", "minor_defect", "requires_repair",
    "excellent", "usable", "repair_needed",
}
ALLOWED_FITS_IN_LIFT = {"yes", "no", "not_sure"}
ALLOWED_DISASSEMBLY = {"not_sure", "already", "yes", "no"}
ALLOWED_DELIVERY_AREA = {"network", "local", "maybe", "no"}
ALLOWED_DEADLINE_TYPE = {"flexible", "specific"}


def _is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _check_int_range(value, label, minimum, maximum, errors):
    if not _is_number(value) or value != int(value):
        errors.append(f"{label} must be a whole number")
        return
    if value < minimum or value > maximum:
        errors.append(f"{label} must be between {minimum} and {maximum}")


def _check_text_length(value, label, minimum, maximum, errors, required=True):
    if value in (None, ""):
        if required:
            errors.append(f"{label} is required")
        return
    if not isinstance(value, str):
        errors.append(f"{label} must be text")
        return
    length = len(value.strip())
    if length < minimum:
        errors.append(f"{label} must be at least {minimum} characters")
    if length > maximum:
        errors.append(f"{label} must be at most {maximum} characters")


def _check_choice(value, label, allowed, errors):
    if value not in (None, "") and value not in allowed:
        errors.append(f"{label} must be one of {', '.join(sorted(allowed))}")


def _check_details(details, errors):
    """The answers to the per-category questions (frontend/src/common/donationSpec.ts):
    a small flat object of short text, numbers or yes/no values."""
    if details is None:
        return
    if not isinstance(details, dict):
        errors.append("Details must be an object")
        return
    if len(details) > MAX_DETAILS:
        errors.append(f"Details can have at most {MAX_DETAILS} answers")
    for key, value in details.items():
        if not isinstance(key, str) or not key or len(key) > MAX_DETAIL_KEY_LENGTH:
            errors.append("Details have an invalid question")
            return
        if isinstance(value, str):
            if len(value) > MAX_DETAIL_VALUE_LENGTH:
                errors.append(f"Details must be at most {MAX_DETAIL_VALUE_LENGTH} characters each")
                return
        elif not (isinstance(value, (int, float, bool)) or value is None):
            errors.append("Details must be text, numbers or yes/no")
            return


def validate_furniture(item: dict) -> list:
    """Sanity-checks a furniture payload. Returns a list of human-readable
    errors; an empty list means the payload is valid. Only checks fields
    that are present, so it works for both full creates and partial patches.
    """
    errors: list = []

    if "title" in item:
        _check_text_length(item.get("title"), "Title", MIN_TITLE_LENGTH, MAX_TITLE_LENGTH, errors)
    _check_text_length(
        item.get("subcategory"), "Subcategory", 0, MAX_SUBCATEGORY_LENGTH, errors, required=False
    )
    _check_text_length(
        item.get("conditionNotes"),
        "Condition notes",
        MIN_CONDITION_NOTES_LENGTH,
        MAX_CONDITION_NOTES_LENGTH,
        errors,
        required=False,
    )

    _check_text_length(item.get("brand"), "Brand", 0, MAX_BRAND_LENGTH, errors, required=False)
    _check_text_length(
        item.get("modelNumber"), "Model number", 0, MAX_BRAND_LENGTH, errors, required=False
    )
    _check_details(item.get("details"), errors)

    _check_choice(item.get("condition"), "Condition", ALLOWED_CONDITIONS, errors)

    if "quantity" in item:
        _check_int_range(item.get("quantity"), "Quantity", MIN_QUANTITY, MAX_QUANTITY, errors)

    dimensions = item.get("dimensionsCm")
    if dimensions is not None:
        if not isinstance(dimensions, dict):
            errors.append("Dimensions must be an object")
        else:
            for axis in ("width", "depth", "height"):
                if dimensions.get(axis) not in (None, "", 0):
                    _check_int_range(
                        dimensions.get(axis),
                        f"Dimension ({axis})",
                        MIN_DIMENSION_CM,
                        MAX_DIMENSION_CM,
                        errors,
                    )

    photos = item.get("photos")
    if photos is not None:
        if not isinstance(photos, list):
            errors.append("Photos must be a list")
        elif len(photos) > MAX_PHOTOS:
            errors.append(f"You can add up to {MAX_PHOTOS} photos")

    collection = item.get("collection")
    if collection is not None:
        if not isinstance(collection, dict):
            errors.append("Collection details must be an object")
        else:
            if collection.get("floor") not in (None, ""):
                _check_int_range(collection.get("floor"), "Floor", MIN_FLOOR, MAX_FLOOR, errors)
            _check_choice(collection.get("fitsInLift"), "Fits in lift", ALLOWED_FITS_IN_LIFT, errors)
            _check_choice(collection.get("disassembly"), "Disassembly", ALLOWED_DISASSEMBLY, errors)
            _check_choice(
                collection.get("deliveryArea"), "Delivery area", ALLOWED_DELIVERY_AREA, errors
            )
            _check_choice(
                collection.get("deadlineType"), "Deadline type", ALLOWED_DEADLINE_TYPE, errors
            )

    return errors


# ---------- Donor profile bounds ----------

MAX_DISPLAY_NAME_LENGTH = 80

PHONE_PATTERN = re.compile(r"^\+?[0-9()\-\s]{7,20}$")


def validate_donor_profile(data: dict) -> list:
    """Sanity-checks a donor profile payload. Same empty-list-means-valid
    convention as validate_furniture.
    """
    errors: list = []

    _check_text_length(
        data.get("displayName"), "Contact name", 1, MAX_DISPLAY_NAME_LENGTH, errors, required=False
    )

    phone = data.get("phone")
    if phone not in (None, ""):
        if not isinstance(phone, str) or not PHONE_PATTERN.match(phone.strip()):
            errors.append("WhatsApp number is not a valid phone number")

    # The default pick-up address (PRD: "optional pick up address").
    _check_text_length(data.get("address"), "Pick-up address", 0, 200, errors, required=False)

    consent = data.get("consent")
    if consent is not None and (
        not isinstance(consent, dict)
        or not isinstance(consent.get("contactAllowed", False), bool)
    ):
        errors.append("Consent must say whether we may contact you")

    return errors
