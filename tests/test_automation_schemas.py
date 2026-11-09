from datetime import date
from decimal import Decimal
import unittest

from pydantic import ValidationError

from api.automation_schemas import (
    DeliveryAttemptRequest,
    FieldObservationRequest,
    PipelineRunRequest,
)


class TestAutomationSchemas(unittest.TestCase):
    def test_delivery_attempt_requires_an_idempotency_uuid(self):
        with self.assertRaises(ValidationError):
            DeliveryAttemptRequest(attempt_id="bad", delivered=False, error="timeout")

    def test_delivery_attempt_accepts_bounded_failure_detail(self):
        request = DeliveryAttemptRequest(
            attempt_id="00000000-0000-4000-8000-000000000001",
            delivered=False,
            error="provider unavailable",
        )
        self.assertFalse(request.delivered)

    def test_pipeline_run_requires_uuid_request_id(self):
        with self.assertRaises(ValidationError):
            PipelineRunRequest(request_id="not-a-uuid")

    def test_accepts_valid_field_observation_as_pending_input(self):
        observation = FieldObservationRequest(
            market_name="Lilongwe Main Market",
            district="Lilongwe",
            commodity="Maize",
            unit="KG",
            price="1200.50",
            observation_date=date.today(),
            data_collector="monitor-01",
            source="field",
        )
        self.assertEqual(observation.price, Decimal("1200.50"))
        self.assertEqual(observation.review_status, "pending")

    def test_rejects_non_positive_field_price(self):
        with self.assertRaises(ValidationError):
            FieldObservationRequest(
                market_name="Lilongwe Main Market",
                district="Lilongwe",
                commodity="Maize",
                unit="KG",
                price=0,
                observation_date=date.today(),
            )

    def test_rejects_future_observation_date(self):
        from datetime import timedelta

        with self.assertRaises(ValidationError):
            FieldObservationRequest(
                market_name="Lilongwe Main Market",
                district="Lilongwe",
                commodity="Maize",
                unit="KG",
                price=100,
                observation_date=date.today() + timedelta(days=1),
            )


if __name__ == "__main__":
    unittest.main()
