import re
import unittest
from datetime import date
from pathlib import Path
import sys

APP = Path(__file__).resolve().parents[1] / "app"
sys.path.insert(0, str(APP))
from scoring import (
    MIN_SCORE, NEIGHBOURHOOD_CENTROIDS, feasibility_weights, lift_importance, score_match, size_fit,
)

TODAY = date(2024, 9, 1)


def item(**fields):
    return {
        "category": "sofa",
        "status": "available",
        "condition": "excellent",
        "location": {"district": "Tampines"},
        "collection": {"hasLift": True, "deliveryArea": "network"},
        "dimensionsCm": {"width": 180, "depth": 90, "height": 80},
        "expectedDeliveryDate": "2024-09-06",
        **fields,
    }


def case(space=None, **fields):
    need = {"category": "sofa"}
    if space:
        need["maxDimensionsCm"] = space
    return {
        "needs": [need],
        "location": {"district": "Tampines"},
        "delivery": {"hasLift": True, "transportAvailable": False},
        **fields,
    }


ROOMY = {"width": 200, "depth": 100, "height": 100}


class MatchingTests(unittest.TestCase):
    def test_best_match_is_explainable(self):
        result = score_match(item(), case(ROOMY), TODAY)
        full = {"size": 30, "condition": 20, "access": 20, "proximity": 10, "transport": 10, "urgency": 10}
        self.assertEqual(result["score"], 100)
        self.assertEqual((result["fit"], result["feasibility"]), (50, 50))
        self.assertFalse(result["weak"])
        self.assertFalse(result["urgent"])
        self.assertEqual(result["scoreBreakdown"], full)
        self.assertEqual(result["weights"], full)
        self.assertEqual(
            result["reasons"],
            [
                "Fits the space",
                "Excellent condition",
                "Same neighbourhood",
                "Lift at pickup",
                "Lift at delivery",
                "Lift access weighted highly for this item",
                "Donor can deliver",
                "Needs a home within 5 days",
            ],
        )

    def test_wrong_category_or_unavailable_is_rejected(self):
        self.assertIsNone(score_match(item(category="table"), case(needs=[{"category": "chair"}]), TODAY))
        self.assertIsNone(score_match(item(status="matched"), case(), TODAY))
        # Matching ignores letter case.
        self.assertIsNotNone(score_match(item(category="Sofa"), case(), TODAY))

    def test_fit_plus_feasibility_is_the_score(self):
        for listing in (
            item(),
            item(condition="repair_needed", location={"district": "Geylang"}),
            item(collection={"hasLift": False, "disassembly": "yes", "deliveryArea": "maybe"}),
            item(category="chair", dimensionsCm={"width": 50, "depth": 50, "height": 90}),
        ):
            need = case(needs=[{"category": listing["category"]}])
            result = score_match(listing, need, TODAY)
            self.assertEqual(result["fit"] + result["feasibility"], result["score"])
            self.assertEqual(sum(result["scoreBreakdown"].values()), result["score"])

    def test_condition_points(self):
        def condition(value):
            return score_match(item(condition=value), case(), TODAY)["scoreBreakdown"]["condition"]

        self.assertEqual(condition("excellent"), 20)
        self.assertEqual(condition("good"), 16)
        self.assertEqual(condition("usable"), 12)
        self.assertEqual(condition("repair_needed"), 6)
        self.assertEqual(condition(None), 12)
        worse = score_match(item(condition="repair_needed"), case(), TODAY)["score"]
        self.assertLess(worse, score_match(item(), case(), TODAY)["score"])

    def test_proximity_by_distance(self):
        def proximity(item_district, case_district):
            result = score_match(
                item(location={"district": item_district}),
                case(location={"district": case_district}),
                TODAY,
            )
            return result["scoreBreakdown"]["proximity"]

        self.assertEqual(proximity("Tampines", "Tampines"), 10)
        self.assertGreater(proximity("Tampines", "Pasir Ris"), proximity("Tampines", "Geylang"))
        self.assertGreater(proximity("Tampines", "Geylang"), 0)
        self.assertEqual(proximity("Tampines", "Jurong West"), 0)
        # Two missing locations are not the same place.
        self.assertEqual(proximity(None, None), 0)
        self.assertEqual(proximity("", ""), 0)

    def test_lift_beats_distance_for_a_sofa(self):
        def score(district, lift):
            sofa = item(location={"district": district}, collection={"hasLift": lift, "deliveryArea": "network"})
            return score_match(sofa, case(), TODAY)["score"]

        self.assertLess(score("Pasir Ris", False), score("Geylang", True))
        self.assertGreater(score("Pasir Ris", True), score("Geylang", True))

    def test_distance_beats_lift_for_a_chair(self):
        def score(district, lift):
            chair = item(
                category="chair",
                location={"district": district},
                collection={"hasLift": lift, "deliveryArea": "network"},
                dimensionsCm={"width": 50, "depth": 50, "height": 90},
            )
            return score_match(chair, case(needs=[{"category": "chair"}]), TODAY)["score"]

        self.assertGreater(score("Pasir Ris", False), score("Geylang", True))

    def test_lift_is_yes_or_no(self):
        def access(pickup, delivery):
            result = score_match(item(collection=pickup), case(delivery=delivery), TODAY)
            return result["scoreBreakdown"]["access"]

        self.assertEqual(access({"hasLift": True}, {"hasLift": True}), 20)
        self.assertEqual(access({"hasLift": True}, {"hasLift": False}), 10)
        self.assertEqual(access({"hasLift": False}, None), 0)
        self.assertEqual(access({}, {"hasLift": "yes"}), 0)  # only a real yes counts

    def test_dismantling_and_fitting_the_lift(self):
        def access(**collection):
            return score_match(item(collection=collection), case(), TODAY)["scoreBreakdown"]["access"]

        # Donor has no lift: dismantling gives back half the pickup points.
        self.assertEqual(access(hasLift=False), 10)
        self.assertEqual(access(hasLift=False, disassembly="yes"), 15)
        self.assertEqual(access(hasLift=False, disassembly="already"), 15)
        self.assertEqual(access(hasLift=False, disassembly="no"), 10)
        # The household's lift does not help an item that does not fit a lift.
        self.assertEqual(access(hasLift=True, fitsInLift="no"), 10)
        self.assertEqual(access(hasLift=True, fitsInLift="not_sure"), 20)
        reasons = score_match(item(collection={"hasLift": True, "fitsInLift": "no"}), case(), TODAY)["reasons"]
        self.assertIn("Lift at delivery, but the item doesn't fit a lift", reasons)

    def test_transport(self):
        def transport(area, household=False, district="Tampines"):
            listing = item(collection={"hasLift": True, "deliveryArea": area}, location={"district": district})
            household_case = case(delivery={"hasLift": True, "transportAvailable": household})
            return score_match(listing, household_case, TODAY)["scoreBreakdown"]["transport"]

        self.assertEqual(transport("no", household=True), 10)
        self.assertEqual(transport("network", district="Jurong West"), 10)
        self.assertEqual(transport("local"), 10)
        self.assertEqual(transport("local", district="Pasir Ris"), 10)  # about 3 km
        self.assertEqual(transport("local", district="Jurong West"), 5)
        self.assertEqual(transport("maybe"), 5)
        self.assertEqual(transport("no"), 0)
        self.assertEqual(transport(None), 5)

    def test_weak_below_the_minimum(self):
        worst = score_match(
            item(
                condition="repair_needed",
                location={"district": "Jurong West"},
                collection={"hasLift": False, "deliveryArea": "no"},
                dimensionsCm=None,
                expectedDeliveryDate="2024-12-01",
            ),
            case(delivery={"hasLift": False, "transportAvailable": False}),
            TODAY,
        )
        self.assertLess(worst["score"], MIN_SCORE)
        self.assertTrue(worst["weak"])
        self.assertIn("No transport on either side", worst["reasons"])
        self.assertFalse(score_match(item(), case(ROOMY), TODAY)["weak"])

    def test_lift_importance_by_category_and_size(self):
        self.assertEqual(lift_importance(item()), 1)  # sofa, plus a side of 180 cm
        self.assertEqual(lift_importance(item(dimensionsCm=None)), 0.9)
        small_chair = item(category="chair", dimensionsCm={"width": 40, "depth": 40, "height": 45})
        self.assertEqual(lift_importance(small_chair), 0)
        self.assertEqual(lift_importance(item(category="lamp", dimensionsCm=None)), 0.5)

    def test_feasibility_weights_always_total_50(self):
        for importance in (0, 0.1, 0.5, 0.9, 1):
            self.assertEqual(sum(feasibility_weights(importance).values()), 50)
        self.assertGreater(feasibility_weights(1)["access"], feasibility_weights(1)["proximity"])
        self.assertGreater(feasibility_weights(0)["proximity"], feasibility_weights(0)["access"])

    def test_too_big_footprint_is_a_weak_match(self):
        # 180×90 does not fit 150×100 either way round.
        result = score_match(item(), case({"width": 150, "depth": 100, "height": 100}), TODAY)
        self.assertIsNotNone(result)
        self.assertEqual(result["scoreBreakdown"]["size"], 0)
        self.assertTrue(result["weak"])
        self.assertIn("Too big for the space: 180×90 cm vs 150×100 cm", result["reasons"])

    def test_taller_than_the_space_still_matches(self):
        # The footprint fits; only the height is over.
        result = score_match(item(), case({"width": 200, "depth": 100, "height": 70}), TODAY)
        self.assertEqual(result["scoreBreakdown"]["size"], 20)
        self.assertFalse(result["weak"])
        self.assertIn("Fits the floor space, but taller than the height given (80 cm vs 70 cm)", result["reasons"])

    def test_size_fit(self):
        space = lambda w, d, h=None: {"maxDimensionsCm": {"width": w, "depth": d, "height": h}}  # noqa: E731
        self.assertEqual(size_fit(item(), space(100, 200, 100)), "fits")  # turned round
        self.assertEqual(size_fit(item(), space(200, 100)), "fits")  # no height given
        self.assertEqual(size_fit(item(), space(200, 100, 70)), "taller")
        self.assertEqual(size_fit(item(), space(150, 100, 100)), "too_big")
        self.assertIsNone(size_fit(item(), {}))
        self.assertIsNone(size_fit(item(dimensionsCm={"width": 180}), space(200, 100)))

    def test_missing_sizes_are_not_checked(self):
        for pair in (
            (item(), case()),
            (item(dimensionsCm=None), case(ROOMY)),
            (item(dimensionsCm={"width": 180}), case(ROOMY)),
        ):
            result = score_match(*pair, TODAY)
            self.assertEqual(result["scoreBreakdown"]["size"], 12)
            self.assertIn("Size not checked", result["reasons"])

    def test_urgency_by_days_left(self):
        def urgency(delivery):
            return score_match(item(expectedDeliveryDate=delivery), case(), TODAY)["scoreBreakdown"]["urgency"]

        self.assertEqual(urgency("2024-09-08"), 10)  # 7 days
        self.assertEqual(urgency("2024-09-01"), 10)  # today
        self.assertEqual(urgency("2024-10-01"), 0)   # 30 days
        self.assertEqual(urgency("2024-12-01"), 0)
        self.assertEqual(urgency(None), 0)
        self.assertGreater(urgency("2024-09-12"), urgency("2024-09-20"))

    def test_urgent_on_the_last_day_and_past_items_still_shown(self):
        def result(delivery):
            return score_match(item(expectedDeliveryDate=delivery), case(), TODAY)

        last_day = result("2024-09-01")
        self.assertTrue(last_day["urgent"])
        self.assertIn("Last day for donation", last_day["reasons"])
        self.assertFalse(result("2024-09-02")["urgent"])
        self.assertIn("Needs a home within 1 day", result("2024-09-02")["reasons"])
        past = result("2024-08-20")
        self.assertFalse(past["urgent"])
        self.assertIn("Past the donor's delivery date", past["reasons"])
        self.assertFalse(result(None)["urgent"])

    def test_case_priority_does_not_change_the_score(self):
        urgent = score_match(item(), case(priority="urgent"), TODAY)
        standard = score_match(item(), case(priority="standard"), TODAY)
        self.assertEqual(urgent["score"], standard["score"])

    def test_every_neighbourhood_has_a_centre(self):
        source = (APP / "config.py").read_text(encoding="utf-8")
        block = re.search(r"NEIGHBOURHOODS = \[(.*?)\]", source, re.S).group(1)
        neighbourhoods = re.findall(r'"([^"]+)"', block)
        self.assertTrue(neighbourhoods)
        self.assertEqual(set(neighbourhoods), set(NEIGHBOURHOOD_CENTROIDS))


