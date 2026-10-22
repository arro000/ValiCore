"""Run from an independently installed wheel with copied runtime/data/fixtures."""
from copy import deepcopy
from contextlib import contextmanager
import ctypes
import gzip
import hashlib
import gc
import importlib.metadata
import inspect
import json
import os
from pathlib import Path
import sys
import shutil
import tempfile
import platform
import threading
import unittest
from unittest.mock import patch

import valicore
from valicore import ValiCoreError, create_valicore
from valicore._native import NativeLibrary

ROOT = Path(os.environ["VALICORE_PYTHON_RESOURCES"])
LIBRARY = ROOT / os.environ.get("VALICORE_PYTHON_LIBRARY", "libvalicore_abi.so")
DATASET = ROOT / "places.json.gz"
FISCAL = json.loads((ROOT / "fiscal-vectors.json").read_bytes())
VAT = json.loads((ROOT / "italian-vat-vectors.json").read_bytes())
REA = json.loads((ROOT / "italian-rea-vectors.json").read_bytes())
HISTORY = json.loads((ROOT / "birthplace-history-vectors.json").read_bytes())
PERSON = {"name": "Mario", "surname": "Rossi", "sex": "M", "birthDate": "1985-03-15", "birthplace": {"belfioreCode": "H501"}}
CODE = "RSSMRA85C15H501R"
OBSERVATIONS = {}


def golden(version="python-golden"):
    codes = sorted({row["person"]["birthplace"]["belfioreCode"] for row in FISCAL["vectors"]})
    return {"schemaVersion": 1, "version": version, "sources": {}, "coverage": {}, "places": [
        {"id": code, "sourceId": "independent-test", "sourceRecordId": code,
         "name": f"TEST {code}", "aliases": [],
         "kind": "foreign_country" if code.startswith("Z") else "municipality",
         "status": "active", "belfioreCode": code, "istatCode": None,
         "province": "EE" if code.startswith("Z") else "AA",
         "validFrom": None, "validTo": None, "birthAllowed": True} for code in codes]}


@contextmanager
def bundled_fixture_directory():
    # Windows keeps ctypes-loaded DLL images mapped until process exit, even
    # after every engine handle is disposed. The parent verifier owns these
    # resource fixtures and removes them after the child process has exited.
    directory = Path(tempfile.mkdtemp(prefix="valicore-bundled-test-", dir=ROOT))
    try:
        yield directory
    finally:
        if sys.platform != "win32":
            shutil.rmtree(directory)


