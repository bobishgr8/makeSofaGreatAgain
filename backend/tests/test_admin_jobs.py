import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.admin import compute_stats  # noqa: E402
from app.jobs import weekly_summary_text  # noqa: E402

NOW = datetime(2026, 11, 21, 2, 0, tzinfo=timezone.utc)


class StatsTests(unittest.TestCase):
    def test_counts(self):
        furniture = [
            {"status": "pending_review", "category": "sofa"},
            {"status": "available", "category": "bed"},
            {"status": "matched", "waitlist": [{"caseId": "c1"}, {"caseId": "c2"}]},
            {"status": "delivered", "category": "sofa", "activeMatch": {"deliveredAt": NOW - timedelta(days=1)}},
            {"status": "delivered", "category": "fridge", "activeMatch": {"deliveredAt": NOW - timedelta(days=20)}},
        ]
        cases = [{"status": "open"}, {}, {"status": "closed"}]
        outbox = [{"sentAt": None}, {"sentAt": NOW}, {"sentAt": NOW, "failed": True}]
        stats = compute_stats(furniture, cases, [{"message": "hi"}], outbox, NOW)
        self.assertEqual(stats["furnitureTotal"], 5)
        self.assertEqual(stats["deliveredTotal"], 2)
        self.assertEqual(stats["deliveredThisWeek"], 1)
        self.assertEqual(stats["deliveredByCategory"], {"sofa": 1, "fridge": 1})
        self.assertEqual(stats["activeMatches"], 1)
        self.assertEqual(stats["waitlistEntries"], 2)
        self.assertEqual(stats["awaitingReview"], 1)
        self.assertEqual((stats["openCases"], stats["casesTotal"]), (2, 3))
        self.assertEqual(stats["thankYouNotes"], 1)
        self.assertEqual((stats["notificationsPending"], stats["notificationsFailed"]), (1, 1))

    def test_empty_platform(self):
        stats = compute_stats([], [], [], [], NOW)
        self.assertEqual(stats["furnitureTotal"], 0)
        self.assertEqual(stats["furnitureByStatus"], {})


class WeeklySummaryTests(unittest.TestCase):
    def test_nothing_new_sends_nothing(self):
        self.assertIsNone(weekly_summary_text(3, 0, 0, 0, "https://x"))

    def test_lists_what_happened_with_plurals(self):
        text = weekly_summary_text(2, 3, 1, 1, "https://x/")
        self.assertIn("2 open cases", text)
        self.assertIn("3 new items", text)
        self.assertIn("1 match in progress", text)
        self.assertIn("1 delivery completed", text)
        self.assertTrue(text.endswith("https://x/workspace"))
        self.assertIn("1 open case\n", weekly_summary_text(1, 1, 0, 0, ""))


if __name__ == "__main__":
    unittest.main()
