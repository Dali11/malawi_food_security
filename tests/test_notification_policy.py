import unittest

from api.notification_policy import retry_delay_seconds, sanitize_delivery_error


class TestNotificationPolicy(unittest.TestCase):
    def test_retry_delay_uses_bounded_exponential_backoff(self):
        self.assertEqual([retry_delay_seconds(n) for n in range(1, 6)], [60, 120, 240, 480, None])

    def test_sanitizes_bearer_tokens_and_secret_values(self):
        message = "request failed: Bearer abc123 token=do-not-log"
        sanitized = sanitize_delivery_error(message)
        self.assertNotIn("abc123", sanitized)
        self.assertNotIn("do-not-log", sanitized)
        self.assertIn("[REDACTED]", sanitized)


if __name__ == "__main__":
    unittest.main()
