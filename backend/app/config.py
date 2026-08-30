from flask import Blueprint, jsonify, request

from .auth import require_auth
from .firebase import get_db

config_bp = Blueprint("config", __name__, url_prefix="/api/config")

FORM_FIELD_KEYS = {
    "category",
    "subcategory",
    "title",
    "condition",
    "conditionNotes",
    "quantity",
    "widthCm",
    "depthCm",
    "heightCm",
    "neighbourhood",
    "floor",
    "hasLift",
    "fitsInLift",
    "disassembly",
    "delivery",
    "deadlineType",
    "collectionDeadline",
    "availability",
    "contactName",
    "whatsapp",
    "safeToUse",
    "offeredFree",
    "contactConsent",
    "photos",
}

FORM_FIELDS_DOC = ("platformConfig", "formFields")


def default_form_fields():
    return {key: True for key in FORM_FIELD_KEYS}


def get_form_fields():
    """Platform-wide donor form field visibility, admin-writable.

    Stored server-side (not in a per-browser preference) since it is meant
    to apply to every donor filling in the form, not just the admin who set it.
    """
    collection, document = FORM_FIELDS_DOC
    snapshot = get_db().collection(collection).document(document).get()
    stored = snapshot.to_dict() or {}
    fields = default_form_fields()
    fields.update({key: value for key, value in stored.items() if key in FORM_FIELD_KEYS})
    return fields


@config_bp.get("")
def get_config():
    # Server-authoritative UI configuration and sensible defaults.
    category_labels = {
        "sofa": "sofa",
        "table": "table",
        "chair": "chair",
        "bed": "bed",
        "storage": "storage unit",
        "other": "furniture item",
    }

    neighbourhoods = [
        "Ang Mo Kio",
        "Bedok",
        "Bishan",
        "Bukit Batok",
        "Bukit Merah",
        "Bukit Panjang",
        "Bukit Timah",
        "Choa Chu Kang",
        "Clementi",
        "Geylang",
        "Hougang",
        "Jurong East",
        "Jurong West",
        "Kallang",
        "Marine Parade",
        "Pasir Ris",
        "Punggol",
        "Queenstown",
        "Sembawang",
        "Sengkang",
        "Serangoon",
        "Tampines",
        "Toa Payoh",
        "Woodlands",
        "Yishun",
    ]

    initial_draft = {
        "title": "",
        "category": "",
        "subcategory": "",
        "condition": "",
        "conditionNotes": "",
        "quantity": 1,
        "widthCm": "",
        "depthCm": "",
        "heightCm": "",
        "neighbourhood": "",
        "floor": "",
        "hasLift": "",
        "fitsInLift": "",
        "disassembly": "",
        "delivery": "",
        "deadlineType": "flexible",
        "collectionDeadline": "",
        "availability": [],
        "contactName": "",
        "whatsapp": "",
        "safeToUse": False,
        "offeredFree": False,
        "contactConsent": False,
    }

    return jsonify({
        "categoryLabels": category_labels,
        "neighbourhoods": neighbourhoods,
        "initialDraft": initial_draft,
        "formFields": get_form_fields(),
    })


@config_bp.patch("/form-fields")
@require_auth({"admin"})
def update_form_fields():
    data = request.get_json(force=True)

    if not isinstance(data, dict) or not data:
        return jsonify({"error": "Expected a map of field name to boolean"}), 400

    invalid_keys = set(data) - FORM_FIELD_KEYS
    if invalid_keys:
        return jsonify({"error": f"Unknown form fields: {', '.join(sorted(invalid_keys))}"}), 400

    if any(not isinstance(value, bool) for value in data.values()):
        return jsonify({"error": "Field values must be booleans"}), 400

    collection, document = FORM_FIELDS_DOC
    get_db().collection(collection).document(document).set(data, merge=True)

    return jsonify(get_form_fields())
