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

    def act(self, item_id, action, headers, expected_status, reason=None, **body):
        return self.client.post(
            f"/api/furniture/{item_id}/actions/{action}",
            json={"expected_status": expected_status, "reason": reason, **body},
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
            self.assertEqual(json.loads(ok.data), {"expired": [], "lapsed": []})
        finally:
            self.app.config["INTERNAL_SCHEDULER_TOKEN"] = None

    # ---------- State 2: matching ----------

    def admin(self):
        return self.as_user("admin-1", "admin")

    def sw(self, uid="sw-1"):
        return self.as_user(uid, "social_worker")

    def set_profile(self, headers):
        response = self.client.patch(
            "/api/social-workers/me",
            json={"organisation": "Sunrise Charity", "whatsapp": "+65 9123 4567"},
            headers=headers,
        )
        self.assertEqual(response.status_code, 200, response.get_json())

    def create_case(self, headers, **overrides):
        body = {
            "household": {"summary": "Parent with two children"},
            "location": {"city": "ReFurbish", "district": "Tampines"},
            "priority": "standard",
            "needs": [{"category": "storage"}],
            **overrides,
        }
        response = self.client.post("/api/cases", json=body, headers=headers)
        self.assertEqual(response.status_code, 201, response.get_json())
        return response.get_json()

    def available(self, **overrides):
        item = self.create(**overrides)
        self.act(item["id"], "approve", self.admin(), "pending_review")
        return item

    def request_item(self, item_id, case_id, headers):
        return self.client.post(
            f"/api/furniture/{item_id}/actions/accept_match",
            json={"expected_status": "available", "caseId": case_id},
            headers=headers,
        )

    def matched(self):
        """An available item requested by sw-1 for their case."""
        self.set_profile(self.sw())
        case = self.create_case(self.sw())
        item = self.available()
        response = self.request_item(item["id"], case["id"], self.sw())
        self.assertEqual(response.status_code, 200, response.get_json())
        return item, case

    def stored_case(self, case_id):
        return self.db.collection("cases").document(case_id).get().to_dict()

    def suggestions(self, case_id, headers):
        response = self.client.get(f"/api/matches/suggestions?caseId={case_id}", headers=headers)
        self.assertEqual(response.status_code, 200, response.get_json())
        return response.get_json()

    def test_request_sets_item_case_and_history_together(self):
        item, case = self.matched()
        stored = self.db.collection("furniture").document(item["id"]).get().to_dict()
        self.assertEqual(stored["status"], "matched")
        self.assertEqual(stored["activeMatch"]["caseId"], case["id"])
        self.assertEqual(stored["activeMatch"]["socialWorkerId"], "sw-1")
        self.assertEqual(self.stored_case(case["id"])["fulfilment"], {"storage": item["id"]})
        requested = [h.to_dict() for h in self.history(item["id"]) if h.to_dict()["action"] == "accept_match"]
        self.assertEqual(requested[0]["caseId"], case["id"])
        self.assertEqual(self.db.collection("matches").get(), [])

        donor = self.client.get(f"/api/furniture/{item['id']}", headers=self.owner()).get_json()
        self.assertEqual(donor["donorStage"], "matched")
        self.assertEqual(donor["allowedActions"], ["connect", "cancel_donation"])
        self.assertEqual(donor["matchSummary"]["organisation"], "Sunrise Charity")
        self.assertEqual(donor["matchSummary"]["whatsapp"], "6591234567")

    def test_matched_item_is_hidden_from_everyone_else(self):
        item, _ = self.matched()
        self.assertEqual(self.client.get(f"/api/furniture/{item['id']}").status_code, 404)
        self.assertEqual(
            self.client.get(f"/api/furniture/{item['id']}", headers=self.sw("sw-2")).status_code, 404
        )
        self.assertEqual(self.client.get("/api/furniture").get_json(), [])

        mine = self.client.get("/api/matches", headers=self.sw()).get_json()
        self.assertEqual([m["id"] for m in mine], [item["id"]])
        self.assertEqual(mine[0]["private"]["pickupAddress"], "88 Tampines Road")
        self.assertNotIn("whatsapp", mine[0]["matchSummary"])
        self.assertEqual(self.client.get("/api/matches", headers=self.sw("sw-2")).get_json(), [])

    def test_public_list_ignores_the_status_filter(self):
        self.create()
        listing = self.client.get("/api/furniture?status=pending_review")
        self.assertEqual(listing.get_json(), [])

    def test_second_request_conflicts_and_double_tap_is_safe(self):
        item, case = self.matched()
        again = self.request_item(item["id"], case["id"], self.sw())
        self.assertEqual(again.status_code, 200)

        self.set_profile(self.sw("sw-2"))
        other_case = self.create_case(self.sw("sw-2"))
        taken = self.request_item(item["id"], other_case["id"], self.sw("sw-2"))
        self.assertEqual(taken.status_code, 404)  # no longer visible to them
        self.assertNotIn("fulfilment", self.stored_case(other_case["id"]))
        requests = [h for h in self.history(item["id"]) if h.to_dict()["action"] == "accept_match"]
        self.assertEqual(len(requests), 1)

    def test_request_guards(self):
        item = self.available()
        case = self.create_case(self.sw())
        no_profile = self.request_item(item["id"], case["id"], self.sw())
        self.assertEqual(no_profile.status_code, 400)

        self.set_profile(self.sw())
        self.set_profile(self.sw("sw-2"))
        not_mine = self.request_item(item["id"], case["id"], self.sw("sw-2"))
        self.assertEqual(not_mine.status_code, 404)

        pending = {**self.sw(), "X-Demo-Approval": "pending"}
        self.assertEqual(self.request_item(item["id"], case["id"], pending).status_code, 403)

        wrong_need = self.create_case(self.sw(), needs=[{"category": "bed"}])
        self.assertEqual(self.request_item(item["id"], wrong_need["id"], self.sw()).status_code, 400)

        stored = self.db.collection("furniture").document(item["id"]).get().to_dict()
        self.assertEqual(stored["status"], "available")

    def test_one_match_per_need(self):
        _, case = self.matched()
        second = self.available(title="Second shelf")
        response = self.request_item(second["id"], case["id"], self.sw())
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.suggestions(case["id"], self.sw()), [])

    def test_suggestions_are_ranked_and_never_stored(self):
        self.set_profile(self.sw())
        near = self.available(title="Near")
        far = self.available(title="Far", location={"city": "ReFurbish", "district": "Jurong West"})
        self.available(title="Too big", dimensionsCm={"height": 250, "width": 60, "depth": 55})
        self.available(title="Chair", category="chair")
        case = self.create_case(
            self.sw(),
            needs=[{"category": "storage", "maxDimensionsCm": {"width": 100, "depth": 100, "height": 200}}],
        )

        ranked = self.suggestions(case["id"], self.sw())
        self.assertEqual([s["furniture"]["id"] for s in ranked], [near["id"], far["id"]])
        self.assertEqual(ranked[0]["furniture"]["allowedActions"], ["accept_match"])
        self.assertIn("Same neighbourhood", ranked[0]["reasons"])
        self.assertNotIn("88 Tampines Road", json.dumps(ranked))
        self.assertEqual(self.db.collection("matches").get(), [])

        other = self.client.get(f"/api/matches/suggestions?caseId={case['id']}", headers=self.sw("sw-2"))
        self.assertEqual(other.status_code, 404)

    def test_connect_then_find_another_match(self):
        item, case = self.matched()
        early = self.act(item["id"], "rematch", self.owner(), "matched")
        self.assertEqual(early.status_code, 403)

        connected = self.act(item["id"], "connect", self.owner(), "matched")
        self.assertTrue(connected.get_json()["matchSummary"]["connected"])
        self.assertEqual(
            connected.get_json()["allowedActions"],
            ["rematch", "cancel_donation", "arrange_delivery"],
        )
        repeat = self.act(item["id"], "connect", self.owner(), "matched")
        self.assertEqual(repeat.status_code, 200)
        connects = [h for h in self.history(item["id"]) if h.to_dict()["action"] == "connect"]
        self.assertEqual(len(connects), 1)

        back = self.act(item["id"], "rematch", self.owner(), "matched")
        self.assertEqual(back.get_json()["status"], "available")
        self.assertEqual(back.get_json()["donorStage"], "submitted")
        self.assertNotIn("matchSummary", back.get_json())
        self.assertEqual(self.stored_case(case["id"])["fulfilment"], {})
        self.assertEqual(self.suggestions(case["id"], self.sw()), [])
        again = self.request_item(item["id"], case["id"], self.sw())
        self.assertEqual(again.status_code, 400)

    def test_release_returns_the_item_and_expires_it_when_too_late(self):
        item, case = self.matched()
        self.assertEqual(self.act(item["id"], "release_match", self.sw(), "matched").status_code, 400)
        self.db.collection("furniture").document(item["id"]).update(
            {"expectedDeliveryDate": "2020-01-01"}
        )
        released = self.act(item["id"], "release_match", self.sw(), "matched", "Too large")
        self.assertEqual(released.status_code, 200)
        self.assertEqual(self.stored_case(case["id"])["fulfilment"], {})

        donor = self.client.get(f"/api/furniture/{item['id']}", headers=self.owner()).get_json()
        self.assertEqual(donor["status"], "withdrawn")
        self.assertEqual(donor["cancelKind"], "no_match")

    def test_cancel_match_withdraws_and_frees_the_case(self):
        item, case = self.matched()
        cancelled = self.act(item["id"], "cancel_donation", self.owner(), "matched", "Sold it")
        self.assertEqual(cancelled.get_json()["status"], "withdrawn")
        self.assertEqual(cancelled.get_json()["cancelKind"], "donor")
        self.assertEqual(self.stored_case(case["id"])["fulfilment"], {})
        self.assertEqual(self.client.get("/api/matches", headers=self.sw()).get_json(), [])
        told = [
            d.to_dict()["toUid"] for d in self.db.collection("notificationsOutbox").stream()
            if d.to_dict()["type"] == "cancel_donation"
        ]
        self.assertEqual(told, ["sw-1"])

    def test_unanswered_match_lapses_after_five_days(self):
        from datetime import datetime, timezone

        from app import lifecycle

        item, case = self.matched()
        now = datetime.now(timezone.utc)
        self.assertEqual(lifecycle.lapse_overdue(self.db, now), [])
        self.db.collection("furniture").document(item["id"]).update(
            {"activeMatch.connectBy": now - timedelta(hours=1)}
        )
        self.assertEqual(lifecycle.lapse_overdue(self.db, now), [item["id"]])

        donor = self.client.get(f"/api/furniture/{item['id']}", headers=self.owner()).get_json()
        self.assertEqual(donor["status"], "withdrawn")
        self.assertEqual(donor["cancelKind"], "no_connect")
        self.assertEqual(self.stored_case(case["id"])["fulfilment"], {})

    def test_case_is_locked_while_matched(self):
        _, case = self.matched()
        closed = self.client.delete(f"/api/cases/{case['id']}", headers=self.sw())
        self.assertEqual(closed.status_code, 409)
        edited = self.client.patch(
            f"/api/cases/{case['id']}", json={"needs": [{"category": "bed"}]}, headers=self.sw()
        )
        self.assertEqual(edited.status_code, 409)
        forged = self.client.patch(
            f"/api/cases/{case['id']}", json={"fulfilment": {}, "priority": "urgent"}, headers=self.sw()
        )
        self.assertEqual(forged.status_code, 200)
        self.assertTrue(self.stored_case(case["id"])["fulfilment"])
        other = self.client.delete(f"/api/cases/{case['id']}", headers=self.sw("sw-2"))
        self.assertEqual(other.status_code, 403)

    # ---------- States 3 to 5: delivery ----------

    def logistics(self, **overrides):
        from app.validation import today_sgt

        return {
            "provider": "Ninja Van",
            "pickupAddress": "90 Tampines Road",
            "deliveryAddress": "12 Bedok North Ave 4",
            "deliveryDate": (today_sgt() + timedelta(days=7)).isoformat(),
            **overrides,
        }

    def to_deliver(self):
        """A matched item whose donor has connected and started arranging delivery."""
        item, case = self.matched()
        self.act(item["id"], "connect", self.owner(), "matched")
        response = self.act(item["id"], "arrange_delivery", self.owner(), "matched")
        self.assertEqual(response.status_code, 200, response.get_json())
        self.assertEqual(response.get_json()["donorStage"], "to_deliver")
        return item, case

    def in_delivery(self):
        item, case = self.to_deliver()
        self.act(item["id"], "propose_logistics", self.owner(), "to_deliver", **self.logistics())
        response = self.act(item["id"], "confirm_logistics", self.sw(), "to_deliver")
        self.assertEqual(response.status_code, 200, response.get_json())
        return item, case

    def stored_private(self, item_id):
        return (
            self.db.collection("furniture").document(item_id)
            .collection("private").document("contact").get().to_dict()
        )

    def test_arrange_delivery_needs_a_connection(self):
        item, _ = self.matched()
        early = self.act(item["id"], "arrange_delivery", self.owner(), "matched")
        self.assertEqual(early.status_code, 403)

    def test_delivery_from_proposal_to_complete(self):
        item, case = self.to_deliver()
        details = self.logistics()

        early = self.act(item["id"], "confirm_logistics", self.sw(), "to_deliver")
        self.assertEqual(early.status_code, 403)
        bad = self.act(
            item["id"], "propose_logistics", self.owner(), "to_deliver",
            **self.logistics(provider="Grab"),
        )
        self.assertEqual(bad.status_code, 400)

        proposed = self.act(item["id"], "propose_logistics", self.owner(), "to_deliver", **details)
        self.assertEqual(proposed.status_code, 200, proposed.get_json())
        self.assertEqual(proposed.get_json()["status"], "to_deliver")
        self.assertEqual(proposed.get_json()["allowedActions"], ["cancel_donation"])
        self.assertEqual(proposed.get_json()["private"], {
            "pickupAddress": "90 Tampines Road",
            "deliveryAddress": "12 Bedok North Ave 4",
        })
        stored = self.db.collection("furniture").document(item["id"]).get().to_dict()
        self.assertNotIn("deliveryAddress", json.dumps(stored, default=str))
        self.assertNotIn("Bedok", json.dumps(stored, default=str))

        repeat = self.act(item["id"], "propose_logistics", self.owner(), "to_deliver", **details)
        self.assertEqual(repeat.status_code, 200)
        proposals = [
            h for h in self.history(item["id"]) if h.to_dict()["action"] == "propose_logistics"
        ]
        self.assertEqual(len(proposals), 1)

        [seen] = self.client.get("/api/matches", headers=self.sw()).get_json()
        self.assertEqual(seen["matchSummary"]["logistics"]["provider"], "Ninja Van")
        self.assertEqual(seen["matchSummary"]["logistics"]["deliveryDate"], details["deliveryDate"])
        self.assertEqual(seen["private"]["deliveryAddress"], "12 Bedok North Ave 4")
        self.assertEqual(
            seen["allowedActions"], ["confirm_logistics", "rearrange_logistics", "release_match"]
        )

        confirmed = self.act(item["id"], "confirm_logistics", self.sw(), "to_deliver")
        self.assertEqual(confirmed.get_json()["status"], "in_delivery")
        self.assertEqual(
            confirmed.get_json()["allowedActions"], ["complete_delivery", "cancel_delivery"]
        )
        closed = self.client.delete(f"/api/cases/{case['id']}", headers=self.sw())
        self.assertEqual(closed.status_code, 409)

        done = self.act(item["id"], "complete_delivery", self.owner(), "in_delivery")
        self.assertEqual(done.get_json()["status"], "delivered")
        self.assertEqual(done.get_json()["donorStage"], "delivered")
        self.assertEqual(done.get_json()["allowedActions"], [])
        again = self.act(item["id"], "complete_delivery", self.owner(), "in_delivery")
        self.assertEqual(again.status_code, 200)

        self.assertEqual(self.stored_case(case["id"])["fulfilment"], {})
        self.assertEqual(self.stored_case(case["id"])["delivered"], {"storage": item["id"]})
        self.assertIsNone(self.stored_private(item["id"])["deliveryAddress"])
        self.assertEqual(self.stored_private(item["id"])["pickupAddress"], "90 Tampines Road")
        told = [
            d.to_dict()["toUid"] for d in self.db.collection("notificationsOutbox").stream()
            if d.to_dict()["type"] == "complete_delivery"
        ]
        self.assertEqual(told, ["sw-1"])

        [received] = self.client.get("/api/matches", headers=self.sw()).get_json()
        self.assertEqual(received["donorStage"], "delivered")
        mine = self.client.get("/api/furniture/mine", headers=self.owner()).get_json()
        self.assertEqual(mine["counts"]["delivered"], 1)

        # The need is filled for good, and the case is free to be closed.
        self.available()
        self.assertEqual(self.suggestions(case["id"], self.sw()), [])
        closed = self.client.delete(f"/api/cases/{case['id']}", headers=self.sw())
        self.assertEqual(closed.status_code, 204)

    def test_social_worker_can_ask_for_the_details_again(self):
        item, _ = self.to_deliver()
        self.act(item["id"], "propose_logistics", self.owner(), "to_deliver", **self.logistics())
        refused = self.act(item["id"], "rearrange_logistics", self.owner(), "to_deliver")
        self.assertEqual(refused.status_code, 403)

        back = self.act(item["id"], "rearrange_logistics", self.sw(), "to_deliver")
        self.assertEqual(back.get_json()["status"], "to_deliver")
        self.assertNotIn("logistics", back.get_json()["matchSummary"])
        self.assertEqual(back.get_json()["allowedActions"], ["release_match"])

        donor = self.client.get(f"/api/furniture/{item['id']}", headers=self.owner()).get_json()
        self.assertEqual(donor["allowedActions"], ["propose_logistics", "cancel_donation"])
        self.assertEqual(donor["private"]["deliveryAddress"], "12 Bedok North Ave 4")
        changed = self.act(
            item["id"], "propose_logistics", self.owner(), "to_deliver",
            **self.logistics(provider="own"),
        )
        self.assertEqual(changed.get_json()["matchSummary"]["logistics"]["provider"], "own")

    def test_cancel_delivery_returns_the_item_to_the_pool(self):
        item, case = self.in_delivery()
        no_reason = self.act(item["id"], "cancel_delivery", self.sw(), "in_delivery")
        self.assertEqual(no_reason.status_code, 400)
        cancelled = self.act(
            item["id"], "cancel_delivery", self.sw(), "in_delivery", "Van fell through"
        )
        self.assertEqual(cancelled.status_code, 200, cancelled.get_json())

        donor = self.client.get(f"/api/furniture/{item['id']}", headers=self.owner()).get_json()
        self.assertEqual(donor["status"], "available")
        self.assertEqual(donor["donorStage"], "submitted")
        self.assertNotIn("matchSummary", donor)
        self.assertIsNone(self.stored_private(item["id"])["deliveryAddress"])
        self.assertEqual(self.stored_case(case["id"])["fulfilment"], {})
        self.assertEqual(self.client.get("/api/matches", headers=self.sw()).get_json(), [])
        again = self.request_item(item["id"], case["id"], self.sw())
        self.assertEqual(again.status_code, 400)

    def test_leaving_state_3_ends_the_match(self):
        item, case = self.to_deliver()
        self.act(item["id"], "propose_logistics", self.owner(), "to_deliver", **self.logistics())
        cancelled = self.act(item["id"], "cancel_donation", self.owner(), "to_deliver", "Sold it")
        self.assertEqual(cancelled.get_json()["status"], "withdrawn")
        self.assertEqual(cancelled.get_json()["cancelKind"], "donor")
        self.assertIsNone(self.stored_private(item["id"])["deliveryAddress"])
        self.assertEqual(self.stored_case(case["id"])["fulfilment"], {})

        item, case = self.to_deliver()
        released = self.act(item["id"], "release_match", self.sw(), "to_deliver", "Too large")
        self.assertEqual(released.status_code, 200, released.get_json())
        donor = self.client.get(f"/api/furniture/{item['id']}", headers=self.owner()).get_json()
        self.assertEqual(donor["status"], "available")
        self.assertEqual(self.stored_case(case["id"])["fulfilment"], {})

    def test_old_bypass_routes_are_gone(self):
        self.assertEqual(
            self.client.post("/api/matches/generate", json={"caseId": "x"}, headers=self.sw()).status_code, 404
        )
        self.assertIn(
            self.client.patch("/api/matches/x", json={"status": "accepted"}, headers=self.sw()).status_code,
            (404, 405),
        )
        self.assertEqual(self.client.get("/api/donors/me/donor-1", headers=self.sw()).status_code, 404)


if __name__ == "__main__":
    unittest.main()
