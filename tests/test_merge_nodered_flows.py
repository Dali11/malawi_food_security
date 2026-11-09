import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "automation" / "node-red" / "merge_flows.py"
_spec = importlib.util.spec_from_file_location("merge_nodered_flows", SCRIPT)
if _spec is None or _spec.loader is None:
    raise RuntimeError(f"Could not load {SCRIPT}")
merge_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(merge_module)


class TestMergeNodeRedFlows(unittest.TestCase):
    def test_appends_without_replacing_existing_flows_and_is_idempotent(self):
        existing = [{"id": "oldtab", "type": "tab", "label": "Existing AI"},
                    {"id": "oldnode", "type": "debug", "z": "oldtab", "wires": []}]
        exported = [{"id": "newtab", "type": "tab", "label": "Automation"},
                    {"id": "newnode", "type": "inject", "z": "newtab", "wires": []}]
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "flows.json"
            addition = Path(directory) / "export.json"
            target.write_text(json.dumps(existing))
            addition.write_text(json.dumps(exported))

            first = merge_module.merge_flows(addition, target)
            second = merge_module.merge_flows(addition, target)
            result = json.loads(target.read_text())

        self.assertEqual(first["status"], "appended")
        self.assertEqual(second["status"], "already_present")
        self.assertEqual([node["id"] for node in result], ["oldtab", "oldnode", "newtab", "newnode"])

    def test_rejects_partial_id_collision_without_changing_target(self):
        existing = [{"id": "oldtab", "type": "tab", "label": "Existing"},
                    {"id": "collision", "type": "debug", "z": "oldtab", "wires": []}]
        exported = [{"id": "newtab", "type": "tab", "label": "Automation"},
                    {"id": "collision", "type": "inject", "z": "newtab", "wires": []}]
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "flows.json"
            addition = Path(directory) / "export.json"
            target.write_text(json.dumps(existing))
            addition.write_text(json.dumps(exported))
            before = target.read_bytes()

            with self.assertRaises(ValueError):
                merge_module.merge_flows(addition, target)

            self.assertEqual(target.read_bytes(), before)

    def test_rejects_dangling_new_flow_wire(self):
        exported = [{"id": "newtab", "type": "tab", "label": "Automation"},
                    {"id": "newnode", "type": "inject", "z": "newtab", "wires": [["missing"]]}]
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "flows.json"
            addition = Path(directory) / "export.json"
            target.write_text(json.dumps([{"id": "oldtab", "type": "tab", "label": "Existing"}]))
            addition.write_text(json.dumps(exported))
            with self.assertRaises(ValueError):
                merge_module.merge_flows(addition, target)


if __name__ == "__main__":
    unittest.main()
