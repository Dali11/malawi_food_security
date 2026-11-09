import importlib.util
from pathlib import Path
import unittest
from unittest.mock import MagicMock, patch

pipeline_path = Path(__file__).resolve().parents[1] / "scripts" / "update_pipeline.py"
spec = importlib.util.spec_from_file_location("pipeline_under_test", pipeline_path)
if spec is None or spec.loader is None:
    raise RuntimeError(f"Could not load pipeline module from {pipeline_path}")
pipeline = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pipeline)
log_pipeline_run = pipeline.log_pipeline_run


class TestPipelineRunLogging(unittest.TestCase):
    def test_logging_uses_existing_table_without_runtime_ddl(self):
        cursor = MagicMock()
        conn = MagicMock()
        conn.cursor.return_value.__enter__.return_value = cursor
        stats = {
            "new_records": 7,
            "new_spikes": 2,
            "new_critical": 1,
            "new_informal": 3,
            "latest_date": "2026-11-15",
            "status": "success",
            "notes": "refreshed",
        }

        with patch("scripts.update_pipeline.log.info"):
            log_pipeline_run(conn, stats)

        statements = [c.args[0] for c in cursor.execute.call_args_list]
        self.assertEqual(len(statements), 1)
        self.assertIn("INSERT INTO pipeline_log", statements[0])
        self.assertNotIn("CREATE TABLE", " ".join(statements).upper())
        self.assertNotIn("ALTER TABLE", " ".join(statements).upper())
        self.assertEqual(cursor.execute.call_args.args[1], (7, 2, 1, 3, "2026-11-15", "success", "refreshed"))
        conn.commit.assert_called_once_with()

    def test_spike_detection_returns_only_revised_composite_keys(self):
        import pandas as pd

        date = pd.Timestamp("2026-03-15")
        history = pd.DataFrame([
            {"date": date, "district": "D1", "market": "M1", "commodity": "Maize", "unit": "KG", "price": 10.0, "region": "R", "is_spike": False, "spike_severity": "Normal"},
            {"date": date, "district": "D1", "market": "M1", "commodity": "Beans", "unit": "KG", "price": 20.0, "region": "R", "is_spike": False, "spike_severity": "Normal"},
        ])
        revised = pd.DataFrame([
            {"date": date, "district": "D1", "market": "M1", "commodity": "Maize", "unit": "KG", "price": 12.0, "region": "R", "is_spike": False, "spike_severity": "Normal"},
        ])

        result = pipeline.detect_spikes(revised, history)

        self.assertEqual(len(result), 1)
        self.assertEqual(result.iloc[0]["commodity"], "Maize")
        self.assertEqual(float(result.iloc[0]["price"]), 12.0)


if __name__ == "__main__":
    unittest.main()
