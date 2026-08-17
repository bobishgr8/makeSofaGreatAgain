from functools import wraps

from firebase_admin import auth
from flask import Blueprint, current_app, g, jsonify, request


auth_bp = Blueprint("auth", __name__)

SELF_ASSIGNABLE_ROLES = {
    "donor",
    "social_worker",
}

VALID_ROLES = {
    "donor",
    "social_worker",
    "admin",
}

VALID_APPROVAL_STATUSES = {
    "pending",
    "approved",
    "rejected",
}


def require_auth(roles=None, require_approval=False):
    allowed_roles = set(roles or [])

    def decorator(route):
        @wraps(route)
        def wrapped(*args, **kwargs):
            if current_app.config.get("AUTH_DISABLED"):
                g.user = {
                    "uid": request.headers.get(
                        "X-Demo-User",
                        "demo-social-worker",
                    ),
                    "role": request.headers.get(
                        "X-Demo-Role",
                        "social_worker",
                    ),
                    "approval": request.headers.get(
                        "X-Demo-Approval",
                        "approved",
                    ),
                }

            else:
                header = request.headers.get("Authorization", "")

                if not header.startswith("Bearer "):
                    return jsonify({
                        "error": "Authentication required",
                    }), 401

                token = header.removeprefix("Bearer ").strip()

                try:
                    g.user = auth.verify_id_token(token)

                except Exception as exc:
                    current_app.logger.warning(
                        "Firebase authentication failed: %s",
                        exc,
                    )

                    return jsonify({
                        "error": "Invalid or expired authentication",
                    }), 401

            role = g.user.get("role")
            approval = g.user.get("approval")

            if allowed_roles and role not in allowed_roles:
                return jsonify({
                    "error": "You do not have access to this action",
                }), 403

            if (
                require_approval
                and role == "social_worker"
                and approval != "approved"
            ):
                return jsonify({
                    "error": "Your social worker account is awaiting admin approval",
                    "approval": approval or "pending",
                }), 403

            return route(*args, **kwargs)

        return wrapped

    return decorator


@auth_bp.post("/auth/set-role")
def set_role():
    data = request.get_json(silent=True) or {}

    id_token = data.get("idToken")
    requested_role = data.get("role")

    if not id_token:
        return jsonify({
            "error": "Missing ID token",
        }), 401

    if requested_role not in SELF_ASSIGNABLE_ROLES:
        return jsonify({
            "error": "Invalid role",
        }), 400

    try:
        decoded = auth.verify_id_token(id_token)

    except Exception as exc:
        current_app.logger.exception(
            "Role assignment authentication failed"
        )

        return jsonify({
            "error": "Invalid or expired authentication",
            "detail": str(exc),
        }), 401

    uid = decoded["uid"]

    if decoded.get("role"):
        return jsonify({
            "role": decoded.get("role"),
            "approval": decoded.get("approval"),
            "alreadyAssigned": True,
        }), 200

    claims = {
        "role": requested_role,
    }

    if requested_role == "social_worker":
        claims["approval"] = "pending"

    auth.set_custom_user_claims(uid, claims)

    return jsonify({
        "role": requested_role,
        "approval": claims.get("approval"),
        "alreadyAssigned": False,
    }), 200

@auth_bp.post("/auth/social-workers/<uid>/approval")
@require_auth(["admin"])
def update_social_worker_approval(uid):
    data = request.get_json(silent=True) or {}

    approval = data.get("approval")

    if approval not in {"approved", "rejected"}:
        return jsonify({
            "error": "Approval must be approved or rejected",
        }), 400

    try:
        user = auth.get_user(uid)

        existing_claims = user.custom_claims or {}

        if existing_claims.get("role") != "social_worker":
            return jsonify({
                "error": "User is not a social worker",
            }), 400

        updated_claims = {
            **existing_claims,
            "approval": approval,
        }

        auth.set_custom_user_claims(
            uid,
            updated_claims,
        )

        return jsonify({
            "uid": uid,
            "role": "social_worker",
            "approval": approval,
        }), 200

    except Exception:
        current_app.logger.exception(
            "Could not update approval for %s",
            uid,
        )

        return jsonify({
            "error": "Could not update approval",
        }), 500

@auth_bp.get("/auth/users")
@require_auth(["admin"])
def list_users():
    result = auth.list_users()

    users = []

    for user in result.users:
        claims = user.custom_claims or {}

        users.append({
            "id": user.uid,
            "name": user.display_name or "",
            "email": user.email or "",
            "role": claims.get("role"),
            "approval": claims.get("approval"),
            "disabled": user.disabled,
        })

    return jsonify(users), 200

@auth_bp.patch("/auth/users/<uid>/status")
@require_auth(["admin"])
def update_user_status(uid):
    data = request.get_json(silent=True) or {}

    disabled = data.get("disabled")

    if not isinstance(disabled, bool):
        return jsonify({
            "error": "disabled must be a boolean"
        }), 400

    auth.update_user(
        uid,
        disabled=disabled,
    )

    return jsonify({
        "uid": uid,
        "disabled": disabled,
    }), 200