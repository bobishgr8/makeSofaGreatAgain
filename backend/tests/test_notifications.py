import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import lifecycle  # noqa: E402
from app.notifications import (  # noqa: E402
    DONOR_MESSAGES,
    SOCIAL_WORKER_MESSAGES,
    compose,
    normalise_phone,
)

ORIGIN = "https://refurbish.example"
ITEM = {
    "id": "item-1",
    "title": "Samsung 8kg Washing Machine",
    "donorId": "donor-1",
    "activeMatch": {"organisation": "Sunrise Charity", "socialWorkerId": "sw-1"},
}


def entry(kind, **fields):
    return {"type": kind, "furnitureId": "item-1", "toUid": "donor-1", **fields}


class ComposeTests(unittest.TestCase):
    def test_donor_match_message_names_the_charity_and_links_the_item(self):
        text = compose(entry("accept_match"), ITEM, True, ORIGIN)
        self.assertIn("Sunrise Charity", text)
        self.assertIn("Samsung 8kg Washing Machine", text)
        self.assertIn(f"{ORIGIN}/donor/furniture/item-1", text)

    def test_social_worker_links_to_their_workspace(self):
        text = compose(entry("connect", toUid="sw-1"), ITEM, False, ORIGIN)
        self.assertIn(f"{ORIGIN}/workspace", text)
        self.assertNotIn("/donor/", text)

    def test_unknown_or_wrong_audience_has_no_message(self):
        self.assertIsNone(compose(entry("connect"), ITEM, True, ORIGIN))
        self.assertIsNone(compose(entry("no_such_event"), ITEM, True, ORIGIN))

    def test_prewritten_text_is_sent_as_is(self):
        self.assertEqual(compose(entry("weekly_summary", text="Hello"), None, False, ORIGIN), "Hello")

    def test_every_lifecycle_notification_has_wording(self):
        """Run every transition as every role allowed to make it, and check each
        person it notifies (other than the actor) gets a message."""
        from datetime import datetime, timedelta, timezone

        now = datetime(2026, 11, 21, 2, 0, tzinfo=timezone.utc)
        users = {
            "donor": {"uid": "donor-1", "role": "donor"},
            "social_worker": {"uid": "sw-1", "role": "social_worker", "approval": "approved"},
            "admin": {"uid": "admin-1", "role": "admin"},
            "system": lifecycle.SYSTEM_USER,
        }
        case = {"id": "case-1", "socialWorkerId": "sw-1", "status": "open", "needs": [{"category": "sofa"}]}
        ctx = {"case": case, "profile": {"organisation": "Sunrise Charity", "whatsapp": "6591234567"}}
        payload = {
            "reason": "Plans changed", "caseId": "case-1", "provider": "Ninja Van",
            "pickupAddress": "1 Road", "deliveryAddress": "2 Road", "deliveryDate": "2026-12-01",
        }
        for (status, action), rule in lifecycle.TRANSITIONS.items():
            if action in ("join_waitlist", "leave_waitlist"):
                continue  # they notify nobody; settle_waitlist's messages are checked below
            match = {
                "caseId": "case-1", "socialWorkerId": "sw-1", "organisation": "Sunrise Charity",
                "connectBy": now - timedelta(hours=1),
                "connectedAt": None if action in ("connect", "lapse_match") else now,
                "logistics": None if action == "propose_logistics" else {"provider": "Ninja Van"},
            }
            item = {"id": "item-1", "donorId": "donor-1", "status": status, "category": "sofa", "title": "Sofa"}
            if status in lifecycle.ACTIVE_MATCH_STATUSES:
                item["activeMatch"] = match
            for role in rule.roles:
                user = users[role]
                with self.subTest(action=action, actor=role):
                    decision = lifecycle.decide(
                        item, action, user, {**payload, "expected_status": status}, now, ctx
                    )
                    for uid in decision.notify_uids:
                        if uid == user["uid"]:
                            continue  # e.g. a donor cancelling their own listing
                        text = compose(entry(action, toUid=uid), item, uid == "donor-1", ORIGIN)
                        self.assertTrue(text, f"{action} by {role} has no message for {uid}")

    def test_waitlist_messages_go_to_the_waiting_social_worker(self):
        for kind in ("waitlist_promoted", "waitlist_closed", "waitlist_expired"):
            text = compose(entry(kind, toUid="sw-2", toRole="social_worker"), ITEM, False, ORIGIN)
            self.assertTrue(text, kind)
            self.assertIn("Samsung 8kg Washing Machine", text)

    def test_templates_only_use_known_fields(self):
        for template in [*DONOR_MESSAGES.values(), *SOCIAL_WORKER_MESSAGES.values()]:
            template.format(title="t", org="o", link="l", thanks="h")


class PhoneTests(unittest.TestCase):
    def test_normalises_to_international_digits(self):
        self.assertEqual(normalise_phone("+65 9123 4567"), "6591234567")
        self.assertEqual(normalise_phone("9123 4567"), "6591234567")
        self.assertEqual(normalise_phone("6591234567"), "6591234567")
        self.assertIsNone(normalise_phone("123"))
        self.assertIsNone(normalise_phone(None))


if __name__ == "__main__":
    unittest.main()
