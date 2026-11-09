import importlib.util
from pathlib import Path
import unittest

import pandas as pd

PIPELINE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "update_pipeline.py"
_spec = importlib.util.spec_from_file_location("pipeline_alert_events", PIPELINE_PATH)
if _spec is None or _spec.loader is None:
    raise RuntimeError(f"Could not load pipeline from {PIPELINE_PATH}")
pipeline = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pipeline)


class TestPipelineAlertEvents(unittest.TestCase):
    def test_extracts_only_alertable_spikes_with_previous_price(self):
        frame = pd.DataFrame([
            {"date": pd.Timestamp("2026-11-01"), "district": "D1", "market": "M1", "commodity": "Maize", "unit": "KG", "previous_price": 1000.0, "price": 1250.0, "pct_change": 25.0, "zscore": 1.6, "spike_severity": "Moderate"},
            {"date": pd.Timestamp("2026-11-02"), "district": "D2", "market": "M2", "commodity": "Beans", "unit": "KG", "previous_price": 500.0, "price": 520.0, "pct_change": 4.0, "zscore": 0.2, "spike_severity": "Normal"},
        ])

        events = pipeline.extract_alert_events(frame)

        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["event_date"], "2026-11-01")
        self.assertEqual(events[0]["previous_price"], 1000.0)
        self.assertEqual(events[0]["current_price"], 1250.0)
        self.assertEqual(events[0]["severity"], "Moderate")


if __name__ == "__main__":
    unittest.main()
