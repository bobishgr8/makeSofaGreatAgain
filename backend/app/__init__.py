import os

import firebase_admin
from firebase_admin import credentials

from flask import Flask, jsonify
from flask_cors import CORS

from .auth import auth_bp
from .cases import cases_bp
from .donors import donors_bp
from .furniture import furniture_bp
from .matching import matching_bp
from .social_workers import social_workers_bp


def create_app(test_config=None):
    app = Flask(__name__)
    app.config.update(
        FIREBASE_PROJECT_ID=os.getenv("FIREBASE_PROJECT_ID"),
        AUTH_DISABLED=os.getenv("AUTH_DISABLED", "0") == "1",
        WEB_ORIGIN=os.getenv("WEB_ORIGIN", "http://localhost:3000"),
        WHATSAPP_BOT_URL=os.getenv("WHATSAPP_BOT_URL"),
        WHATSAPP_BOT_SECRET=os.getenv("WHATSAPP_BOT_SECRET"),
    )

    if test_config:
        app.config.update(test_config)

    # Initialize Firebase Admin SDK once
    if not firebase_admin._apps:
        cred = credentials.Certificate(
            os.getenv("FIREBASE_SERVICE_ACCOUNT")
        )

        firebase_admin.initialize_app(
            cred,
            {
                "projectId": app.config["FIREBASE_PROJECT_ID"],
            },
        )

    CORS(
        app,
        origins=[app.config["WEB_ORIGIN"]],
        allow_headers=[
            "Content-Type",
            "Authorization",
        ],
    )

    # Auth routes
    app.register_blueprint(auth_bp)

    # Feature routes
    app.register_blueprint(donors_bp)
    app.register_blueprint(social_workers_bp)
    app.register_blueprint(furniture_bp)
    app.register_blueprint(cases_bp)
    app.register_blueprint(matching_bp)

    # Server-side configuration endpoint
    from .config import config_bp

    app.register_blueprint(config_bp)

    @app.get("/api/health")
    def health():
        return {
            "status": "ok",
            "service": "refurbish-api",
        }

    @app.errorhandler(400)
    def bad_request(error):
        return jsonify({
            "error": str(error.description),
        }), 400

    @app.errorhandler(404)
    def not_found(_error):
        return jsonify({
            "error": "Resource not found",
        }), 404

    return app