#!/usr/bin/env python3
"""Build and verify native release artifacts on their actual host target.

Requires an installed/cached Rust toolchain, Node, pip and setuptools >=77.
No cross-labeling, registry publication, source sync or remote Git operations.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import tempfile
import tomllib
import venv
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(command, cwd=ROOT, env=None):
    print('[Native release]', ' '.join(map(str, command)), flush=True)
    subprocess.run(list(map(str, command)), cwd=cwd, env=env, check=True)


def build(output, expected_platform=None, expected_architecture=None):
    if output.exists():
        raise FileExistsError('Choose a new output directory; release artifacts are never overwritten')
    # Node and Python must be executing the same host architecture, not merely
    # inspecting a universal interpreter or a cross-target filename.
    host = json.loads(subprocess.check_output(['node', '-p', 'JSON.stringify({platform:process.platform,architecture:process.arch})'], text=True))
    if host['platform'] != sys.platform:
        raise RuntimeError('Node/Python platform mismatch')
    if expected_platform and host['platform'] != expected_platform:
        raise RuntimeError('Runner platform does not match its advertised target')
    if expected_architecture and host['architecture'] != expected_architecture:
        raise RuntimeError('Runner architecture does not match its advertised target')
    version = tomllib.loads((ROOT / 'Cargo.toml').read_text())['workspace']['package']['version']
    state = json.loads((ROOT / 'data/state.json').read_text())
    snapshot = ROOT / 'data' / state['snapshot']
    run(['cargo', 'test', '--workspace', '--locked', '--offline'])
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.valicore-native-', dir=output.parent) as temporary:
        stage = Path(temporary)
        artifacts = stage / 'artifacts'; artifacts.mkdir()
        compositions = {}
        for profile in ['italian', 'fiscal']:
            path = stage / profile
            command = ['node', ROOT / 'tools/compose.mjs', '--profile', profile, '--target', 'native', '--compile',
                       '--source', ROOT, '--cargo-target-directory', ROOT / 'target/native-release', '--output', path]
            if profile == 'italian': command += ['--datasets', 'geo', '--data', 'geo=' + str(snapshot)]
            run(command)
            manifest = json.loads((path / 'manifest.json').read_text())
            if manifest['engineVersion'] != version or manifest['runtimeApiMajor'] != 8:
                raise RuntimeError('Composition differs from release source identity')
            compositions[profile] = (path, manifest)
        complete, manifest = compositions['italian']
        run([sys.executable, ROOT / 'tools/build_python_wheel.py', '--composition', complete,
             '--geo', snapshot, '--output', stage / 'wheels'])
        wheels = list((stage / 'wheels').glob('*.whl'))
        if len(wheels) != 1: raise RuntimeError('Expected one native-inclusive wheel')
        consumer = stage / 'consumer'; consumer.mkdir()
        venv.EnvBuilder(with_pip=True).create(consumer / '.venv')
        python = consumer / '.venv' / ('Scripts/python.exe' if sys.platform == 'win32' else 'bin/python')
        run([python, '-I', '-m', 'pip', 'install', '--no-index', '--no-deps', wheels[0]], cwd=consumer)
        resources = consumer / 'resources'; resources.mkdir()
        library = complete / manifest['runtime']['native']['url']
        shutil.copyfile(library, resources / library.name)
        shutil.copyfile(snapshot, resources / 'places.json.gz')
        for name in ['fiscal-vectors.json', 'italian-vat-vectors.json', 'italian-rea-vectors.json', 'birthplace-history-vectors.json']:
            shutil.copyfile(ROOT / 'tests/fixtures' / name, resources / name)
        for name, data in [('invalid.so', b'not a library'), ('bad.json', b'{'), ('bad.json.gz', b'not gzip')]:
            (resources / name).write_bytes(data)
        env = {**os.environ, 'VALICORE_PYTHON_RESOURCES': str(resources), 'VALICORE_PYTHON_LIBRARY': library.name,
               'VALICORE_PYTHON_TEST_REPORT': str(consumer / 'transport-report.json'),
               'VALICORE_BUNDLED_FISCAL_CORPUS': str(resources / 'fiscal-vectors.json'),
               'VALICORE_BUNDLED_TEST_REPORT': str(consumer / 'bundled-report.json')}
        env.pop('PYTHONPATH', None); env.pop('PYTHONHOME', None)
        reports = {}
        for name, kind in [('test_valicore.py', 'transport'), ('test_bundled_install.py', 'bundled')]:
            test = consumer / name
            shutil.copyfile(ROOT / 'packages/python/tests' / name, test)
            try:
                run([python, '-I', test], cwd=consumer, env=env)
            finally:
                # Do not suppress locked-DLL cleanup failures. Once the child
                # has exited, Windows must release every fixture image mapping.
                for directory in resources.glob('valicore-bundled-test-*'):
                    if directory.is_dir(): shutil.rmtree(directory)
            report = json.loads((consumer / (kind + '-report.json')).read_text())
            expected_skips = 0 if kind == 'bundled' or sys.platform == 'linux' else 1  # /proc-only RSS test
            if not report['passed'] or report['skipped'] != expected_skips:
                raise RuntimeError('Installed target consumer did not satisfy expected coverage')
            reports[kind] = report
        fiscal, fiscal_manifest = compositions['fiscal']
        fiscal_library = fiscal / fiscal_manifest['runtime']['native']['url']
        check = consumer / 'fiscal.py'
        check.write_text("import sys\nfrom valicore import create_valicore,ValiCoreError\n"
                         "with create_valicore(library_path=sys.argv[1],components=['fiscal']) as e:\n"
                         " assert e.validate_italian_vat('IT06363391001')['valid'] is True\n"
                         " assert e.version_info()['components']==['fiscal']\n"
                         " try: e.search_places('Roma'); raise AssertionError('excluded geo stayed available')\n"
                         " except ValiCoreError as x: assert x.code=='COMPONENT_UNAVAILABLE'\n")
        run([python, '-I', check, fiscal_library], cwd=consumer, env=env)
        shutil.copyfile(ROOT / 'docs/DATA-LICENSES.md', complete / 'DATA-NOTICE.md')
        archives = []
        for profile, (directory, selected) in compositions.items():
            name = f"valicore-{version}-{host['platform']}-{host['architecture']}-{profile}.zip"
            path = artifacts / name
            with zipfile.ZipFile(path, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
                for source in sorted(directory.rglob('*')):
                    if source.is_file(): archive.write(source, source.relative_to(directory).as_posix())
                archive.write(ROOT / 'include/valicore.h', 'include/valicore.h')
            archives.append({'file': name, 'sha256': digest(path), 'profile': profile,
                             'nativeSha256': selected['runtime']['native']['sha256']})
        shutil.copyfile(wheels[0], artifacts / wheels[0].name)
        report = {'passed': True, **host, 'python': sys.version, 'host': platform.platform(), 'engineVersion': version,
                  'revision': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
                  'workingTreeDirty': bool(subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT, text=True).strip()),
                  'dataVersion': state['version'], 'datasetGzipSha256': digest(snapshot), 'tests': reports,
                  'fiscalCompositionPassed': True, 'archives': archives,
                  'wheel': {'file': wheels[0].name, 'sha256': digest(wheels[0])}}
        (artifacts / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
        files = sorted(artifacts.iterdir())
        (artifacts / 'SHA256SUMS').write_text(''.join(f'{digest(path)}  {path.name}\n' for path in files))
        artifacts.rename(output)
        return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--expected-platform', choices=['linux', 'darwin', 'win32'])
    parser.add_argument('--expected-architecture', choices=['x64', 'arm64'])
    args = parser.parse_args()
    print(json.dumps(build(args.output.resolve(), args.expected_platform, args.expected_architecture), indent=2))
