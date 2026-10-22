#!/usr/bin/env python3
"""Build/install a real offline wheel and verify it outside the source checkout.

Prerequisites: Python 3.12+, pip, setuptools >=77, venv/ensurepip and a freshly
built Linux native library. No registry/source download or PyPI publication.
"""
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import venv
import zipfile

ROOT = Path(__file__).resolve().parents[1]
STAMP = datetime.now(timezone.utc).isoformat().replace(":", "-").replace(".", "-")
WORK = Path("/tmp/opencode/valicore-python") / STAMP
WORK.mkdir(parents=True)
REPORTS = ROOT / "verification-reports"
REPORTS.mkdir(exist_ok=True)
report = {
    "startedAt": datetime.now(timezone.utc).isoformat(),
    "revision": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
    "workingTreeDirty": bool(subprocess.check_output(["git", "status", "--porcelain"], cwd=ROOT, text=True).strip()),
    "pythonVersion": sys.version, "platform": sys.platform, "consumerDirectory": str(WORK / "consumer"),
    "passed": False,
}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(command, cwd=WORK, env=None):
    print("[Python]", " ".join(map(str, command)), flush=True)
    subprocess.run(list(map(str, command)), cwd=cwd, env=env, check=True)


try:
    # Build prerequisites are explicit; do not silently download packages in an
    # otherwise offline gate or depend on globally installed ValiCore imports.
    backend_version = importlib.metadata.version("setuptools")
    if int(backend_version.split(".")[0]) < 77:
        raise RuntimeError("Building the Python package requires setuptools >=77")
    report["setuptoolsVersion"] = backend_version
    run([sys.executable, "-m", "unittest", "discover", "-s", "tools/tests", "-p", "test_python_wheel.py", "-v"], cwd=ROOT)
    source = WORK / "package-source"
    shutil.copytree(ROOT / "packages/python", source,
                    ignore=shutil.ignore_patterns("__pycache__", "*.egg-info", "build", "dist"))
    wheels = WORK / "wheels"
    wheels.mkdir()
    run([sys.executable, "-m", "pip", "--disable-pip-version-check", "wheel", "--no-index",
         "--no-deps", "--no-build-isolation", source, "--wheel-dir", wheels])
    matches = list(wheels.glob("valicore-*.whl"))
    if len(matches) != 1:
        raise RuntimeError("Expected exactly one locally built ValiCore wheel")
    wheel = matches[0]
    report["wheel"] = {"path": str(wheel), "sha256": sha(wheel), "bytes": wheel.stat().st_size}
    consumer = WORK / "consumer"
    resources = consumer / "resources"
    resources.mkdir(parents=True)
    venv.EnvBuilder(with_pip=True).create(consumer / ".venv")
    python = consumer / ".venv/bin/python"
    run([python, "-I", "-m", "pip", "--disable-pip-version-check", "install", "--no-index",
         "--no-deps", wheel], cwd=consumer)
    state = json.loads((ROOT / "data/state.json").read_text())
    library = ROOT / "target/release/libvalicore_abi.so"
    shutil.copyfile(library, resources / library.name)
    shutil.copyfile(ROOT / "data" / state["snapshot"], resources / "places.json.gz")
    report["nativeRuntimeSha256"] = sha(library)
    report["dataset"] = {"version": state["version"], "gzipSha256": sha(resources / "places.json.gz")}
    report["corpora"] = {}
    for filename in ["fiscal-vectors.json", "italian-vat-vectors.json", "italian-rea-vectors.json", "birthplace-history-vectors.json"]:
        target = resources / filename
        shutil.copyfile(ROOT / "tests/fixtures" / filename, target)
        report["corpora"][filename] = sha(target)
    for filename, data in [("invalid.so", b"not a shared library"), ("bad.json", b"{"),
                           ("bad.json.gz", b"not gzip")]:
        (resources / filename).write_bytes(data)
    test_file = consumer / "test_valicore.py"
    shutil.copyfile(ROOT / "packages/python/tests/test_valicore.py", test_file)
    test_report = consumer / "test-report.json"
    env = {**os.environ, "VALICORE_PYTHON_RESOURCES": str(resources),
           "VALICORE_PYTHON_TEST_REPORT": str(test_report)}
    env.pop("PYTHONPATH", None)
    env.pop("PYTHONHOME", None)
    try:
        run([python, "-I", test_file], cwd=consumer, env=env)
    finally:
        if test_report.exists():
            report["tests"] = json.loads(test_report.read_text())
    example = consumer / "offline.py"
    shutil.copyfile(ROOT / "packages/python/examples/offline.py", example)
    for options in [[], ["--dataset", resources / "places.json.gz"]]:
        run([python, "-I", example, "--library", resources / library.name, *options], cwd=consumer)
    report["examplesExecuted"] = 2
    # Selected native composition through the same installed wheel: a fiscal-only
    # runtime must expose only its own operations and reject other components.
    composition_target = WORK / "composition-target"
    run(["cargo", "build", "--locked", "--release", "-p", "valicore-abi", "--no-default-features",
         "--features", "fiscal", "--target-dir", composition_target], cwd=ROOT)
    fiscal_library = resources / "libvalicore_fiscal.so"
    shutil.copyfile(composition_target / "release" / "libvalicore_abi.so", fiscal_library)
    report["fiscalRuntimeSha256"] = sha(fiscal_library)
    composition_check = consumer / "composition_check.py"
    composition_check.write_text(
        "import json, os, sys\n"
        "from valicore import ValiCoreError, create_valicore\n"
        "library = os.path.join(os.environ['VALICORE_PYTHON_RESOURCES'], 'libvalicore_fiscal.so')\n"
        "person = {'name': 'Mario', 'surname': 'Rossi', 'sex': 'M', 'birthDate': '1985-03-15', 'birthplace': {'belfioreCode': 'H501'}}\n"
        "engine = create_valicore(library_path=library, components=['fiscal'])\n"
        "assert engine.encode(person) == 'RSSMRA85C15H501R'\n"
        "assert engine.version_info()['components'] == ['fiscal']\n"
        "assert engine.validate_italian_vat('IT06363391001')['valid'] is True\n"
        "for call in [lambda: engine.search_places('Roma'), engine.dataset_info]:\n"
        "    try:\n        call(); raise SystemExit('excluded operation stayed available')\n"
        "    except ValiCoreError as error:\n        assert error.code == 'COMPONENT_UNAVAILABLE', error.code\n"
        "try:\n"
        "    create_valicore(library_path=library, components=['fiscal', 'geo'])\n"
        "    raise SystemExit('component expectation mismatch was accepted')\n"
        "except ValiCoreError as error:\n"
        "    assert error.code == 'INCOMPATIBLE_RUNTIME'\n"
        "components = engine.version_info()['components']\n"
        "engine.dispose()\n"
        "print(json.dumps({'composition': components}))\n")
    run([python, "-I", composition_check], cwd=consumer, env=env)
    report["compositionExecuted"] = True
    # A separate platform wheel must work without supplied library/data paths.
    # Keep the transport-only wheel above as a supported custom-runtime mode.
    bundled_config = WORK / "bundled-config.json"
    bundled_config.write_text(json.dumps({"configVersion": 1, "components": ["fiscal", "geo"], "datasets": []}))
    bundled_composition = WORK / "bundled-native"
    run(["node", ROOT / "tools/compose.mjs", "--config", bundled_config, "--target", "native", "--compile",
         "--source", ROOT, "--cargo-target-directory", composition_target, "--output", bundled_composition], cwd=ROOT)
    bundled_wheels = WORK / "bundled-wheels"
    run([sys.executable, ROOT / "tools/build_python_wheel.py", "--composition", bundled_composition,
         "--geo", ROOT / "data" / state["snapshot"], "--output", bundled_wheels], cwd=ROOT)
    bundled_matches = list(bundled_wheels.glob("valicore-*.whl"))
    if len(bundled_matches) != 1:
        raise RuntimeError("Expected one runtime-inclusive platform wheel")
    bundled_wheel = bundled_matches[0]
    with zipfile.ZipFile(bundled_wheel) as archive:
        packaged = json.loads(archive.read("valicore/bundled/manifest.json"))
        geo_ref = packaged["datasets"]["geo"]
        if (packaged["components"] != ["fiscal", "geo"] or geo_ref["version"] != state["version"]
                or geo_ref["sha256"] != report["dataset"]["gzipSha256"]
                or hashlib.sha256(archive.read("valicore/bundled/" + geo_ref["url"])).hexdigest() != geo_ref["sha256"]):
            raise RuntimeError("Runtime-inclusive wheel does not contain the verified geographic snapshot")
        native_ref = packaged["runtime"]
        if native_ref["sha256"] != sha(bundled_composition / native_ref["url"]):
            raise RuntimeError("Bundled native runtime differs from the actual composition")
    bundled_consumer = WORK / "bundled-consumer"
    bundled_consumer.mkdir()
    venv.EnvBuilder(with_pip=True).create(bundled_consumer / ".venv")
    bundled_python = bundled_consumer / ".venv/bin/python"
    run([bundled_python, "-I", "-m", "pip", "--disable-pip-version-check", "install", "--no-index",
         "--no-deps", bundled_wheel], cwd=bundled_consumer)
    bundled_test = bundled_consumer / "test_bundled_install.py"
    shutil.copyfile(ROOT / "packages/python/tests/test_bundled_install.py", bundled_test)
    bundled_corpus = bundled_consumer / "fiscal-vectors.json"
    shutil.copyfile(ROOT / "tests/fixtures/fiscal-vectors.json", bundled_corpus)
    bundled_report = bundled_consumer / "test-report.json"
    bundled_env = {**os.environ, "VALICORE_BUNDLED_FISCAL_CORPUS": str(bundled_corpus),
                   "VALICORE_BUNDLED_TEST_REPORT": str(bundled_report)}
    bundled_env.pop("PYTHONPATH", None)
    bundled_env.pop("PYTHONHOME", None)
    report["bundledWheel"] = {"path": str(bundled_wheel), "sha256": sha(bundled_wheel),
                             "bytes": bundled_wheel.stat().st_size, "consumerDirectory": str(bundled_consumer),
                             "components": packaged["components"], "nativeRuntimeSha256": native_ref["sha256"],
                             "dataset": {"version": geo_ref["version"], "gzipSha256": geo_ref["sha256"]}}
    try:
        run([bundled_python, "-I", bundled_test], cwd=bundled_consumer, env=bundled_env)
    finally:
        if bundled_report.exists():
            report["bundledWheel"]["tests"] = json.loads(bundled_report.read_text())
    bundled_example = bundled_consumer / "offline.py"
    shutil.copyfile(ROOT / "packages/python/examples/offline.py", bundled_example)
    for options in [[], ["--without-geography"]]:
        run([bundled_python, "-I", bundled_example, *options], cwd=bundled_consumer)
    report["bundledWheel"]["examplesExecuted"] = 2
    report["passed"] = True
except Exception as error:
    report["error"] = str(error)
    raise
finally:
    report["finishedAt"] = datetime.now(timezone.utc).isoformat()
    content = json.dumps(report, indent=2) + "\n"
    (REPORTS / f"python-{STAMP}.json").write_text(content)
    (REPORTS / "python-latest.json").write_text(content)
    print(f"Python installed-package verification {'passed' if report['passed'] else 'FAILED'}; report: {REPORTS / f'python-{STAMP}.json'}", flush=True)
