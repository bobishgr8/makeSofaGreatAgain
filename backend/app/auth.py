from functools import wraps

from firebase_admin import auth
from flask import current_app, g, jsonify, request


def require_auth(roles=None):
    roles = set(roles or [])

    def decorator(route):
        @wraps(route)
        def wrapped(*args, **kwargs):
            if current_app.config.get("AUTH_DISABLED"):
                g.user = {
                    "uid": request.headers.get("X-Demo-User", "demo-social-worker"),
                    "role": request.headers.get("X-Demo-Role", "social_worker"),
                }
            else:
                header = request.headers.get("Authorization", "")
                if not header.startswith("Bearer "):
                    return jsonify({"error": "Authentication required"}), 401
                try:
                    g.user = auth.verify_id_token(header.removeprefix("Bearer "))
                except Exception:
                    return jsonify({"error": "Invalid or expired authentication"}), 401

            if roles and g.user.get("role") not in roles:
                return jsonify({"error": "You do not have access to this action"}), 403
            return route(*args, **kwargs)

        return wrapped

    return decorator
