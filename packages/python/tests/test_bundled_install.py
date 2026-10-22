"""Run only from an independently installed runtime-inclusive platform wheel."""
import hashlib
import importlib.metadata
import inspect
import json
import os
from pathlib import Path
import socket
import sys
import threading
import unittest
from unittest.mock import patch

import valicore
from valicore import ValiCoreError, create_valicore
from valicore import _bundle

PERSON = {"name": "Mario", "surname": "Rossi", "sex": "M", "birthDate": "1985-03-15", "birthplace": {"belfioreCode": "H501"}}
CODE = "RSSMRA85C15H501R"
PACKAGE = Path(inspect.getfile(valicore)).parent
MANIFEST = json.loads((PACKAGE / "bundled/manifest.json").read_bytes())


class BundledInstallTests(unittest.TestCase):
    def test_real_platform_payload_and_code_notices_are_installed(self):
        self.assertIn("site-packages", str(PACKAGE))
        self.assertNotIn("packages/python/src", str(PACKAGE))
        self.assertEqual(importlib.metadata.version("valicore"), valicore.__version__)
        self.assertEqual(MANIFEST["components"], ["fiscal", "geo"])
        self.assertEqual(MANIFEST["runtimeApiMajor"], 8)
        self.assertEqual(MANIFEST["engineVersion"], valicore._ENGINE_VERSION)
        self.assertEqual(MANIFEST["runtime"]["platform"], sys.platform)
        self.assertTrue((PACKAGE / "bundled" / MANIFEST["runtime"]["url"]).is_file())
        self.assertTrue((PACKAGE / "bundled/DATA-NOTICE.md").is_file())
        index = PACKAGE / "bundled" / MANIFEST["notices"]["url"]
        self.assertEqual(hashlib.sha256(index.read_bytes()).hexdigest(), MANIFEST["notices"]["sha256"])
        inventory = json.loads(index.read_bytes())
        self.assertTrue(any(entry["url"] == "rust/COPYRIGHT-library.html" for entry in inventory["files"]))
        for entry in inventory["files"]:
            data = (index.parent / entry["url"]).read_bytes()
            self.assertEqual(len(data), entry["bytes"])
            self.assertEqual(hashlib.sha256(data).hexdigest(), entry["sha256"])
        distribution = importlib.metadata.distribution("valicore")
        wheel = distribution.read_text("WHEEL")
        self.assertIn("Root-Is-Purelib: false", wheel)
        self.assertIn("Tag: py3-none-", wheel)
        self.assertNotIn("Tag: py3-none-any", wheel)

    def test_zero_configuration_loads_native_and_dated_history_without_network(self):
        with patch.object(socket, "socket", side_effect=AssertionError("Network is forbidden")):
            with create_valicore() as engine:
                self.assertEqual(engine.version_info()["origin"], "bundled")
                self.assertEqual(engine.version_info()["dataVersion"], MANIFEST["datasets"]["geo"]["version"])
                self.assertEqual(engine.encode(PERSON), CODE)
                self.assertTrue(engine.validate(CODE)["valid"])
                self.assertEqual(engine.resolve_place({"name": "Cattolica", "onDate": "1985-03-15"})["candidates"][0]["province"], "FO")
                self.assertEqual(engine.resolve_place({"name": "Cattolica", "onDate": "1992-04-16"})["candidates"][0]["province"], "RN")
                self.assertEqual(engine.capabilities(), {"fiscalIdentity": True, "geoHistorical": True})
                self.assertEqual(engine.version_info()["engineVersion"], "0.5.0-beta.1")
                for name in ["parse_iban", "validate_italian_nre", "validate_ateco", "lookup_italian_aic"]:
                    self.assertFalse(hasattr(engine, name))

    def test_explicit_data_disable_and_custom_snapshots_do_not_read_bundled_geography(self):
        read = _bundle._resource
        reads = []
        def tracked(directory, reference):
            reads.append(reference["url"])
            return read(directory, reference)
        with patch.object(_bundle, "_resource", tracked):
            with create_valicore(dataset=None) as engine:
                self.assertIsNone(engine.version_info()["dataVersion"])
                self.assertIsNone(engine.validate(CODE)["valid"])
                self.assertTrue(engine.validate(CODE, {"level": "calendar"})["valid"])
                self.assertEqual(engine.encode(PERSON), CODE)
            custom = {"schemaVersion": 1, "version": "custom-empty", "sources": {}, "coverage": {}, "places": []}
            with create_valicore(dataset=custom) as engine:
                custom["version"] = "mutated"
                self.assertEqual(engine.version_info()["dataVersion"], "custom-empty")
        self.assertNotIn(MANIFEST["datasets"]["geo"]["url"], reads)

    def test_independent_fiscal_corpus_and_all_masks_use_the_bundled_runtime(self):
        corpus = json.loads(Path(os.environ["VALICORE_BUNDLED_FISCAL_CORPUS"]).read_bytes())
        with create_valicore(dataset=None, components=["geo", "fiscal"]) as engine:
            for row in corpus["vectors"]:
                self.assertEqual(engine.encode(row["person"]), row["code"])
                self.assertTrue(engine.validate(row["code"], {"level": "calendar"})["valid"])
            for row in corpus["vectors"][:16]:
                codes = engine.omocodes(row["code"])
                self.assertEqual(len(set(codes)), 128)
                for mask, code in enumerate(codes):
                    self.assertEqual(engine.omocodia_mask(code), mask)
                    self.assertEqual(engine.to_base(code), row["baseCode"])

    def test_thread_affinity_disposal_and_wrong_composition_are_preserved(self):
        engine = create_valicore(dataset=None)
        errors = []
        def worker():
            for call in [engine.version_info, engine.dispose]:
                try:
                    call()
                except ValiCoreError as error:
                    errors.append(error.code)
        thread = threading.Thread(target=worker)
        thread.start()
        thread.join()
        self.assertEqual(errors, ["WRONG_THREAD", "WRONG_THREAD"])
        engine.dispose()
        engine.dispose()
        with self.assertRaises(ValiCoreError) as caught:
            engine.encode(PERSON)
        self.assertEqual(caught.exception.code, "ENGINE_DISPOSED")
        with self.assertRaises(ValiCoreError) as caught:
            create_valicore(components=["fiscal"])
        self.assertEqual(caught.exception.code, "INCOMPATIBLE_RUNTIME")


if __name__ == "__main__":
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(BundledInstallTests))
    report = {"passed": result.wasSuccessful(), "testsRun": result.testsRun,
              "failures": len(result.failures), "errors": len(result.errors), "skipped": len(result.skipped)}
    Path(os.environ["VALICORE_BUNDLED_TEST_REPORT"]).write_text(json.dumps(report, indent=2) + "\n")
    raise SystemExit(0 if result.wasSuccessful() else 1)
