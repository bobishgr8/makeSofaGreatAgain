import sys
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import lifecycle
from app.lifecycle import LifecycleError, TRANSITIONS

NOW = datetime(2024, 9, 12, 2, 0, tzinfo=timezone.utc)
OWNER = {"uid": "donor-1", "role": "donor"}
OTHER_DONOR = {"uid": "donor-2", "role": "donor"}
ADMIN = {"uid": "admin-1", "role": "admin"}
SOCIAL_WORKER = {"uid": "sw-1", "role": "social_worker", "approval": "approved"}
OTHER_SOCIAL_WORKER = {"uid": "sw-2", "role": "social_worker", "approval": "approved"}
USERS = [OWNER, OTHER_DONOR, ADMIN, SOCIAL_WORKER, OTHER_SOCIAL_WORKER, lifecycle.SYSTEM_USER]
ACTIONS = sorted({action for _, action in TRANSITIONS})

PROFILE = {"organisation": "Sunrise Charity", "whatsapp": "6591234567"}
MATCH_STATUSES = (*lifecycle.ACTIVE_MATCH_STATUSES, "delivered")


def case(**fields):
    return {
        "id": "case-1",
        "socialWorkerId": SOCIAL_WORKER["uid"],
        "status": "open",
        "needs": [{"category": "sofa"}],
        "location": {"district": "Tampines"},
        **fields,
    }


def match(connected=False, **fields):
    return {
        "caseId": "case-1",
        "socialWorkerId": SOCIAL_WORKER["uid"],
        "organisation": "Sunrise Charity",
        "matchedAt": NOW - timedelta(days=1),
        "connectBy": NOW + timedelta(days=4),
        "connectedAt": NOW - timedelta(hours=1) if connected else None,
        **fields,
    }


def item(status="pending_review", **fields):
    base = {
        "id": "item-1",
        "donorId": OWNER["uid"],
        "status": status,
        "category": "sofa",
        "expectedDeliveryDate": "2024-10-30",
    }
    if status in MATCH_STATUSES:
        base["activeMatch"] = match()
    return {**base, **fields}


LOGISTICS = {
    "provider": "Ninja Van",
    "pickupAddress": "88 Tampines Road",
    "deliveryAddress": "12 Bedok North Ave 4",
    "deliveryDate": "2024-09-20",
}
PROPOSAL = {"provider": "Ninja Van", "deliveryDate": "2024-09-20", "proposedAt": NOW}


def delivering(status="to_deliver", proposed=False, **fields):
    """An item past the match: connected, and with the donor's proposal if asked."""
    logistics = PROPOSAL if proposed else None
    return item(status, activeMatch=match(connected=True, logistics=logistics), **fields)


def ctx(**fields):
    return {"case": case(), "profile": PROFILE, **fields}


def payload(status, reason="Moving house sooner", **fields):
    return {"expected_status": status, "reason": reason, **fields}


def accept(listing=None, user=SOCIAL_WORKER, context=None):
    return lifecycle.decide(
        listing or item("available"), "accept_match", user, payload("available"), NOW,
        ctx() if context is None else context,
    )


class DecideTests(unittest.TestCase):
    def test_every_status_action_role_combination(self):
        """With a valid case and profile, the table and the item-only rules decide everything."""
        for status in lifecycle.STATUSES:
            for action in ACTIONS:
                for user in USERS:
                    with self.subTest(status=status, action=action, user=user["uid"]):
                        listing = item(status)
                        rule = TRANSITIONS.get((status, action))
                        may_act = lifecycle.is_party(user, listing) or (
                            action in lifecycle.OPEN_ACTIONS
                            and user["role"] == "social_worker"
                            and status == "available"
                        )
                        in_table = rule is not None and user["role"] in rule.roles
                        # rematch and arrange_delivery need a connection, a
                        # lapse needs to be overdue, and confirm and rearrange
                        # need a proposal; the fixture has none of these.
                        guarded = action in (
                            "rematch", "lapse_match", "arrange_delivery",
                            "confirm_logistics", "rearrange_logistics",
                        )
                        try:
                            decision = lifecycle.decide(
                                listing, action, user, payload(status, **LOGISTICS), NOW,
                                ctx(case=case(socialWorkerId=user["uid"])),
                            )
                        except LifecycleError as error:
                            self.assertFalse(may_act and in_table and not guarded)
                            self.assertEqual(error.status_code, 403 if may_act else 404)
                        else:
                            self.assertTrue(may_act and in_table and not guarded)
                            self.assertEqual(decision.to, rule.to)
                            if rule.to != status:
                                self.assertEqual(decision.item_updates["status"], rule.to)
                                self.assertEqual(decision.item_updates["statusChangedAt"], NOW)

    def test_cancel_records_reason_and_actor(self):
        decision = lifecycle.decide(
            item("available"), "cancel_request", OWNER, payload("available", "  Sold it  "), NOW
        )
        self.assertEqual(decision.item_updates["status"], "withdrawn")
        self.assertEqual(decision.item_updates["cancelReason"], "Sold it")
        self.assertEqual(decision.item_updates["cancelledBy"], OWNER["uid"])
        self.assertEqual(decision.notify_uids, [OWNER["uid"]])

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


