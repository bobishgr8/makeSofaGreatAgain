import os

from flask import Flask, jsonify
from flask_cors import CORS

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
    )
    if test_config:
        app.config.update(test_config)

    CORS(
        app,
        origins=[os.getenv("WEB_ORIGIN", "http://localhost:3000")],
        allow_headers=["Content-Type", "Authorization"],
    )

    app.register_blueprint(donors_bp)
    app.register_blueprint(social_workers_bp)
    app.register_blueprint(furniture_bp)
    app.register_blueprint(cases_bp)
    app.register_blueprint(matching_bp)
    # Server-side configuration endpoint for UI defaults and authoritative lists
    from .config import config_bp
    app.register_blueprint(config_bp)

    @app.get("/api/health")
    def health():
        return {"status": "ok", "service": "refurbish-api"}

    @app.errorhandler(400)
    def bad_request(error):
        return jsonify({"error": str(error.description)}), 400

    @app.errorhandler(404)
    def not_found(_error):
        return jsonify({"error": "Resource not found"}), 404

    return app
