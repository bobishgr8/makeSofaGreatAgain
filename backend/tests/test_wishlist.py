import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app"))
from wishlist import build_wishlist


def make_case(**overrides):
    case = {
        "status": "open",
        "household": {"summary": "Parent with two children"},
        "location": {"city": "ReFurbish", "district": "Bedok"},
        "priority": "standard",
        "needs": [{"category": "sofa"}],
        "createdAt": datetime.now(timezone.utc),
        # Fields a real case document has that must never leak into the
        # public wishlist.
        "socialWorkerId": "sw-123",
    }
    case.update(overrides)
    return case


class BuildWishlistTests(unittest.TestCase):
    def test_flattens_one_entry_per_need(self):
        items = build_wishlist([make_case(needs=[{"category": "sofa"}, {"category": "bed"}])])
        self.assertEqual([item["category"] for item in items], ["sofa", "bed"])

    def test_excludes_closed_cases(self):
        items = build_wishlist([make_case(status="closed")])
        self.assertEqual(items, [])

    def test_includes_cases_with_no_status_as_open(self):
        case = make_case()
        del case["status"]
        items = build_wishlist([case])
        self.assertEqual(len(items), 1)

    def test_skips_needs_without_a_category(self):
        items = build_wishlist([make_case(needs=[{}, {"category": "chair"}])])
        self.assertEqual([item["category"] for item in items], ["chair"])

    def test_never_leaks_case_or_social_worker_id(self):
        items = build_wishlist([make_case()])
        self.assertNotIn("id", items[0])
        self.assertNotIn("socialWorkerId", items[0])
        self.assertNotIn("createdAt", items[0])

    def test_carries_neighbourhood_and_summary(self):
        items = build_wishlist([make_case()])
        self.assertEqual(items[0]["neighbourhood"], "Bedok")
        self.assertEqual(items[0]["summary"], "Parent with two children")

    def test_sorts_urgent_before_high_before_standard(self):
        cases = [
            make_case(priority="standard", needs=[{"category": "chair"}]),
            make_case(priority="urgent", needs=[{"category": "bed"}]),
            make_case(priority="high", needs=[{"category": "sofa"}]),
        ]
        items = build_wishlist(cases)
        self.assertEqual([item["priority"] for item in items], ["urgent", "high", "standard"])

    def test_breaks_ties_by_most_recent_first(self):
        now = datetime.now(timezone.utc)
        older = make_case(needs=[{"category": "chair"}], createdAt=now - timedelta(days=5))
        newer = make_case(needs=[{"category": "bed"}], createdAt=now)
        items = build_wishlist([older, newer])
        self.assertEqual([item["category"] for item in items], ["bed", "chair"])

    def test_caps_at_max_wishlist_items(self):
        cases = [make_case(needs=[{"category": "chair"}]) for _ in range(100)]
        items = build_wishlist(cases)
        self.assertEqual(len(items), 60)


if __name__ == "__main__":
    unittest.main()
