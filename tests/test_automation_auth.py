import unittest
from unittest.mock import patch

from fastapi import HTTPException

from api.automation_auth import require_automation_token


class TestAutomationAuth(unittest.TestCase):
    def test_rejects_missing_authorization(self):
        with patch.dict("os.environ", {"AUTOMATION_API_TOKEN": "a" * 48}):
            with self.assertRaises(HTTPException) as caught:
                require_automation_token(None)
        self.assertEqual(caught.exception.status_code, 401)

    def test_rejects_wrong_token(self):
        with patch.dict("os.environ", {"AUTOMATION_API_TOKEN": "a" * 48}):
            with self.assertRaises(HTTPException) as caught:
                require_automation_token("Bearer " + "b" * 48)
        self.assertEqual(caught.exception.status_code, 401)

    def test_rejects_unconfigured_service_token_closed(self):
        with patch.dict("os.environ", {}, clear=True):
            with self.assertRaises(HTTPException) as caught:
                require_automation_token("Bearer " + "a" * 48)
        self.assertEqual(caught.exception.status_code, 503)

    def test_accepts_matching_bearer_token(self):
        token = "a" * 48
        with patch.dict("os.environ", {"AUTOMATION_API_TOKEN": token}):
            self.assertIsNone(require_automation_token(f"Bearer {token}"))


if __name__ == "__main__":
    unittest.main()
