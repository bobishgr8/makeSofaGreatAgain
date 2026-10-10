import re
import unittest
from datetime import date
from pathlib import Path
import sys

APP = Path(__file__).resolve().parents[1] / "app"
sys.path.insert(0, str(APP))
from scoring import NEIGHBOURHOOD_REGIONS, fits, score_match

TODAY = date(2024, 9, 1)


def item(**fields):
    return {
        "category": "sofa",
        "status": "available",
        "location": {"district": "Tampines"},
        "dimensionsCm": {"width": 180, "depth": 90, "height": 80},
        "expectedDeliveryDate": "2024-09-06",
        **fields,
    }


def case(space=None, **fields):
    need = {"category": "sofa"}
    if space:
        need["maxDimensionsCm"] = space
    return {"needs": [need], "location": {"district": "Tampines"}, **fields}


ROOMY = {"width": 200, "depth": 100, "height": 100}


class MatchingTests(unittest.TestCase):
    def test_best_match_is_explainable(self):
        result = score_match(item(), case(ROOMY), TODAY)
        self.assertEqual(result["score"], 100)
        self.assertEqual(result["scoreBreakdown"], {"proximity": 40, "dimensions": 35, "urgency": 25})
        self.assertEqual(
            result["reasons"],
            ["Same neighbourhood", "Fits the space", "Needs a home within 5 days"],
        )

    def test_wrong_category_or_unavailable_is_rejected(self):
        self.assertIsNone(score_match(item(category="chair"), case(), TODAY))
        self.assertIsNone(score_match(item(status="matched"), case(), TODAY))

    def test_proximity_by_neighbourhood_then_region(self):
        def proximity(item_district, case_district):
            result = score_match(
                item(location={"district": item_district}),
                case(location={"district": case_district}),
                TODAY,
            )
            return result["scoreBreakdown"]["proximity"]

        self.assertEqual(proximity("Tampines", "Tampines"), 40)
        self.assertEqual(proximity("Tampines", "Bedok"), 20)  # both East
        self.assertEqual(proximity("Tampines", "Jurong West"), 0)
        # Two missing locations are not the same place.
        self.assertEqual(proximity(None, None), 0)
        self.assertEqual(proximity("", ""), 0)

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
            self.assertEqual(result["scoreBreakdown"]["dimensions"], 15)
            self.assertIn("Size not checked", result["reasons"])

    def test_urgency_by_days_left(self):
        def urgency(delivery):
            return score_match(item(expectedDeliveryDate=delivery), case(), TODAY)["scoreBreakdown"]["urgency"]

        self.assertEqual(urgency("2024-09-08"), 25)  # 7 days
        self.assertEqual(urgency("2024-09-01"), 25)  # today
        self.assertEqual(urgency("2024-10-01"), 0)   # 30 days
        self.assertEqual(urgency("2024-12-01"), 0)
        self.assertEqual(urgency(None), 0)
        self.assertGreater(urgency("2024-09-12"), urgency("2024-09-20"))

    def test_case_priority_does_not_change_the_score(self):
        urgent = score_match(item(), case(priority="urgent"), TODAY)
        standard = score_match(item(), case(priority="standard"), TODAY)
        self.assertEqual(urgent["score"], standard["score"])

    def test_every_neighbourhood_has_a_region(self):
        source = (APP / "config.py").read_text(encoding="utf-8")
        block = re.search(r"NEIGHBOURHOODS = \[(.*?)\]", source, re.S).group(1)
        neighbourhoods = re.findall(r'"([^"]+)"', block)
        self.assertTrue(neighbourhoods)
        self.assertEqual(set(neighbourhoods), set(NEIGHBOURHOOD_REGIONS))


if __name__ == "__main__":
    unittest.main()