class InstalledWrapperTests(unittest.TestCase):
    def engine(self, dataset=None):
        return create_valicore(library_path=LIBRARY, dataset=dataset)

    def error(self, expected, function, *args, **kwargs):
        with self.assertRaises(ValiCoreError) as caught:
            function(*args, **kwargs)
        self.assertEqual(caught.exception.code, expected)
        return caught.exception

    def test_package_is_installed_outside_source_and_versions_agree(self):
        source = Path(inspect.getfile(valicore)).resolve()
        self.assertIn("site-packages", source.parts)
        self.assertNotIn("packages/python/src", str(source))
        self.assertEqual(importlib.metadata.version("valicore"), "0.5.0b1")
        self.assertEqual(valicore.__version__, "0.5.0b1")
        self.assertTrue((source.parent / "py.typed").exists())
        with self.engine() as engine:
            self.assertEqual(engine.version_info()["engineVersion"], valicore._ENGINE_VERSION)
            self.assertEqual(engine.version_info()["runtimeApiMajor"], 8)
            self.assertEqual(engine.capabilities(), {"fiscalIdentity": True, "geoHistorical": False})
            self.assertIsNone(engine.version_info()["dataVersion"])
            self.assertEqual(engine.version_info()["sourceDates"], {})
            for name in ["validate_iban", "validate_italian_nre", "validate_ateco", "lookup_italian_aic"]:
                self.assertFalse(hasattr(engine, name))

    @contextmanager
    def bundled(self):
        with bundled_fixture_directory() as temporary:
            directory = Path(temporary)
            shutil.copyfile(LIBRARY, directory / LIBRARY.name)
            shutil.copyfile(DATASET, directory / DATASET.name)
            def reference(path):
                data = path.read_bytes()
                return {"url": path.name, "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}
            info = NativeLibrary(LIBRARY).request("info")
            dataset = json.loads(gzip.decompress(DATASET.read_bytes()))
            architecture = {"x86_64": "x64", "amd64": "x64", "aarch64": "arm64", "arm64": "arm64"}[platform.machine().lower()]
            manifest = {"formatVersion": 1, **info,
                        "runtime": {**reference(directory / LIBRARY.name), "platform": sys.platform, "architecture": architecture},
                        "datasets": {"geo": {**reference(directory / DATASET.name), "version": dataset["version"], "schemaVersion": dataset["schemaVersion"]}}}
            (directory / "manifest.json").write_text(json.dumps(manifest))
            with patch("valicore._bundle.BUNDLE_DIRECTORY", directory):
                yield directory, manifest

    def test_bundled_runtime_and_default_geography_are_local_and_independent(self):
        with self.bundled() as (directory, manifest):
            with create_valicore() as engine:
                self.assertEqual(engine.version_info()["origin"], "bundled")
                self.assertEqual(engine.version_info()["dataVersion"], manifest["datasets"]["geo"]["version"])
                self.assertEqual(engine.encode(PERSON), CODE)
                self.assertEqual(engine.resolve_place({"name": "Cattolica", "onDate": "1985-03-15"})["candidates"][0]["province"], "FO")
                self.assertEqual(engine.resolve_place({"name": "Cattolica", "onDate": "1992-04-16"})["candidates"][0]["province"], "RN")
            (directory / DATASET.name).unlink()
            with create_valicore(dataset=None) as engine:
                self.assertIsNone(engine.version_info()["dataVersion"])
                self.assertIsNone(engine.validate(CODE)["valid"])
                self.assertTrue(engine.validate(CODE, {"level": "calendar"})["valid"])
            with create_valicore(dataset=golden("bundled-custom")) as engine:
                self.assertEqual(engine.version_info()["dataVersion"], "bundled-custom")
                self.assertEqual(engine.encode(PERSON), CODE)

    def test_bundled_tampering_and_platform_identity_fail_before_native_loading(self):
        changes = [
            (lambda m: m.update(formatVersion=True), "INCOMPATIBLE_RUNTIME"),
            (lambda m: m.update(runtimeApiMajor=8.0), "INCOMPATIBLE_RUNTIME"),
            (lambda m: m.update(loaderProtocol=2.0), "INCOMPATIBLE_RUNTIME"),
            (lambda m: m.update(engineVersion="different"), "INCOMPATIBLE_RUNTIME"),
            (lambda m: m["runtime"].update(platform="other"), "INCOMPATIBLE_RUNTIME"),
            (lambda m: m["runtime"].update(architecture="other"), "INCOMPATIBLE_RUNTIME"),
            (lambda m: m["runtime"].update(url="../runtime.so"), "INVALID_BUNDLE"),
            (lambda m: m["runtime"].update(sha256="0" * 64), "HASH_MISMATCH"),
            (lambda m: m["runtime"].update(bytes=True), "INVALID_BUNDLE"),
            (lambda m: m["datasets"].update(geo=None), "INVALID_BUNDLE"),
            (lambda m: m["datasets"]["geo"].update(schemaVersion=True), "INVALID_BUNDLE"),
            (lambda m: m["datasets"]["geo"].update(sha256="0" * 64), "HASH_MISMATCH"),
        ]
        with self.bundled() as (directory, manifest):
            for change, expected in changes:
                altered = deepcopy(manifest)
                change(altered)
                (directory / "manifest.json").write_text(json.dumps(altered))
                with self.subTest(expected=expected), patch.object(NativeLibrary, "__init__", side_effect=AssertionError("Native loading must not happen")):
                    self.error(expected, create_valicore)

    def test_bundled_manifest_and_actual_native_data_identities_must_agree(self):
        with self.bundled() as (directory, manifest):
            altered = deepcopy(manifest)
            altered["components"] = ["fiscal"]
            (directory / "manifest.json").write_text(json.dumps(altered))
            self.error("INCOMPATIBLE_RUNTIME", create_valicore, dataset=None)
            altered = deepcopy(manifest)
            altered["datasets"]["geo"]["version"] = "wrong-edition"
            (directory / "manifest.json").write_text(json.dumps(altered))
            original, calls = NativeLibrary.request, []
            def tracked(transport, op, **arguments):
                calls.append(op)
                return original(transport, op, **arguments)
            with patch.object(NativeLibrary, "request", tracked):
                self.error("INCOMPATIBLE_DATASET", create_valicore)
            self.assertEqual(calls, ["info"])

    def test_component_expectations_are_unique_strings_before_handle_creation(self):
        with self.engine() as engine:
            components = engine.version_info()["components"]
        for selected in (list(reversed(components)), tuple(components)):
            with create_valicore(library_path=LIBRARY, components=selected) as engine:
                self.assertEqual(set(engine.version_info()["components"]), set(components))
        original, calls = NativeLibrary.request, []
        def tracked(transport, op, **arguments):
            calls.append(op)
            return original(transport, op, **arguments)
        for selected in [[], "fiscal", {}, [None], [1], [True], [[]], [{}], [""], [*components, components[0]], [*components, []], ["unknown"]]:
            calls.clear()
            with self.subTest(components=selected), patch.object(NativeLibrary, "request", tracked):
                self.assertEqual(self.error("INCOMPATIBLE_RUNTIME", create_valicore, library_path=LIBRARY, components=selected).field, "components")
            self.assertEqual(calls, ["info"])

    def test_independent_fiscal_corpus_with_and_without_custom_catalog(self):
        for dataset in [None, golden()]:
            with self.engine(dataset) as engine:
                for row in FISCAL["vectors"]:
                    self.assertEqual(engine.encode(row["person"]), row["code"], row["id"])
                    self.assertEqual(engine.to_base(row["code"]), row["baseCode"])
                    year = int(row["person"]["birthDate"][:4])
                    decoded = engine.decode(row["code"], {"yearRange": [year, year]})
                    self.assertEqual(decoded["candidateDates"], [row["person"]["birthDate"]])
                    for field in ["sex", "nameCode", "surnameCode"]:
                        self.assertEqual(decoded[field], row["person"][field] if field == "sex" else row[field])
                    self.assertTrue(engine.is_valid(row["code"], {"level": "calendar"}))
                    self.assertTrue(engine.matches_person(row["code"], row["person"])["matches"])
                    self.assertTrue(engine.same_base(row["code"], row["baseCode"]))
                for row in FISCAL["decodeCases"]:
                    if "error" in row:
                        self.error(row["error"], engine.decode, row["code"], row["options"])
                    else:
                        decoded = engine.decode(row["code"], row["options"])
                        for field, value in row["expected"].items():
                            self.assertEqual(decoded[field], value, (row["code"], field))
                for row in FISCAL["names"]:
                    self.assertEqual(engine.name_code(row["input"]), row["nameCode"])
                    self.assertEqual(engine.surname_code(row["input"]), row["surnameCode"])
                for row in FISCAL["checksums"]:
                    self.assertEqual(engine.checksum(row["body"]), row["expected"])
                for row in FISCAL["numericChecksums"]:
                    self.assertEqual(engine.numeric_checksum(row["body"]), row["expected"])
                    for digit in range(10):
                        self.assertEqual(engine.is_valid(row["body"] + str(digit)), str(digit) == row["expected"])
                codes = engine.omocodes(CODE)
                self.assertEqual(len(codes), 128)
                self.assertEqual(len(set(codes)), 128)
                self.assertEqual(len(engine.omocodes(CODE, include_base=False)), 127)
                for mask, code in enumerate(codes):
                    self.assertEqual(engine.to_omocode(CODE, mask), code)
                    self.assertEqual(engine.omocodia_mask(code), mask)
                    self.assertEqual(engine.is_omocode(code), mask != 0)

    def test_vat_independent_corpus(self):
        for dataset in [None, golden()]:
            with self.engine(dataset) as engine:
                for row in VAT["valid"]:
                    for prefix in ["", "IT", "it"]:
                        report = engine.validate_italian_vat(prefix + row["input"])
                        self.assertIs(report["valid"], True)
                        self.assertEqual(report["vat"], row["vat"])
                        self.assertEqual(report["scope"], "format_checksum")
                        self.assertEqual(report["checks"][2]["status"], "not_run")
                for row in VAT["invalid"]:
                    report = engine.validate_italian_vat(row["input"])
                    self.assertIs(report["valid"], False)
                    failed = next(c for c in report["checks"] if c["status"] == "fail")
                    self.assertEqual(failed["error"]["code"], row["error"])

    def test_rea_presentation_with_and_without_catalog(self):
        for dataset in [None, golden()]:
            with self.engine(dataset) as engine:
                for row in REA["valid"]:
                    report = engine.validate_italian_rea(row["input"])
                    self.assertTrue(report["valid"])
                    for field in ["rea", "provinceCode", "serialNumber"]:
                        self.assertEqual(report[field], row[field])
                    self.assertEqual(report["scope"], "presentation_format")
                    self.assertEqual(report["checks"][1]["status"], "not_run")
                for row in REA["invalid"]:
                    report = engine.validate_italian_rea(row["input"])
                    self.assertFalse(report["valid"])
                    self.assertEqual(report["checks"][0]["error"]["code"], row["error"])
                for value in [None, 42, False, [], {}]:
                    self.assertEqual(self.error("INVALID_ARGUMENT", engine.validate_italian_rea, value).field, "rea")
            self.error("ENGINE_DISPOSED", engine.validate_italian_rea, "RM-123456")

    def test_candidate_birthplace_history_is_separate_from_fiscal_validity(self):
        for case in HISTORY["cases"]:
            dataset = {"schemaVersion": 1, "version": "python-history", "sources": {}, "coverage": {}, "places": case["records"]}
            with self.engine(dataset) as engine:
                report = engine.birthplace_history(case["code"])
                self.assertEqual(report["scope"], "administrative_birthplace_history")
                self.assertEqual(report["allocationCheck"]["status"], "not_run")
                self.assertEqual(report["decoded"]["candidateDates"], engine.decode(case["code"])["candidateDates"])
                self.assertEqual([{key: value for key, value in row.items() if key != "error"} for row in report["candidates"]], case["candidates"])
                report["records"][0]["id"] = "caller edit"
                self.assertNotEqual(engine.birthplace_history(case["code"])["records"][0]["id"], "caller edit")
        with self.engine() as engine:
            report = engine.birthplace_history(CODE)
            self.assertEqual(len(report["candidates"]), 100)
            self.assertTrue(all(row["compatible"] is None and row["error"]["code"] == "CAPABILITY_UNAVAILABLE" for row in report["candidates"]))
            self.assertTrue(engine.validate(CODE, {"level": "calendar"})["valid"])
            for code in engine.omocodes(CODE):
                self.assertEqual(engine.birthplace_history(code)["decoded"]["candidateDates"], report["decoded"]["candidateDates"])
            for value in [None, True, 42, [], {}]:
                self.error("INVALID_ARGUMENT", engine.birthplace_history, value)
            for options in [[], True, {"onDate": "1985-03-15"}, {"yearRange": [1985.5, 1986]}]:
                self.error("INVALID_ARGUMENT", engine.birthplace_history, CODE, options)
        self.error("ENGINE_DISPOSED", engine.birthplace_history, CODE)

    def test_official_gzip_catalog_history_and_geographic_operations(self):
        with self.engine(DATASET) as engine:
            self.assertTrue(engine.capabilities()["geoHistorical"])
            self.assertEqual(engine.encode(PERSON), CODE)
            self.assertTrue(engine.is_valid(CODE))
            self.assertIsNotNone(engine.version_info()["dataVersion"])
            self.assertGreater(engine.dataset_info()["placeCount"], 0)
            self.assertEqual(engine.resolve_place({"belfioreCode": "C357", "onDate": "1985-03-15"})["candidates"][0]["province"], "FO")
            provinces = engine.list_provinces({"onDate": "1985-03-15"})
            self.assertTrue(any(p["code"] == "FO" and p["placeCount"] > 0 for p in provinces))
            self.assertFalse(any(p["code"] == "RN" for p in provinces))
            self.assertTrue(any(p["belfioreCode"] == "H501" for p in engine.search_places("Roma", {"province": "RM"})))
            self.assertEqual(engine.resolve_place({"belfioreCode": "G015", "onDate": "2026-01-01"})["candidates"][0]["province"], "OT")

    def test_no_catalog_is_indeterminate_not_a_silent_constraint_drop(self):
        with self.engine() as engine:
            report = engine.validate(CODE)
            self.assertIsNone(report["valid"])
            self.assertEqual(report["checks"][3]["error"]["code"], "CAPABILITY_UNAVAILABLE")
            self.assertFalse(engine.is_valid(CODE))
            self.assertTrue(engine.is_valid(CODE, {"level": "calendar"}))
            self.assertEqual(engine.decode(CODE)["places"], [])
            self.assertIsNone(engine.decode(CODE)["dataVersion"])
            for function, args in [(engine.dataset_info, ()), (engine.search_places, ("Roma",)), (engine.list_provinces, ()), (engine.resolve_place, ({"name": "Roma"},))]:
                self.error("CAPABILITY_UNAVAILABLE", function, *args)
            person = deepcopy(PERSON)
            person["birthplace"]["province"] = "RM"
            self.error("CAPABILITY_UNAVAILABLE", engine.encode, person)

    def test_structured_errors_and_strict_argument_boundaries(self):
        with self.engine() as engine:
            for function in [engine.validate_italian_vat, engine.name_code, engine.surname_code, engine.validate, engine.decode]:
                for value in [None, True, 42, 1.5, [], {}, float("nan"), float("inf"), float("-inf"), object(), "\ud800"]:
                    self.error("INVALID_ARGUMENT", function, value)
            for options in [[], 42, True, {"unexpected": True}]:
                self.error("INVALID_ARGUMENT", engine.validate, CODE, options)
            for mask in [-1, 128, 1.5, 1.0, True, None, "1"]:
                self.error("INVALID_MASK", engine.to_omocode, CODE, mask)
            for value in [None, 0, 1, "false", [], {}]:
                self.error("INVALID_ARGUMENT", engine.omocodes, CODE, include_base=value)
            error = self.error("INVALID_ARGUMENT", engine.validate_italian_vat, 6363391001)
            self.assertEqual(error.field, "vat")
            self.assertEqual(error.as_dict(), {"code": error.code, "message": error.message, "field": "vat"})
            self.assertEqual(str(error), error.message)
            bad_date = deepcopy(PERSON)
            bad_date["birthDate"] = "1900-02-29"
            self.error("INVALID_DATE", engine.encode, bad_date)
            self.error("UNSUPPORTED_NAME_CHARACTER", engine.name_code, "中")

    def test_custom_snapshots_returned_objects_and_disposal_are_isolated(self):
        dataset = golden("first")
        with self.engine(dataset) as first, self.engine(golden("second")) as second:
            dataset["version"] = "mutated input"
            dataset["places"].clear()
            versions = first.version_info()
            versions["modules"].clear()
            versions["sourceDates"]["fake"] = "2099-01-01"
            first.capabilities()["fiscalIdentity"] = False
            self.assertEqual(first.version_info()["dataVersion"], "first")
            self.assertEqual(second.version_info()["dataVersion"], "second")
            self.assertEqual(first.version_info()["modules"], ["fiscal_identity", "geo_historical"])
            self.assertNotIn("fake", first.version_info()["sourceDates"])
            self.assertTrue(first.capabilities()["fiscalIdentity"])
            first.dispose()
            first.dispose()
            self.assertEqual(second.encode(PERSON), CODE)
            for function, args in [(first.checksum, (CODE[:15],)), (first.version_info, ()), (first.capabilities, ()), (first.validate_italian_vat, ("06363391001",)), (first.__enter__, ())]:
                self.error("ENGINE_DISPOSED", function, *args)
        for sources in [None, [], {"unknown": False}, {"source": {"referenceDate": None}}, {"source": {"referenceDate": 42}}]:
            dataset = golden()
            dataset["sources"] = sources
            with self.engine(dataset) as engine:
                self.assertEqual(engine.dataset_info()["sources"], sources)
                self.assertTrue(all(value is None for value in engine.version_info()["sourceDates"].values()))

    def test_context_disposes_after_user_exception_and_constructor_failure(self):
        engine = self.engine()
        handle = engine._handle
        with self.assertRaisesRegex(RuntimeError, "user exception"):
            with engine:
                raise RuntimeError("user exception")
        self.error("ENGINE_DISPOSED", engine.checksum, CODE[:15])
        self.error("INVALID_HANDLE", engine._transport.request, "capabilities", handle=handle)
        original, handles = NativeLibrary.request, []
        def fail_after_creation(transport, op, **arguments):
            result = original(transport, op, **arguments)
            if op == "create":
                handles.append((transport, result))
            if op == "datasetInfo":
                raise ValiCoreError("TEST_FAILURE", "Injected host failure after successful creation")
            return result
        with patch.object(NativeLibrary, "request", fail_after_creation):
            self.error("TEST_FAILURE", self.engine, golden())
        self.assertEqual(len(handles), 1)
        self.error("INVALID_HANDLE", handles[0][0].request, "capabilities", handle=handles[0][1])

    def test_wrong_thread_rejected_before_dispatch_and_worker_handles_independent(self):
        with self.engine(golden("owner")) as engine:
            calls, errors, outcomes = [], [], []
            request = engine._transport.request
            engine._transport.request = lambda *a, **kw: (calls.append(threading.current_thread()), request(*a, **kw))[1]
            def worker():
                try:
                    for function in [lambda: engine.checksum(CODE[:15]), engine.version_info, engine.capabilities, engine.dispose]:
                        try:
                            function()
                        except ValiCoreError as error:
                            outcomes.append(error.code)
                    with self.engine(golden("worker")) as own:
                        outcomes.extend([own.version_info()["dataVersion"], own.encode(PERSON)])
                except BaseException as error:
                    errors.append(error)
            thread = threading.Thread(target=worker)
            thread.start()
            thread.join()
            self.assertEqual(errors, [])
            self.assertEqual(outcomes, ["WRONG_THREAD"] * 4 + ["worker", CODE])
            self.assertEqual(calls, [])
            self.assertEqual(engine.version_info()["dataVersion"], "owner")
            self.assertEqual(engine.encode(PERSON), CODE)

    def test_loading_failures_and_runtime_identity_fail_closed(self):
        for path in [ROOT / "missing.so", ROOT / "invalid.so", ROOT]:
            self.error("RUNTIME_LOAD_FAILED", create_valicore, library_path=path)
        with patch("valicore._bundle.BUNDLE_DIRECTORY", ROOT / "missing-bundle"):
            self.error("BUNDLED_RUNTIME_UNAVAILABLE", create_valicore)
            self.error("BUNDLED_RUNTIME_UNAVAILABLE", create_valicore, library_path=None)
        for dataset in [ROOT / "missing.json", ROOT / "bad.json", ROOT / "bad.json.gz"]:
            self.error("DATASET_LOAD_FAILED", self.engine, dataset)
        for dataset in [False, [], 42, {"schemaVersion": 1}]:
            self.error("INVALID_ARGUMENT", self.engine, dataset)
        bad = golden()
        bad["schemaVersion"] = 2
        self.error("INCOMPATIBLE_DATASET", self.engine, bad)
        original = NativeLibrary.request
        for changes in [{"runtimeName": "OtherEngine"}, *[{"runtimeApiMajor": value} for value in [3, 4, 7, 8.0, True]], {"loaderProtocol": 2.0}]:
            def wrong_identity(transport, op, **arguments):
                result = original(transport, op, **arguments)
                if op == "info":
                    result.update(changes)
                return result
            with patch.object(NativeLibrary, "request", wrong_identity):
                self.error("INCOMPATIBLE_RUNTIME", self.engine)

    def test_exact_buffer_lengths_and_cleanup_on_all_response_paths(self):
        live, counts = {}, {"alloc": 0, "free": 0}
        original_init = NativeLibrary.__init__
        def tracked_init(transport, path):
            original_init(transport, path)
            allocate, invoke, release = transport._alloc, transport._invoke, transport._dealloc
            def alloc(length):
                pointer = allocate(length)
                self.assertNotIn(pointer, live)
                live[pointer] = length
                counts["alloc"] += 1
                return pointer
            def call(pointer, length, out_length):
                self.assertEqual(live[pointer], length)
                output = invoke(pointer, length, out_length)
                size = ctypes.cast(out_length, ctypes.POINTER(ctypes.c_uint32)).contents.value
                self.assertNotIn(output, live)
                live[output] = size
                counts["alloc"] += 1
                return output
            def free(pointer, length):
                self.assertEqual(live.pop(pointer), length)
                counts["free"] += 1
                release(pointer, length)
            transport._alloc, transport._invoke, transport._dealloc = alloc, call, free
        with patch.object(NativeLibrary, "__init__", tracked_init):
            for _ in range(20):
                with self.engine() as engine:
                    self.assertEqual(engine.checksum(CODE[:15]), CODE[15])
                    self.error("INVALID_ARGUMENT", engine.validate_italian_vat, [])
                    self.error("INVALID_CHECKSUM", engine.decode, CODE[:15] + "A")
                    with patch("valicore._native.json.loads", side_effect=ValueError("Injected decoding failure")):
                        self.error("INVALID_ABI_RESPONSE", engine.capabilities)
                    with patch("valicore._native.ctypes.string_at", side_effect=MemoryError("Injected copy failure")):
                        with self.assertRaises(MemoryError):
                            engine.capabilities()
                    self.assertEqual(live, {})
            for _ in range(5):
                with self.engine(golden()) as engine:
                    self.assertEqual(engine.encode(PERSON), CODE)
                    self.error("INVALID_ARGUMENT", engine.resolve_place, [])
                    self.assertEqual(live, {})
            self.error("INVALID_ARGUMENT", self.engine, [])
            bad = golden()
            bad["schemaVersion"] = 2
            self.error("INCOMPATIBLE_DATASET", self.engine, bad)
        self.assertEqual(live, {})
        self.assertEqual(counts["alloc"], counts["free"])
        self.assertGreater(counts["alloc"], 200)
        OBSERVATIONS["trackedBufferAllocations"] = counts["alloc"]
        OBSERVATIONS["trackedBufferFrees"] = counts["free"]

    @unittest.skipUnless(Path("/proc/self/status").exists(), "Linux RSS observation")
    def test_repeated_full_catalog_creation_disposal_has_bounded_rss(self):
        def rss():
            for line in Path("/proc/self/status").read_text().splitlines():
                if line.startswith("VmRSS:"):
                    return int(line.split()[1]) * 1024
            raise AssertionError("VmRSS unavailable")
        def cycle():
            with self.engine(DATASET) as engine:
                self.assertEqual(engine.encode(PERSON), CODE)
            gc.collect()
        for _ in range(5):
            cycle()
        baseline = rss()
        observations = []
        for _ in range(20):
            cycle()
            observations.append(rss())
        self.assertLessEqual(max(observations) - baseline, 32 * 1024 * 1024)
        OBSERVATIONS["disposalRss"] = {"warmupCycles": 5, "cycles": 20, "baselineBytes": baseline, "peakBytes": max(observations), "toleranceBytes": 32 * 1024 * 1024}


if __name__ == "__main__":
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(InstalledWrapperTests))
    Path(os.environ["VALICORE_PYTHON_TEST_REPORT"]).write_text(json.dumps({"testsRun": result.testsRun, "failures": len(result.failures), "errors": len(result.errors), "skipped": len(result.skipped), "passed": result.wasSuccessful(), **OBSERVATIONS}, indent=2) + "\n")
    sys.exit(0 if result.wasSuccessful() else 1)
