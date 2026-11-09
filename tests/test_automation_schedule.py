from datetime import datetime
from zoneinfo import ZoneInfo
import unittest

from api.routers.automation import _next_cron_at


class TestAutomationSchedule(unittest.TestCase):
    def test_returns_next_monday_six_am_in_configured_timezone(self):
        timezone = ZoneInfo("Europe/Berlin")
        now = datetime(2026, 11, 9, 5, 59, tzinfo=timezone)
        self.assertEqual(
            _next_cron_at("0 6 * * 1", now),
            datetime(2026, 11, 9, 6, 0, tzinfo=timezone),
        )

    def test_weekly_schedule_advances_after_current_occurrence(self):
        timezone = ZoneInfo("Europe/Berlin")
        now = datetime(2026, 11, 9, 6, 0, tzinfo=timezone)
        self.assertEqual(
            _next_cron_at("0 6 * * 1", now),
            datetime(2026, 11, 16, 6, 0, tzinfo=timezone),
        )

    def test_supports_lists_ranges_and_steps(self):
        timezone = ZoneInfo("UTC")
        now = datetime(2026, 11, 9, 6, 5, tzinfo=timezone)
        self.assertEqual(
            _next_cron_at("*/15 7-8 * * 1-5", now),
            datetime(2026, 11, 9, 7, 0, tzinfo=timezone),
        )

    def test_rejects_invalid_cron_expression(self):
        with self.assertRaises(ValueError):
            _next_cron_at("0 6 *", datetime.now(ZoneInfo("UTC")))


if __name__ == "__main__":
    unittest.main()