if __name__ == "__main__":
    unittest.main()


class MatchingRubricTests(unittest.TestCase):
    """EPIC 2bii "To Be": household scenarios that pin down how suggestions rank.
    Each compares two candidate items for one case; the first should rank higher.
    Lift is the deciding factor for bulky items, distance for light ones."""

    def score(self, candidate, need_case):
        result = score_match(candidate, need_case, TODAY)
        self.assertIsNotNone(result)
        return result["score"]

    def assertRanksAbove(self, better, worse, need_case):
        self.assertGreater(self.score(better, need_case), self.score(worse, need_case))

    def test_bulky_sofa_lift_beats_being_next_door(self):
        """A family on a high floor in Tampines needs a 3-seater; a sofa from a
        lift block nearby beats one from a walk-up in the same neighbourhood."""
        household = case(ROOMY, delivery={"hasLift": True})
        lift_nearby = item(location={"district": "Pasir Ris"}, collection={"hasLift": True})
        walk_up_same_area = item(collection={"hasLift": False})
        self.assertRanksAbove(lift_nearby, walk_up_same_area, household)

    def test_light_chair_distance_beats_lift(self):
        """For a dining chair, someone can carry it down the stairs: a chair in
        the same neighbourhood beats one across the island with lifts."""
        household = case(needs=[{"category": "chair"}])
        chair = {"category": "chair", "dimensionsCm": {"width": 45, "depth": 50, "height": 85}}
        nearby_no_lift = item(**chair, collection={"hasLift": False})
        far_with_lift = item(**chair, location={"district": "Jurong West"})
        self.assertRanksAbove(nearby_no_lift, far_with_lift, household)

    def test_fridge_without_any_lift_ranks_low(self):
        household = case(needs=[{"category": "fridge"}], delivery={"hasLift": False})
        fridge = {"category": "fridge", "dimensionsCm": {"width": 60, "depth": 65, "height": 170}}
        with_lift = item(**fridge, collection={"hasLift": True})
        no_lift = item(**fridge, collection={"hasLift": False})
        self.assertRanksAbove(with_lift, no_lift, household)
        self.assertGreaterEqual(lift_importance(item(**fridge)), 0.9)

    def test_an_item_taller_than_the_space_ranks_below_one_that_fits(self):
        """A wardrobe for a small room: 200 cm tall is over a 180 cm ceiling slope.
        Size is not a filter, so it is still suggested (the social worker decides),
        but it ranks below a wardrobe that fits."""
        household = case(needs=[{
            "category": "storage", "maxDimensionsCm": {"width": 120, "depth": 70, "height": 180},
        }])
        tall = item(category="storage", dimensionsCm={"width": 100, "depth": 60, "height": 200})
        fits_under = item(category="storage", dimensionsCm={"width": 100, "depth": 60, "height": 170})
        self.assertRanksAbove(fits_under, tall, household)

    def test_a_donor_who_must_move_out_soon_comes_first(self):
        household = case(ROOMY)
        leaving_this_week = item(expectedDeliveryDate="2024-09-05")
        no_rush = item(expectedDeliveryDate="2024-11-30")
        self.assertRanksAbove(leaving_this_week, no_rush, household)

    def test_a_known_fit_beats_an_unknown_size(self):
        household = case(ROOMY)
        measured = item()
        unmeasured = item(dimensionsCm={})
        self.assertRanksAbove(measured, unmeasured, household)

    def test_closer_wins_when_all_else_is_equal(self):
        household = case(ROOMY, location={"district": "Bedok"})
        tampines = item(location={"district": "Tampines"})
        woodlands = item(location={"district": "Woodlands"})
        self.assertRanksAbove(tampines, woodlands, household)