class AcceptMatchTests(unittest.TestCase):
    def assert_refused(self, status_code, **kwargs):
        with self.assertRaises(LifecycleError) as caught:
            accept(**kwargs)
        self.assertEqual(caught.exception.status_code, status_code)

    def test_request_holds_the_item_and_the_case_slot(self):
        decision = accept()
        active = decision.item_updates["activeMatch"]
        self.assertEqual(decision.to, "matched")
        self.assertEqual(active["caseId"], "case-1")
        self.assertEqual(active["socialWorkerId"], SOCIAL_WORKER["uid"])
        self.assertEqual(active["organisation"], "Sunrise Charity")
        self.assertEqual(active["connectBy"], NOW + timedelta(days=5))
        self.assertIsNone(active["connectedAt"])
        self.assertEqual(decision.case_updates, {"fulfilment": {"sofa": "item-1"}})
        self.assertEqual(decision.notify_uids, [OWNER["uid"]])
        self.assertEqual(decision.history_extra, {"caseId": "case-1"})

    def test_unreviewed_items_stay_hidden_from_social_workers(self):
        with self.assertRaises(LifecycleError) as caught:
            lifecycle.decide(
                item("pending_review"), "accept_match", SOCIAL_WORKER,
                payload("pending_review"), NOW, ctx(),
            )
        self.assertEqual(caught.exception.status_code, 404)

    def test_needs_an_approved_social_worker(self):
        self.assert_refused(403, user={**SOCIAL_WORKER, "approval": "pending"})

    def test_cannot_request_own_donation(self):
        self.assert_refused(403, listing=item("available", donorId=SOCIAL_WORKER["uid"]))

    def test_case_must_exist_and_belong_to_the_caller(self):
        self.assert_refused(404, context={"profile": PROFILE})
        self.assert_refused(404, context=ctx(case=case(socialWorkerId="sw-2")))

    def test_profile_must_be_complete(self):
        self.assert_refused(400, context=ctx(profile={"organisation": "Sunrise Charity"}))
        self.assert_refused(400, context=ctx(profile={}))

    def test_ineligible_items_are_refused(self):
        self.assert_refused(400, context=ctx(case=case(status="closed")))
        self.assert_refused(400, context=ctx(case=case(needs=[{"category": "bed"}])))
        self.assert_refused(400, context=ctx(case=case(fulfilment={"sofa": "item-9"})))
        self.assert_refused(400, listing=item("available", declinedCaseIds=["case-1"]))
        self.assert_refused(400, listing=item("available", expectedDeliveryDate="2024-09-14"))
        self.assert_refused(
            400,
            listing=item("available", dimensionsCm={"width": 200, "depth": 90, "height": 80}),
            context=ctx(case=case(needs=[{
                "category": "sofa",
                "maxDimensionsCm": {"width": 150, "depth": 100, "height": 100},
            }])),
        )

    def test_ineligible_reason_is_none_for_a_good_pair(self):
        self.assertIsNone(lifecycle.ineligible_reason(item("available"), case(), date(2024, 9, 12)))


