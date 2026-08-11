import firebase_admin
from firebase_admin import firestore
from flask import current_app


def get_db():
    """Return the shared Firestore client, initialising Firebase once."""
    try:
        app = firebase_admin.get_app()
    except ValueError:
        options = {}
        project_id = current_app.config.get("FIREBASE_PROJECT_ID")
        if project_id:
            options["projectId"] = project_id
        app = firebase_admin.initialize_app(options=options)
    return firestore.client(app=app)


def serialise(document):
    data = document.to_dict() or {}
    data["id"] = document.id
    for key, value in list(data.items()):
        if hasattr(value, "isoformat"):
            data[key] = value.isoformat()
    return data
