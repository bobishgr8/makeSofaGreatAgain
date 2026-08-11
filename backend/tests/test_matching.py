import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app"))
from scoring import score_match


class MatchingTests(unittest.TestCase):
    def test_exact_local_match_is_explainable(self):
        item = {
            "category": "sofa",
            "status": "available",
            "condition": "good",
            "location": {"city": "ReFurbish", "district": "Bukit Merah"},
            "collection": {"hasLift": True, "donorCanDeliver": False},
        }
        case = {
            "needs": [{"category": "sofa"}],
            "priority": "urgent",
            "location": {"city": "ReFurbish", "district": "Bukit Merah"},
            "delivery": {"hasLift": True, "transportAvailable": False},
        }
        result = score_match(item, case)
        self.assertEqual(result["score"], 85)
        self.assertIn("Same neighbourhood", result["reasons"])


    def test_wrong_category_is_rejected(self):
        item = {"category": "chair", "status": "available"}
        case = {"needs": [{"category": "bed"}]}
        self.assertIsNone(score_match(item, case))


if __name__ == "__main__":
    unittest.main()
