"""Offline checks for the geographic permission evidence shipped with source."""
import gzip
import hashlib
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]


class LicenseEvidenceTests(unittest.TestCase):
    def test_original_pages_match_their_declared_decoded_hashes(self):
        directory = ROOT / "data/reference/licenses"
        inventory = json.loads((directory / "index.json").read_text())
        self.assertEqual(inventory["formatVersion"], 1)
        self.assertEqual(len(inventory["evidence"]), 3)
        for entry in inventory["evidence"]:
            with self.subTest(provider=entry["provider"]):
                name = entry["file"]
                self.assertEqual(Path(name).name, name)
                content = gzip.decompress((directory / name).read_bytes())
                self.assertEqual(hashlib.sha256(content).hexdigest(), entry["decodedSha256"])
                self.assertTrue(entry["url"].startswith("https://"))

    def test_unresolved_terms_are_not_presented_as_cleared(self):
        inventory = json.loads((ROOT / "data/reference/licenses/index.json").read_text())
        ade = next(row for row in inventory["evidence"] if row["provider"] == "Agenzia delle Entrate")
        self.assertIn("remain pending", ade["finding"])
        documentation = (ROOT / "docs/DATA-LICENSES.md").read_text()
        self.assertIn("ADE terms remain unresolved", documentation)
        self.assertIn("Public\nconsultability is not a redistribution grant", documentation)


if __name__ == "__main__":
    unittest.main()
