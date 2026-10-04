"""Route-level tests for the State 1 furniture lifecycle, against the Firestore emulator.

Run with the emulator up (needs Java):
    firebase emulators:start --only firestore
    FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 python -m unittest backend/tests/test_furniture_api.py -v

Skipped when FIRESTORE_EMULATOR_HOST is not set. Auth uses AUTH_DISABLED with the
X-Demo-User / X-Demo-Role headers.
"""

import json
import os
import sys
import unittest
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

EMULATOR = os.getenv("FIRESTORE_EMULATOR_HOST")
PROJECT = "demo-refurbish"


@unittest.skipUnless(EMULATOR, "FIRESTORE_EMULATOR_HOST not set")
class FurnitureApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import firebase_admin
        from firebase_admin import credentials
        from google.auth.credentials import AnonymousCredentials

        class EmulatorCredential(credentials.Base):
            def get_credential(self):
                return AnonymousCredentials()

        if not firebase_admin._apps:
            firebase_admin.initialize_app(EmulatorCredential(), {"projectId": PROJECT})

        from app import create_app
        from app.firebase import get_db

        cls.app = create_app({"AUTH_DISABLED": True, "TESTING": True, "FIREBASE_PROJECT_ID": PROJECT})
        cls.client = cls.app.test_client()
        with cls.app.app_context():
            cls.db = get_db()

    def setUp(self):
        import requests

        requests.delete(
            f"http://{EMULATOR}/emulator/v1/projects/{PROJECT}/databases/(default)/documents",
            timeout=10,
        )

    # ---------- helpers ----------

    def as_user(self, uid, role):
        return {"X-Demo-User": uid, "X-Demo-Role": role}

    def owner(self):
        return self.as_user("donor-1", "donor")

    def create(self, **overrides):
        from app.validation import today_sgt

        body = {
            "title": "Samsung 8kg Washing Machine",
            "category": "storage",
            "condition": "good",
            "conditionNotes": "Works well",
            "dimensionsCm": {"height": 85, "width": 60, "depth": 55},
            "location": {"city": "ReFurbish", "district": "Tampines"},
            "collection": {"floor": 3, "hasLift": True},
            "pickupAddress": "88 Tampines Road",
            "expectedDeliveryDate": (today_sgt() + timedelta(days=10)).isoformat(),
            **overrides,
        }
        response = self.client.post("/api/furniture", json=body, headers=self.owner())
        self.assertEqual(response.status_code, 201, response.get_json())
        return response.get_json()

    def act(self, item_id, action, headers, expected_status, reason=None):
        return self.client.post(
            f"/api/furniture/{item_id}/actions/{action}",
            json={"expected_status": expected_status, "reason": reason},
            headers=headers,
        )

    def history(self, item_id):
        return list(
            self.db.collection("furniture").document(item_id).collection("statusHistory").stream()
        )

    # ---------- create ----------

    def test_create_forces_pending_review(self):
        item = self.create(status="available")
        self.assertEqual(item["status"], "pending_review")
        self.assertEqual(item["donorStage"], "submitted")
        self.assertEqual(item["private"], {"pickupAddress": "88 Tampines Road"})
        self.assertEqual(item["allowedActions"], ["cancel_request", "edit"])
        self.assertEqual(len(self.history(item["id"])), 1)
        stored = self.db.collection("furniture").document(item["id"]).get().to_dict()
        self.assertNotIn("pickupAddress", stored)

    def test_create_rejects_past_delivery_date(self):
        response = self.client.post(
            "/api/furniture",
            json={
                "title": "Chair", "category": "chair", "condition": "good",
                "location": {"district": "Bedok"}, "collection": {"floor": 1},
                "pickupAddress": "1 Bedok Road", "expectedDeliveryDate": "2020-01-01",
            },
            headers=self.owner(),
        )
        self.assertEqual(response.status_code, 400)

    # ---------- reading ----------

    def test_detail_is_tiered(self):
        item = self.create()
        item_id = item["id"]

        self.assertEqual(self.client.get(f"/api/furniture/{item_id}").status_code, 404)
        other = self.client.get(f"/api/furniture/{item_id}", headers=self.as_user("donor-2", "donor"))
        self.assertEqual(other.status_code, 404)
        mine = self.client.get(f"/api/furniture/{item_id}", headers=self.owner())
        self.assertEqual(mine.get_json()["private"]["pickupAddress"], "88 Tampines Road")

        self.act(item_id, "approve", self.as_user("admin-1", "admin"), "pending_review")
        public = self.client.get(f"/api/furniture/{item_id}")
        self.assertEqual(public.status_code, 200)
        self.assertNotIn("88 Tampines Road", public.get_data(as_text=True))
        self.assertNotIn("expectedDeliveryDate", public.get_json())

    def test_public_list_has_no_addresses(self):
        item = self.create()
        self.act(item["id"], "approve", self.as_user("admin-1", "admin"), "pending_review")
        listing = self.client.get("/api/furniture")
        self.assertEqual(len(listing.get_json()), 1)
        self.assertNotIn("88 Tampines Road", listing.get_data(as_text=True))

    def test_mine_counts_by_stage(self):
        first = self.create()
        self.create(title="Table")
        self.act(first["id"], "cancel_request", self.owner(), "pending_review", "Sold it")
        mine = self.client.get("/api/furniture/mine", headers=self.owner()).get_json()
        self.assertEqual(mine["counts"]["submitted"], 1)
        self.assertEqual(mine["counts"]["cancelled"], 1)
        self.assertEqual(len(mine["items"]), 2)
        self.assertTrue(all(i["private"]["pickupAddress"] for i in mine["items"]))

    # ---------- edit ----------

    def test_patch_cannot_change_status(self):
        item = self.create()
        response = self.client.patch(
            f"/api/furniture/{item['id']}", json={"status": "available"}, headers=self.owner()
        )
        self.assertEqual(response.status_code, 400)  # nothing editable in the body
        stored = self.db.collection("furniture").document(item["id"]).get().to_dict()
        self.assertEqual(stored["status"], "pending_review")

    def test_content_edit_on_available_goes_back_to_review(self):
        item = self.create()
        self.act(item["id"], "approve", self.as_user("admin-1", "admin"), "pending_review")
        response = self.client.patch(
            f"/api/furniture/{item['id']}",
            json={"title": "Grey washing machine", "status": "available"},
            headers=self.owner(),
        )
        self.assertEqual(response.get_json()["status"], "pending_review")
        actions = sorted(h.to_dict()["action"] for h in self.history(item["id"]))
        self.assertEqual(actions, ["approve", "create", "edit_resubmit"])

    def test_address_edit_keeps_status(self):
        item = self.create()
        self.act(item["id"], "approve", self.as_user("admin-1", "admin"), "pending_review")
        response = self.client.patch(
            f"/api/furniture/{item['id']}",
            json={"pickupAddress": "1 New Road"},
            headers=self.owner(),
        )
        body = response.get_json()
        self.assertEqual(body["status"], "available")
        self.assertEqual(body["private"]["pickupAddress"], "1 New Road")

    def test_edit_locked_after_match_and_for_others(self):
        item = self.create()
        other = self.client.patch(
            f"/api/furniture/{item['id']}", json={"title": "x"}, headers=self.as_user("donor-2", "donor")
        )
        self.assertEqual(other.status_code, 404)
        self.db.collection("furniture").document(item["id"]).update({"status": "matched"})
        locked = self.client.patch(f"/api/furniture/{item['id']}", json={"title": "x"}, headers=self.owner())
        self.assertEqual(locked.status_code, 409)

    # ---------- actions ----------

    def test_cancel_needs_a_reason_and_the_owner(self):
        item = self.create()
        self.assertEqual(
            self.act(item["id"], "cancel_request", self.owner(), "pending_review").status_code, 400
        )
        self.assertEqual(
            self.act(item["id"], "cancel_request", self.as_user("donor-2", "donor"), "pending_review", "x").status_code,
            404,
        )

    def test_double_cancel_is_safe(self):
        item = self.create()
        first = self.act(item["id"], "cancel_request", self.owner(), "pending_review", "Sold it")
        second = self.act(item["id"], "cancel_request", self.owner(), "pending_review", "Sold it")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.get_json()["status"], "withdrawn")
        self.assertEqual(len(self.history(item["id"])), 2)  # create + one cancel

    def test_stale_screen_conflicts(self):
        item = self.create()
        self.act(item["id"], "cancel_request", self.owner(), "pending_review", "Sold it")
        stale = self.act(item["id"], "approve", self.as_user("admin-1", "admin"), "pending_review")
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(stale.get_json()["currentStatus"], "withdrawn")

    def test_reject_shows_as_cancelled(self):
        item = self.create()
        rejected = self.act(item["id"], "reject", self.as_user("admin-1", "admin"), "pending_review", "Unsafe")
        self.assertEqual(rejected.get_json()["status"], "rejected")
        mine = self.client.get(f"/api/furniture/{item['id']}", headers=self.owner()).get_json()
        self.assertEqual(mine["donorStage"], "cancelled")
        self.assertEqual(mine["cancelReason"], "Unsafe")

    # ---------- expiry ----------

    def test_expiry_withdraws_unmatched_items(self):
        from app import lifecycle
        from app.validation import today_sgt

        soon = self.create(expectedDeliveryDate=(today_sgt() + timedelta(days=2)).isoformat())
        later = self.create()
        for item in (soon, later):
            self.act(item["id"], "approve", self.as_user("admin-1", "admin"), "pending_review")

        expired = lifecycle.expire_stale(self.db, today_sgt())
        self.assertEqual(expired, [soon["id"]])
        stored = self.db.collection("furniture").document(soon["id"]).get().to_dict()
        self.assertEqual(stored["status"], "withdrawn")
        self.assertEqual(stored["cancelReason"], "no_match")
        outbox = [d.to_dict()["type"] for d in self.db.collection("notificationsOutbox").stream()]
        self.assertIn("expire", outbox)

    def test_internal_expire_endpoint_needs_token(self):
        self.app.config["INTERNAL_SCHEDULER_TOKEN"] = "secret"
        try:
            self.assertEqual(self.client.post("/api/internal/expire").status_code, 401)
            ok = self.client.post("/api/internal/expire", headers={"X-Internal-Token": "secret"})
            self.assertEqual(json.loads(ok.data), {"expired": []})
        finally:
            self.app.config["INTERNAL_SCHEDULER_TOKEN"] = None


if __name__ == "__main__":
    unittest.main()
