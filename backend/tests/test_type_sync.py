import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
from app import lifecycle

DTO = ROOT / "frontend" / "src" / "common" / "dto" / "FurnitureDTO.ts"


def ts_array(name):
    source = DTO.read_text(encoding="utf-8")
    match = re.search(rf"export const {name} = \[(.*?)\] as const", source, re.S)
    if not match:
        raise AssertionError(f"{name} not found in {DTO}")
    return re.findall(r'"([a-z_]+)"', match.group(1))


class TypeSyncTests(unittest.TestCase):
    def test_furniture_statuses_match(self):
        self.assertEqual(ts_array("FURNITURE_STATUSES"), list(lifecycle.STATUSES))

    def test_donor_stages_match(self):
        self.assertEqual(ts_array("DONOR_STAGES"), list(lifecycle.DONOR_STAGES))


if __name__ == "__main__":
    unittest.main()
