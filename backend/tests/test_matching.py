import re
import unittest
from datetime import date
from pathlib import Path
import sys

APP = Path(__file__).resolve().parents[1] / "app"
sys.path.insert(0, str(APP))
from scoring import NEIGHBOURHOOD_CENTROIDS, fits, lift_importance, score_match, weights_for

TODAY = date(2024, 9, 1)


def item(**fields):
    return {
        "category": "sofa",
        "status": "available",
        "location": {"district": "Tampines"},
        "collection": {"hasLift": True},
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
        "delivery": {"hasLift": True},
        **fields,
    }


ROOMY = {"width": 200, "depth": 100, "height": 100}


class MatchingTests(unittest.TestCase):
    def test_best_match_is_explainable(self):
        result = score_match(item(), case(ROOMY), TODAY)
        full = {"access": 40, "proximity": 20, "dimensions": 25, "urgency": 15}
        self.assertEqual(result["score"], 100)
        self.assertEqual(result["scoreBreakdown"], full)
        self.assertEqual(result["weights"], full)
        self.assertEqual(
            result["reasons"],
            [
                "Same neighbourhood",
                "Lift at pickup",
                "Lift at delivery",
                "Lift access weighted highly for this item",
                "Fits the space",
                "Needs a home within 5 days",
            ],
        )

    def test_wrong_category_or_unavailable_is_rejected(self):
        self.assertIsNone(score_match(item(category="chair"), case(), TODAY))
        self.assertIsNone(score_match(item(status="matched"), case(), TODAY))

    def test_proximity_by_distance(self):
        def proximity(item_district, case_district):
            result = score_match(
                item(location={"district": item_district}),
                case(location={"district": case_district}),
                TODAY,
            )
            return result["scoreBreakdown"]["proximity"]

        self.assertEqual(proximity("Tampines", "Tampines"), 20)
        self.assertGreater(proximity("Tampines", "Pasir Ris"), proximity("Tampines", "Geylang"))
        self.assertGreater(proximity("Tampines", "Geylang"), 0)
        self.assertEqual(proximity("Tampines", "Jurong West"), 0)
        # Two missing locations are not the same place.
        self.assertEqual(proximity(None, None), 0)
        self.assertEqual(proximity("", ""), 0)

    def test_lift_beats_distance_for_a_sofa(self):
        def score(district, lift):
            sofa = item(location={"district": district}, collection={"hasLift": lift})
            return score_match(sofa, case(), TODAY)["score"]

        self.assertLess(score("Pasir Ris", False), score("Geylang", True))
        self.assertGreater(score("Pasir Ris", True), score("Geylang", True))

    def test_distance_beats_lift_for_a_chair(self):
        def score(district, lift):
            chair = item(
                category="chair",
                location={"district": district},
                collection={"hasLift": lift},
                dimensionsCm={"width": 50, "depth": 50, "height": 90},
            )
            return score_match(chair, case(needs=[{"category": "chair"}]), TODAY)["score"]

        self.assertGreater(score("Pasir Ris", False), score("Geylang", True))

    def test_lift_is_yes_or_no(self):
        def access(pickup, delivery):
            result = score_match(item(collection=pickup), case(delivery=delivery), TODAY)
            return result["scoreBreakdown"]["access"]

        self.assertEqual(access({"hasLift": True}, {"hasLift": True}), 40)
        self.assertEqual(access({"hasLift": True}, {"hasLift": False}), 20)
        self.assertEqual(access({"hasLift": False}, None), 0)
        self.assertEqual(access({}, {"hasLift": "yes"}), 0)  # only a real yes counts

    def test_lift_importance_by_category_and_size(self):
        self.assertEqual(lift_importance(item()), 1)  # sofa, plus a side of 180 cm
        self.assertEqual(lift_importance(item(dimensionsCm=None)), 0.9)
        small_chair = item(category="chair", dimensionsCm={"width": 40, "depth": 40, "height": 45})
        self.assertEqual(lift_importance(small_chair), 0)
        self.assertEqual(lift_importance(item(category="lamp", dimensionsCm=None)), 0.5)

    def test_weights_always_total_100(self):
        for importance in (0, 0.1, 0.5, 0.9, 1):
            self.assertEqual(sum(weights_for(importance).values()), 100)
        self.assertGreater(weights_for(1)["access"], weights_for(1)["proximity"])
        self.assertGreater(weights_for(0)["proximity"], weights_for(0)["access"])

    def test_too_big_is_rejected(self):
        tight = {"width": 150, "depth": 100, "height": 100}
        self.assertIsNone(score_match(item(), case(tight), TODAY))
        low = {"width": 200, "depth": 100, "height": 70}
        self.assertIsNone(score_match(item(), case(low), TODAY))

    def test_item_can_be_turned_to_fit(self):
        turned = {"width": 100, "depth": 200, "height": 100}
        self.assertTrue(fits(item(), {"maxDimensionsCm": turned}))

    def test_missing_sizes_are_not_checked(self):
        for pair in (
            (item(), case()),
            (item(dimensionsCm=None), case(ROOMY)),
            (item(dimensionsCm={"width": 180}), case(ROOMY)),
        ):
            result = score_match(*pair, TODAY)
            self.assertEqual(result["scoreBreakdown"]["dimensions"], 10)
            self.assertIn("Size not checked", result["reasons"])

    def test_urgency_by_days_left(self):
        def urgency(delivery):
            return score_match(item(expectedDeliveryDate=delivery), case(), TODAY)["scoreBreakdown"]["urgency"]

        self.assertEqual(urgency("2024-09-08"), 15)  # 7 days
        self.assertEqual(urgency("2024-09-01"), 15)  # today
        self.assertEqual(urgency("2024-10-01"), 0)   # 30 days
        self.assertEqual(urgency("2024-12-01"), 0)
        self.assertEqual(urgency(None), 0)
        self.assertGreater(urgency("2024-09-12"), urgency("2024-09-20"))

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
