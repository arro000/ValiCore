"""Offline tests for the exact release assembly program embedded in Actions."""
from contextlib import contextmanager
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import textwrap
import unittest

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = (ROOT / '.github/workflows/package.yml').read_text()
PROGRAM = textwrap.dedent(WORKFLOW.split("          python3 - <<'PY'\n", 1)[1].split('\n          PY', 1)[0])
spec = importlib.util.spec_from_file_location('release_versions', ROOT / 'tools/test_release_versions.py')
versions = importlib.util.module_from_spec(spec); spec.loader.exec_module(versions)


@contextmanager
def fixture():
    old = Path.cwd()
    with tempfile.TemporaryDirectory() as temporary:
        root = Path(temporary); source = root / 'verified-artifacts'; source.mkdir()
        cases = [('release-web', None, None)] + [('release-native-'+p+'-'+a, p, a) for p in ['linux','darwin','win32'] for a in ['x64','arm64']]
        for name, platform, arch in cases:
            directory = source / name; directory.mkdir()
            if platform:
                report = {'passed':True,'fiscalCompositionPassed':True,'platform':platform,'architecture':arch,
                          'tests':{'transport':{'skipped':0 if platform=='linux' else 1},'bundled':{'skipped':0}}}
                (directory/'report.json').write_text(json.dumps(report))
                for suffix in ['fiscal.zip','italian.zip','platform.whl']:
                    (directory/(platform+'-'+arch+'-'+suffix)).write_bytes(b'verified fixture')
            else:
                (directory/'package.tgz').write_bytes(b'verified web fixture')
                (directory/'verification-linux.json').write_text('{"passed":true}')
            (directory/'SHA256SUMS').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.name+'\n' for p in sorted(directory.iterdir())))
        os.chdir(root)
        try: yield root
        finally: os.chdir(old)


class ReleaseWorkflowTests(unittest.TestCase):
    def test_current_versions_and_tag_match_without_importing_package_code(self):
        result = versions.verify('v0.5.0-beta.1')
        self.assertEqual(result['pythonVersion'], '0.5.0b1')
        with self.assertRaises(ValueError): versions.verify('v0.4.1')

    def test_complete_target_evidence_assembles_without_collisions(self):
        with fixture() as root:
            exec(compile(PROGRAM,'<release assembly>','exec'),{})
            output = root/'release'
            self.assertEqual(len(list(output.glob('*.whl'))),6)
            self.assertEqual(len(list(output.glob('*.zip'))),12)
            self.assertEqual(len(list(output.glob('*-report.json'))),6)
            for line in (output/'SHA256SUMS').read_text().splitlines():
                digest,name = line.split(None,1)
                self.assertEqual(hashlib.sha256((output/name.strip()).read_bytes()).hexdigest(),digest)

    def test_corrupt_or_missing_artifact_prevents_release_assembly(self):
        for kind in ['corrupt','missing']:
            with self.subTest(kind=kind), fixture() as root:
                source = root/'verified-artifacts'
                if kind=='corrupt': (source/'release-web/package.tgz').write_bytes(b'corrupted')
                else:
                    import shutil
                    shutil.rmtree(source/'release-native-win32-arm64')
                with self.assertRaises(AssertionError): exec(compile(PROGRAM,'<release assembly>','exec'),{})

    def test_only_draft_publication_after_every_target_and_no_registries(self):
        self.assertIn('needs: [verify, native]',WORKFLOW)
        self.assertIn('--verify-tag --draft --prerelease',WORKFLOW)
        self.assertNotIn('npm publish',WORKFLOW)
        self.assertNotIn('twine upload',WORKFLOW)


if __name__ == '__main__': unittest.main()