class MatchedTests(unittest.TestCase):
    def decide(self, action, user, listing=None, context=None, now=NOW, reason="Changed plans"):
        return lifecycle.decide(
            listing or item("matched"), action, user, payload("matched", reason), now,
            ctx(case=case(fulfilment={"sofa": "item-1"})) if context is None else context,
        )

    def test_connect_keeps_the_status_and_tells_the_social_worker(self):
        decision = self.decide("connect", OWNER)
        self.assertEqual(decision.to, "matched")
        self.assertNotIn("status", decision.item_updates)
        self.assertEqual(decision.item_updates["activeMatch"]["connectedAt"], NOW)
        self.assertEqual(decision.item_updates["activeMatch"]["caseId"], "case-1")
        self.assertIsNone(decision.case_updates)
        self.assertEqual(decision.notify_uids, [SOCIAL_WORKER["uid"]])

    def test_connect_twice_conflicts(self):
        with self.assertRaises(LifecycleError) as caught:
            self.decide("connect", OWNER, item("matched", activeMatch=match(connected=True)))
        self.assertEqual(caught.exception.status_code, 409)

    def test_rematch_only_after_connecting(self):
        with self.assertRaises(LifecycleError) as caught:
            self.decide("rematch", OWNER)
        self.assertEqual(caught.exception.status_code, 403)

    def test_rematch_returns_the_item_to_the_pool(self):
        decision = self.decide(
            "rematch", OWNER, item("matched", activeMatch=match(connected=True))
        )
        self.assertEqual(decision.to, "available")
        self.assertIsNone(decision.item_updates["activeMatch"])
        self.assertEqual(decision.item_updates["declinedCaseIds"], ["case-1"])
        self.assertEqual(decision.case_updates, {"fulfilment": {}})
        self.assertEqual(decision.notify_uids, [SOCIAL_WORKER["uid"]])

    def test_cancel_donation_withdraws_and_frees_the_case(self):
        decision = self.decide("cancel_donation", OWNER, reason="Sold it")
        self.assertEqual(decision.to, "withdrawn")
        self.assertEqual(decision.item_updates["cancelReason"], "Sold it")
        self.assertIsNone(decision.item_updates["activeMatch"])
        self.assertNotIn("declinedCaseIds", decision.item_updates)
        self.assertEqual(decision.case_updates, {"fulfilment": {}})

    def test_release_needs_a_reason_and_the_matched_social_worker(self):
        with self.assertRaises(LifecycleError) as caught:
            self.decide("release_match", SOCIAL_WORKER, reason="")
        self.assertEqual(caught.exception.status_code, 400)
        with self.assertRaises(LifecycleError) as caught:
            self.decide("release_match", OTHER_SOCIAL_WORKER)
        self.assertEqual(caught.exception.status_code, 404)

        decision = self.decide("release_match", SOCIAL_WORKER, reason="Too large")
        self.assertEqual(decision.to, "available")
        self.assertEqual(decision.item_updates["declinedCaseIds"], ["case-1"])
        self.assertEqual(decision.notify_uids, [OWNER["uid"]])

    def test_only_this_items_slot_is_freed(self):
        context = ctx(case=case(fulfilment={"sofa": "item-1", "bed": "item-7"}))
        decision = self.decide("release_match", ADMIN, context=context)
        self.assertEqual(decision.case_updates, {"fulfilment": {"bed": "item-7"}})
        self.assertEqual(decision.notify_uids, [OWNER["uid"], SOCIAL_WORKER["uid"]])

    def test_lapse_withdraws_only_overdue_unconnected_matches(self):
        late = NOW + timedelta(days=5)
        lapse = {"expected_status": "matched", "reason": lifecycle.NO_CONNECT_REASON}
        context = ctx(case=case(fulfilment={"sofa": "item-1"}))

        for listing, now in (
            (item("matched"), NOW),
            (item("matched", activeMatch=match(connected=True)), late),
        ):
            with self.assertRaises(LifecycleError) as caught:
                lifecycle.decide(listing, "lapse_match", lifecycle.SYSTEM_USER, lapse, now, context)
            self.assertEqual(caught.exception.status_code, 403)

        decision = lifecycle.decide(
            item("matched"), "lapse_match", lifecycle.SYSTEM_USER, lapse, late, context
        )
        self.assertEqual(decision.to, "withdrawn")
        self.assertEqual(decision.item_updates["cancelReason"], "no_connect")
        self.assertEqual(decision.item_updates["cancelledBy"], "system")
        self.assertEqual(decision.notify_uids, [OWNER["uid"], SOCIAL_WORKER["uid"]])


