import hashlib
import hmac
import sys
import unittest
from datetime import date, datetime, timezone
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import lalamove


class SignatureTests(unittest.TestCase):
    def test_signs_the_documented_string(self):
        expected = hmac.new(
            b"secret",
            b"1700000000000\r\nPOST\r\n/v3/quotations\r\n\r\n{\"a\":1}",
            hashlib.sha256,
        ).hexdigest()
        self.assertEqual(
            lalamove.sign("secret", "1700000000000", "POST", "/v3/quotations", '{"a":1}'),
            expected,
        )


class ScheduleTests(unittest.TestCase):
    now = datetime(2026, 10, 11, 4, 0, tzinfo=timezone.utc)  # 12:00 SGT

    def test_future_date_is_nine_am_sgt_in_utc(self):
        self.assertEqual(
            lalamove.schedule_at(date(2026, 10, 12), self.now), "2026-10-12T01:00:00.000Z"
        )

    def test_today_after_nine_is_not_scheduled(self):
        self.assertIsNone(lalamove.schedule_at(date(2026, 10, 11), self.now))


class QuoteTests(unittest.TestCase):
    def test_not_configured(self):
        with mock.patch.dict("os.environ", {}, clear=True):
            with self.assertRaises(lalamove.QuoteError) as caught:
                lalamove.quote_trip("a", "b", date(2026, 10, 12))
        self.assertEqual(caught.exception.status, 503)

    def test_returns_a_quote_per_service_type(self):
        env = {"LALAMOVE_API_KEY": "k", "LALAMOVE_API_SECRET": "s", "LALAMOVE_SERVICE_TYPES": "VAN,CAR"}
        reply = mock.Mock(status_code=201)
        reply.json.return_value = {
            "data": {
                "priceBreakdown": {"total": "52.5", "currency": "SGD"},
                "expiresAt": "2026-10-11T05:00:00.000Z",
                "distance": {"value": "9000"},
            }
        }
        with mock.patch.dict("os.environ", env, clear=True), \
                mock.patch.object(lalamove, "geocode", return_value=("1.3", "103.8")), \
                mock.patch.object(lalamove.requests, "post", return_value=reply) as post:
            quotes = lalamove.quote_trip("A", "B", date(2026, 10, 12))
        self.assertEqual([q["serviceType"] for q in quotes], ["VAN", "CAR"])
        self.assertEqual(quotes[0]["total"], "52.5")
        headers = post.call_args.kwargs["headers"]
        self.assertTrue(headers["Authorization"].startswith("hmac k:"))
        self.assertEqual(headers["Market"], "SG")

    def test_provider_error_becomes_a_quote_error(self):
        env = {"LALAMOVE_API_KEY": "k", "LALAMOVE_API_SECRET": "s"}
        with mock.patch.dict("os.environ", env, clear=True), \
                mock.patch.object(lalamove, "geocode", return_value=("1.3", "103.8")), \
                mock.patch.object(lalamove.requests, "post", return_value=mock.Mock(status_code=400)):
            with self.assertRaises(lalamove.QuoteError):
                lalamove.quote_trip("A", "B", date(2026, 10, 12))


if __name__ == "__main__":
    unittest.main()
