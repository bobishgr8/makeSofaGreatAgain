import re

from flask import abort


def require_fields(data, fields):
    missing = [field for field in fields if data.get(field) in (None, "", [])]
    if missing:
        abort(400, description=f"Missing required fields: {', '.join(missing)}")


def public_patch(data, allowed):
    return {key: value for key, value in data.items() if key in allowed}


# ---------- Furniture listing bounds ----------
# Mirrors the limits enforced client-side in FurnitureForm.tsx. The client can
# always be bypassed by calling the API directly, so these are the real limits.

MIN_QUANTITY = 1
MAX_QUANTITY = 20

MIN_DIMENSION_CM = 1
MAX_DIMENSION_CM = 500

MIN_FLOOR = 0
MAX_FLOOR = 150

MIN_TITLE_LENGTH = 3
MAX_TITLE_LENGTH = 120

MAX_SUBCATEGORY_LENGTH = 80

MIN_CONDITION_NOTES_LENGTH = 5
MAX_CONDITION_NOTES_LENGTH = 800

MAX_PHOTOS = 5

ALLOWED_CONDITIONS = {"excellent", "good", "usable", "repair_needed"}
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
    if value is not None and value not in allowed:
        errors.append(f"{label} must be one of {', '.join(sorted(allowed))}")


def validate_furniture(item: dict) -> list:
    """Sanity-checks a furniture payload. Returns a list of human-readable
    errors; an empty list means the payload is valid. Only checks fields
    that are present, so it works for both full creates and partial patches.
    """
    errors: list = []

    # Only validate fields that are actually present, so this same function
    # works both for a full create (where require_fields already guaranteed
    # title/conditionNotes are non-empty) and for a partial patch that only
    # touches some fields.
    if "title" in item:
        _check_text_length(item.get("title"), "Title", MIN_TITLE_LENGTH, MAX_TITLE_LENGTH, errors)
    _check_text_length(
        item.get("subcategory"), "Subcategory", 0, MAX_SUBCATEGORY_LENGTH, errors, required=False
    )
    if "conditionNotes" in item:
        _check_text_length(
            item.get("conditionNotes"),
            "Condition notes",
            MIN_CONDITION_NOTES_LENGTH,
            MAX_CONDITION_NOTES_LENGTH,
            errors,
        )

    _check_choice(item.get("condition"), "Condition", ALLOWED_CONDITIONS, errors)

    if "quantity" in item:
        _check_int_range(item.get("quantity"), "Quantity", MIN_QUANTITY, MAX_QUANTITY, errors)

    dimensions = item.get("dimensionsCm")
    if dimensions is not None:
        if not isinstance(dimensions, dict):
            errors.append("Dimensions must be an object")
        else:
            for axis in ("width", "depth", "height"):
                if axis in dimensions:
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
            if "floor" in collection:
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

    return errors
