import os
import firebase_admin
from firebase_admin import credentials, firestore
from flask import current_app


def get_db():
    """Return the shared Firestore client, initialising Firebase once.

    Initialization order / sources:
    1. If FIREBASE_SERVICE_ACCOUNT (or GOOGLE_APPLICATION_CREDENTIALS) points to a
       service account JSON, use credentials.Certificate(path) to initialize the
       Admin SDK (explicit, recommended for local dev).
    2. Otherwise fall back to application default credentials / platform defaults
       by calling initialize_app(options=...). This covers emulator and GCP cases.
    """
    try:
        app = firebase_admin.get_app()
    except ValueError:
        options = {}
        project_id = current_app.config.get("FIREBASE_PROJECT_ID")
        if project_id:
            options["projectId"] = project_id

        # Prefer an explicit service account path for deterministic local dev.
        service_account = (
            current_app.config.get("FIREBASE_SERVICE_ACCOUNT")
            or os.getenv("FIREBASE_SERVICE_ACCOUNT")
            or os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
        )

        if service_account:
            # If the env var is set but points to a non-existent file, fail fast with a clear error.
            if not os.path.exists(service_account):
                raise RuntimeError(
                    f"Firebase service account file not found at: {service_account}"
                )
            cred = credentials.Certificate(service_account)
            app = firebase_admin.initialize_app(cred, options=options or None)
        else:
            # No explicit credential provided — fall back to default behavior.
            app = firebase_admin.initialize_app(options=options or None)

    return firestore.client(app=app)


def serialise(document):
    data = document.to_dict() or {}
    data["id"] = document.id
    for key, value in list(data.items()):
        if hasattr(value, "isoformat"):
            data[key] = value.isoformat()
    return data
