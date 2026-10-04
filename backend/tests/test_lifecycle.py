import sys
import unittest
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import lifecycle
from app.lifecycle import LifecycleError, TRANSITIONS

NOW = datetime(2024, 9, 12, 2, 0, tzinfo=timezone.utc)
OWNER = {"uid": "donor-1", "role": "donor"}
OTHER_DONOR = {"uid": "donor-2", "role": "donor"}
ADMIN = {"uid": "admin-1", "role": "admin"}
SOCIAL_WORKER = {"uid": "sw-1", "role": "social_worker"}
USERS = [OWNER, OTHER_DONOR, ADMIN, SOCIAL_WORKER]
ACTIONS = sorted({action for _, action in TRANSITIONS})


def item(status="pending_review", **fields):
    return {"id": "item-1", "donorId": OWNER["uid"], "status": status, **fields}


def payload(status, reason="Moving house sooner"):
    return {"expected_status": status, "reason": reason}


class DecideTests(unittest.TestCase):
    def test_every_status_action_role_combination(self):
        for status in lifecycle.STATUSES:
            for action in ACTIONS:
                for user in USERS:
                    with self.subTest(status=status, action=action, user=user["uid"]):
                        rule = TRANSITIONS.get((status, action))
                        party = lifecycle.is_party(user, item(status))
                        allowed = party and rule is not None and user["role"] in rule.roles
                        try:
                            to, updates, _ = lifecycle.decide(
                                item(status), action, user, payload(status), NOW
                            )
                        except LifecycleError as error:
                            self.assertFalse(allowed)
                            self.assertEqual(error.status_code, 403 if party else 404)
                        else:
                            self.assertTrue(allowed)
                            self.assertEqual(to, rule.to)
                            self.assertEqual(updates["status"], rule.to)
                            self.assertEqual(updates["statusChangedAt"], NOW)

    def test_cancel_records_reason_and_actor(self):
        _, updates, _ = lifecycle.decide(
            item("available"), "cancel_request", OWNER, payload("available", "  Sold it  "), NOW
        )
        self.assertEqual(updates["status"], "withdrawn")
        self.assertEqual(updates["cancelReason"], "Sold it")
        self.assertEqual(updates["cancelledBy"], OWNER["uid"])

    def test_reason_required(self):
        for reason in (None, "", "   "):
            with self.assertRaises(LifecycleError) as caught:
                lifecycle.decide(
                    item(), "cancel_request", OWNER, payload("pending_review", reason), NOW
                )
            self.assertEqual(caught.exception.status_code, 400)

    def test_reason_too_long(self):
        with self.assertRaises(LifecycleError) as caught:
            lifecycle.decide(
                item(), "cancel_request", OWNER, payload("pending_review", "x" * 501), NOW
            )
        self.assertEqual(caught.exception.status_code, 400)

    def test_stale_expected_status_conflicts(self):
        with self.assertRaises(LifecycleError) as caught:
            lifecycle.decide(item("withdrawn"), "cancel_request", OWNER, payload("available"), NOW)
        self.assertEqual(caught.exception.status_code, 409)
        self.assertEqual(caught.exception.current_status, "withdrawn")

    def test_missing_expected_status(self):
        with self.assertRaises(LifecycleError) as caught:
            lifecycle.decide(item(), "approve", ADMIN, {}, NOW)
        self.assertEqual(caught.exception.status_code, 400)

    def test_missing_item_is_not_found(self):
        with self.assertRaises(LifecycleError) as caught:
            lifecycle.decide(None, "approve", ADMIN, payload("pending_review"), NOW)
        self.assertEqual(caught.exception.status_code, 404)


class AllowedActionsTests(unittest.TestCase):
    def test_owner_in_submitted_can_cancel_and_edit(self):
        for status in ("pending_review", "available"):
            self.assertEqual(
                lifecycle.allowed_actions(item(status), OWNER), ["cancel_request", "edit"]
            )

    def test_admin_review_actions(self):
        self.assertEqual(
            lifecycle.allowed_actions(item("pending_review"), ADMIN), ["approve", "reject"]
        )
        self.assertEqual(
            lifecycle.allowed_actions(item("available"), ADMIN), ["flag_for_review"]
        )

    def test_nothing_for_non_parties_or_after_cancel(self):
        self.assertEqual(lifecycle.allowed_actions(item(), OTHER_DONOR), [])
        self.assertEqual(lifecycle.allowed_actions(item(), SOCIAL_WORKER), [])
        self.assertEqual(lifecycle.allowed_actions(item(), None), [])
        self.assertEqual(lifecycle.allowed_actions(item("withdrawn"), OWNER), [])
        self.assertEqual(lifecycle.allowed_actions(item("matched"), OWNER), [])


