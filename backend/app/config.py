from flask import Blueprint, jsonify

config_bp = Blueprint("config", __name__, url_prefix="/api/config")


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
    })
