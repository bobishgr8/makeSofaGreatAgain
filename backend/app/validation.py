from flask import abort


def require_fields(data, fields):
    missing = [field for field in fields if data.get(field) in (None, "", [])]
    if missing:
        abort(400, description=f"Missing required fields: {', '.join(missing)}")


def public_patch(data, allowed):
    return {key: value for key, value in data.items() if key in allowed}