class EditTests(unittest.TestCase):
    def test_content_edit_on_available_goes_back_to_review(self):
        updates, history = lifecycle.plan_edit(
            item("available", title="Sofa"), OWNER, {"title": "Grey sofa"}, NOW
        )
        self.assertEqual(updates["status"], "pending_review")
        self.assertEqual(history["action"], "edit_resubmit")

    def test_unchanged_content_or_date_edit_keeps_status(self):
        for changes in ({"title": "Sofa"}, {"expectedDeliveryDate": "2024-09-20"}):
            updates, history = lifecycle.plan_edit(
                item("available", title="Sofa"), OWNER, changes, NOW
            )
            self.assertNotIn("status", updates)
            self.assertIsNone(history)

    def test_edit_while_pending_review_keeps_status(self):
        updates, history = lifecycle.plan_edit(item(), OWNER, {"title": "New"}, NOW)
        self.assertNotIn("status", updates)
        self.assertIsNone(history)

    def test_edit_locked_after_match(self):
        with self.assertRaises(LifecycleError) as caught:
            lifecycle.plan_edit(item("matched"), OWNER, {"title": "New"}, NOW)
        self.assertEqual(caught.exception.status_code, 409)

    def test_only_owner_can_edit(self):
        for user in (OTHER_DONOR, ADMIN, SOCIAL_WORKER):
            with self.assertRaises(LifecycleError) as caught:
                lifecycle.plan_edit(item(), user, {"title": "New"}, NOW)
            self.assertEqual(caught.exception.status_code, 404)


class ViewTests(unittest.TestCase):
    def test_party_sees_private_fields(self):
        result = lifecycle.view(
            item(expectedDeliveryDate="2024-09-18", cancelReason=None, createdAt=NOW),
            OWNER,
            {"pickupAddress": "88 Tampines Road"},
        )
        self.assertEqual(result["private"], {"pickupAddress": "88 Tampines Road"})
        self.assertEqual(result["expectedDeliveryDate"], "2024-09-18")
        self.assertEqual(result["donorStage"], "submitted")
        self.assertEqual(result["submittedAt"], NOW.isoformat())

    def test_non_party_sees_public_fields_only(self):
        for user in (None, OTHER_DONOR, SOCIAL_WORKER):
            result = lifecycle.view(
                item("available", expectedDeliveryDate="2024-09-18", cancelReason="x"),
                user,
                {"pickupAddress": "88 Tampines Road"},
            )
            self.assertNotIn("private", result)
            self.assertNotIn("expectedDeliveryDate", result)
            self.assertNotIn("cancelReason", result)
            self.assertEqual(result["allowedActions"], [])

    def test_stage_mapping(self):
        self.assertEqual(lifecycle.donor_stage(item("rejected")), "cancelled")
        self.assertEqual(lifecycle.donor_stage(item("withdrawn")), "cancelled")
        self.assertEqual(lifecycle.donor_stage(item("collected")), "delivered")
        self.assertEqual(set(lifecycle.DONOR_STAGE), set(lifecycle.STATUSES))


class ExpiryTests(unittest.TestCase):
    def test_expires_three_days_before_delivery(self):
        listing = item("available", expectedDeliveryDate="2024-09-18")
        self.assertFalse(lifecycle.is_expired(listing, date(2024, 9, 14)))
        self.assertTrue(lifecycle.is_expired(listing, date(2024, 9, 15)))
        self.assertTrue(lifecycle.is_expired(listing, date(2024, 9, 16)))

    def test_only_available_items_with_a_date_expire(self):
        today = date(2024, 9, 20)
        self.assertFalse(lifecycle.is_expired(item("pending_review", expectedDeliveryDate="2024-09-18"), today))
        self.assertFalse(lifecycle.is_expired(item("available"), today))
        self.assertFalse(lifecycle.is_expired(item("available", expectedDeliveryDate="soon"), today))

    def test_system_expiry_withdraws_with_no_match_reason(self):
        _, updates, _ = lifecycle.decide(
            item("available"),
            "expire",
            lifecycle.SYSTEM_USER,
            {"expected_status": "available", "reason": lifecycle.NO_MATCH_REASON},
            NOW,
        )
        self.assertEqual(updates["status"], "withdrawn")
        self.assertEqual(updates["cancelReason"], "no_match")
        self.assertEqual(updates["cancelledBy"], "system")


if __name__ == "__main__":
    unittest.main()