class DeliveryTests(unittest.TestCase):
    def decide(self, action, user, listing, reason="Changed plans", **fields):
        return lifecycle.decide(
            listing, action, user, payload(listing["status"], reason, **fields), NOW,
            ctx(case=case(fulfilment={"sofa": "item-1"})),
        )

    def assert_refused(self, status_code, action, user, listing, **fields):
        with self.assertRaises(LifecycleError) as caught:
            self.decide(action, user, listing, **fields)
        self.assertEqual(caught.exception.status_code, status_code)

    def test_arrange_delivery_needs_a_connection(self):
        self.assert_refused(403, "arrange_delivery", OWNER, item("matched"))
        connected = item("matched", activeMatch=match(connected=True))
        decision = self.decide("arrange_delivery", OWNER, connected)
        self.assertEqual(decision.to, "to_deliver")
        self.assertEqual(decision.notify_uids, [SOCIAL_WORKER["uid"]])
        self.assertIsNone(decision.case_updates)

    def test_proposal_keeps_the_status_and_the_addresses_off_the_item(self):
        decision = self.decide("propose_logistics", OWNER, delivering(), **LOGISTICS)
        self.assertEqual(decision.to, "to_deliver")
        self.assertNotIn("status", decision.item_updates)
        self.assertEqual(decision.item_updates["activeMatch"]["logistics"], PROPOSAL)
        self.assertEqual(decision.item_updates["activeMatch"]["caseId"], "case-1")
        self.assertEqual(decision.private_updates, {
            "pickupAddress": "88 Tampines Road",
            "deliveryAddress": "12 Bedok North Ave 4",
        })
        self.assertEqual(decision.notify_uids, [SOCIAL_WORKER["uid"]])

    def test_proposal_is_checked(self):
        for bad in (
            {"provider": "Grab"},
            {"provider": None},
            {"pickupAddress": "  "},
            {"deliveryAddress": None},
            {"deliveryAddress": "x" * 201},
            {"deliveryDate": "2024-09-11"},
            {"deliveryDate": "soon"},
            {"deliveryDate": None},
        ):
            with self.subTest(bad=bad):
                self.assert_refused(
                    400, "propose_logistics", OWNER, delivering(), **{**LOGISTICS, **bad}
                )
        self.assert_refused(
            409, "propose_logistics", OWNER, delivering(proposed=True), **LOGISTICS
        )
        self.assert_refused(403, "propose_logistics", SOCIAL_WORKER, delivering(), **LOGISTICS)

    def test_donor_can_arrange_their_own_transport(self):
        decision = self.decide(
            "propose_logistics", OWNER, delivering(),
            **{**LOGISTICS, "provider": lifecycle.OWN_LOGISTICS},
        )
        self.assertEqual(decision.item_updates["activeMatch"]["logistics"]["provider"], "own")

    def test_every_priced_provider_can_be_chosen(self):
        from app.config import LOGISTICS_ESTIMATES

        self.assertEqual(
            [estimate["provider"] for estimate in LOGISTICS_ESTIMATES] + ["own"],
            list(lifecycle.LOGISTICS_PROVIDERS),
        )

    def test_confirm_and_rearrange_need_a_proposal(self):
        for action in ("confirm_logistics", "rearrange_logistics"):
            self.assert_refused(403, action, SOCIAL_WORKER, delivering())
            self.assert_refused(403, action, OWNER, delivering(proposed=True))

    def test_confirm_starts_the_delivery(self):
        decision = self.decide("confirm_logistics", SOCIAL_WORKER, delivering(proposed=True))
        self.assertEqual(decision.to, "in_delivery")
        self.assertEqual(
            decision.item_updates["activeMatch"]["logistics"], {**PROPOSAL, "confirmedAt": NOW}
        )
        self.assertEqual(decision.notify_uids, [OWNER["uid"]])
        self.assertIsNone(decision.private_updates)

    def test_rearrange_asks_the_donor_again(self):
        decision = self.decide("rearrange_logistics", SOCIAL_WORKER, delivering(proposed=True))
        self.assertEqual(decision.to, "to_deliver")
        self.assertIsNone(decision.item_updates["activeMatch"]["logistics"])
        self.assertIsNotNone(decision.item_updates["activeMatch"]["connectedAt"])
        self.assertEqual(decision.notify_uids, [OWNER["uid"]])

    def test_either_side_can_complete_the_delivery(self):
        for user, other in ((OWNER, SOCIAL_WORKER), (SOCIAL_WORKER, OWNER)):
            decision = self.decide("complete_delivery", user, delivering("in_delivery", True))
            self.assertEqual(decision.to, "delivered")
            self.assertEqual(decision.item_updates["activeMatch"]["deliveredAt"], NOW)
            self.assertEqual(decision.item_updates["activeMatch"]["caseId"], "case-1")
            self.assertEqual(
                decision.case_updates, {"fulfilment": {}, "delivered": {"sofa": "item-1"}}
            )
            self.assertEqual(decision.private_updates, {"deliveryAddress": None})
            self.assertEqual(decision.notify_uids, [other["uid"]])

    def test_a_delivered_need_is_not_matched_again(self):
        reason = lifecycle.ineligible_reason(
            item("available"), case(delivered={"sofa": "item-9"}), date(2024, 9, 12)
        )
        self.assertEqual(reason, "This case already has a match for this need")

    def test_cancel_delivery_returns_the_item_to_the_pool(self):
        listing = delivering("in_delivery", True)
        self.assert_refused(400, "cancel_delivery", OWNER, listing, reason="")
        for user in (OWNER, SOCIAL_WORKER):
            decision = self.decide("cancel_delivery", user, listing, reason="Van fell through")
            self.assertEqual(decision.to, "available")
            self.assertIsNone(decision.item_updates["activeMatch"])
            self.assertEqual(decision.item_updates["declinedCaseIds"], ["case-1"])
            self.assertEqual(decision.case_updates, {"fulfilment": {}})
            self.assertEqual(decision.private_updates, {"deliveryAddress": None})

    def test_leaving_state_3_clears_the_delivery_address(self):
        cancelled = self.decide("cancel_donation", OWNER, delivering(proposed=True), "Sold it")
        self.assertEqual(cancelled.to, "withdrawn")
        self.assertEqual(cancelled.private_updates, {"deliveryAddress": None})
        released = self.decide("release_match", SOCIAL_WORKER, delivering(), "Too large")
        self.assertEqual(released.to, "available")
        self.assertEqual(released.private_updates, {"deliveryAddress": None})
        # A match that ends before State 3 has no delivery address to clear.
        early = self.decide("release_match", SOCIAL_WORKER, item("matched"), "Too large")
        self.assertIsNone(early.private_updates)

    def test_actions_offered_at_each_step(self):
        offered = lifecycle.allowed_actions
        self.assertEqual(offered(delivering(), OWNER), ["propose_logistics", "cancel_donation"])
        self.assertEqual(offered(delivering(), SOCIAL_WORKER), ["release_match"])
        self.assertEqual(offered(delivering(proposed=True), OWNER), ["cancel_donation"])
        self.assertEqual(
            offered(delivering(proposed=True), SOCIAL_WORKER),
            ["confirm_logistics", "rearrange_logistics", "release_match"],
        )
        for user in (OWNER, SOCIAL_WORKER):
            self.assertEqual(
                offered(delivering("in_delivery", True), user),
                ["complete_delivery", "cancel_delivery"],
            )
            self.assertEqual(offered(delivering("delivered", True), user), [])
        self.assertEqual(offered(delivering("in_delivery", True), OTHER_SOCIAL_WORKER), [])

    def test_both_sides_see_the_proposal_and_the_stage(self):
        private = {"pickupAddress": "88 Tampines Road", "deliveryAddress": "12 Bedok North Ave 4"}
        for user in (OWNER, SOCIAL_WORKER):
            result = lifecycle.view(delivering(proposed=True), user, private, PROFILE, NOW)
            self.assertEqual(result["donorStage"], "to_deliver")
            self.assertEqual(result["private"], private)
            self.assertEqual(result["matchSummary"]["logistics"], {
                "provider": "Ninja Van",
                "deliveryDate": "2024-09-20",
                "proposedAt": NOW.isoformat(),
            })
        self.assertNotIn("logistics", lifecycle.view(delivering(), OWNER)["matchSummary"])
        self.assertEqual(lifecycle.view(delivering("in_delivery", True), OWNER)["donorStage"], "in_delivery")
        self.assertEqual(lifecycle.view(delivering("delivered", True), OWNER)["donorStage"], "delivered")
        stranger = lifecycle.view(delivering(proposed=True), OTHER_DONOR, private, PROFILE, NOW)
        self.assertNotIn("matchSummary", stranger)
        self.assertNotIn("private", stranger)


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
        self.assertEqual(lifecycle.allowed_actions(item("matched"), ADMIN), ["release_match"])

    def test_nothing_for_non_parties_or_after_cancel(self):
        self.assertEqual(lifecycle.allowed_actions(item(), OTHER_DONOR), [])
        self.assertEqual(lifecycle.allowed_actions(item(), SOCIAL_WORKER), [])
        self.assertEqual(lifecycle.allowed_actions(item(), None), [])
        self.assertEqual(lifecycle.allowed_actions(item("withdrawn"), OWNER), [])
        self.assertEqual(lifecycle.allowed_actions(item("matched"), OTHER_SOCIAL_WORKER), [])

    def test_social_worker_can_request_an_available_item(self):
        self.assertEqual(
            lifecycle.allowed_actions(item("available"), SOCIAL_WORKER), ["accept_match"]
        )
        pending = {**SOCIAL_WORKER, "approval": "pending"}
        self.assertEqual(lifecycle.allowed_actions(item("available"), pending), [])

    def test_matched_actions_follow_the_connection(self):
        self.assertEqual(
            lifecycle.allowed_actions(item("matched"), OWNER), ["connect", "cancel_donation"]
        )
        connected = item("matched", activeMatch=match(connected=True))
        self.assertEqual(
            lifecycle.allowed_actions(connected, OWNER),
            ["rematch", "cancel_donation", "arrange_delivery"],
        )
        self.assertEqual(lifecycle.allowed_actions(connected, SOCIAL_WORKER), ["release_match"])


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
        self.assertNotIn("matchSummary", result)

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
            self.assertNotIn("activeMatch", result)

    def test_match_is_hidden_from_non_parties(self):
        for user in (None, OTHER_DONOR, OTHER_SOCIAL_WORKER):
            result = lifecycle.view(item("matched"), user, {"pickupAddress": "x"}, PROFILE, NOW)
            self.assertNotIn("matchSummary", result)
            self.assertNotIn("private", result)
            self.assertNotIn("activeMatch", result)
            self.assertNotIn("declinedCaseIds", result)

    def test_donor_sees_who_to_connect_with(self):
        result = lifecycle.view(item("matched"), OWNER, {"pickupAddress": "x"}, PROFILE, NOW)
        summary = result["matchSummary"]
        self.assertEqual(result["donorStage"], "matched")
        self.assertEqual(summary["organisation"], "Sunrise Charity")
        self.assertEqual(summary["whatsapp"], "6591234567")
        self.assertEqual(summary["connectBy"], (NOW + timedelta(days=4)).isoformat())
        self.assertFalse(summary["connected"])
        self.assertFalse(summary["overdue"])
        self.assertNotIn("caseId", summary)
        self.assertNotIn("socialWorkerId", summary)

    def test_matched_social_worker_sees_the_case_and_the_address(self):
        result = lifecycle.view(
            item("matched"), SOCIAL_WORKER, {"pickupAddress": "88 Tampines Road"}, PROFILE, NOW
        )
        self.assertEqual(result["matchSummary"]["caseId"], "case-1")
        self.assertNotIn("whatsapp", result["matchSummary"])
        self.assertEqual(result["private"], {"pickupAddress": "88 Tampines Road"})

    def test_overdue_is_computed_on_read(self):
        late = NOW + timedelta(days=5)
        self.assertTrue(lifecycle.view(item("matched"), OWNER, now=late)["matchSummary"]["overdue"])
        connected = item("matched", activeMatch=match(connected=True))
        summary = lifecycle.view(connected, OWNER, now=late)["matchSummary"]
        self.assertTrue(summary["connected"])
        self.assertFalse(summary["overdue"])

    def test_cancel_kind(self):
        def kind(**fields):
            return lifecycle.view(item(**fields), OWNER)["cancelKind"]

        self.assertEqual(kind(status="rejected", cancelledBy="admin-1"), "rejected")
        self.assertEqual(kind(status="withdrawn", cancelledBy="donor-1", cancelReason="no_match"), "donor")
        self.assertEqual(kind(status="withdrawn", cancelledBy="system", cancelReason="no_match"), "no_match")
        self.assertEqual(kind(status="withdrawn", cancelledBy="system", cancelReason="no_connect"), "no_connect")
        self.assertNotIn("cancelKind", lifecycle.view(item("available"), OWNER))

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
        self.assertFalse(lifecycle.is_expired(item("available", expectedDeliveryDate=None), today))
        self.assertFalse(lifecycle.is_expired(item("available", expectedDeliveryDate="soon"), today))

    def test_system_expiry_withdraws_with_no_match_reason(self):
        decision = lifecycle.decide(
            item("available"),
            "expire",
            lifecycle.SYSTEM_USER,
            {"expected_status": "available", "reason": lifecycle.NO_MATCH_REASON},
            NOW,
        )
        self.assertEqual(decision.item_updates["status"], "withdrawn")
        self.assertEqual(decision.item_updates["cancelReason"], "no_match")
        self.assertEqual(decision.item_updates["cancelledBy"], "system")


if __name__ == "__main__":
    unittest.main()
