"""Safely append a Node-RED export without replacing existing flows."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def _load(path: Path) -> list[dict[str, Any]]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, list) or any(not isinstance(node, dict) or not isinstance(node.get("id"), str) for node in value):
        raise ValueError(f"{path} must contain a Node-RED array with string IDs")
    ids = [node["id"] for node in value]
    if len(ids) != len(set(ids)):
        raise ValueError(f"{path} contains duplicate IDs")
    return value


def _validate_new_wires(addition: list[dict[str, Any]], existing_ids: set[str]) -> None:
    all_ids = existing_ids | {node["id"] for node in addition}
    for node in addition:
        for group in node.get("wires", []):
            for target in group:
                if target not in all_ids:
                    raise ValueError(f"Node {node['id']} references missing wire target {target}")
        parent = node.get("z")
        if parent and parent not in all_ids:
            raise ValueError(f"Node {node['id']} references missing flow/tab {parent}")


def merge_flows(export_path: Path, target_path: Path) -> dict[str, Any]:
    existing = _load(target_path)
    addition = _load(export_path)
    old_ids = {node["id"] for node in existing}
    new_ids = {node["id"] for node in addition}
    if new_ids <= old_ids:
        return {"status": "already_present", "added": 0, "total": len(existing)}
    collisions = old_ids & new_ids
    if collisions:
        raise ValueError(f"Partial ID collision; refusing merge: {sorted(collisions)}")
    _validate_new_wires(addition, old_ids)
    merged = existing + addition
    tmp = target_path.with_suffix(target_path.suffix + ".tmp")
    tmp.write_text(json.dumps(merged, indent=2) + "\n", encoding="utf-8")
    tmp.replace(target_path)
    return {"status": "appended", "added": len(addition), "total": len(merged)}


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("export", type=Path)
    parser.add_argument("target", type=Path)
    args = parser.parse_args()
    print(json.dumps(merge_flows(args.export, args.target)))
