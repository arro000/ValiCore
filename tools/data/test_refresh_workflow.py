"""Run actual workflow shell blocks against local disposable Git remotes.

No GitHub credentials, source downloads or external remote writes are involved.
"""
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import textwrap
import unittest

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = (ROOT / ".github/workflows/pages.yml").read_text()


def script(name):
    block = WORKFLOW.split("      - name: " + name + "\n", 1)[1].split("\n      - ", 1)[0]
    return textwrap.dedent(block.split("        run: |\n", 1)[1])


@contextmanager
def fixture():
    with tempfile.TemporaryDirectory() as temporary:
        base = Path(temporary)
        work, remote, runner = base / "work", base / "remote.git", base / "runner"
        work.mkdir(); runner.mkdir(); (base / "home").mkdir()
        env = {"PATH": os.environ["PATH"], "HOME": str(base / "home"), "RUNNER_TEMP": str(runner),
               "GITHUB_OUTPUT": str(base / "outputs"), "MONTHLY": "false", "MANUAL": "true"}
        def git(*args, cwd=work, check=True):
            return subprocess.run(["git", *args], cwd=cwd, env=env, check=check, capture_output=True, text=True)
        git("init", "--bare", str(remote))
        git("init", "--initial-branch=main")
        git("config", "user.name", "Fixture")
        git("config", "user.email", "fixture@example.invalid")
        for folder in [".github", "tools/data", "data", "artifacts"]:
            (work / folder).mkdir(parents=True)
        for name in ["refresh_policy.py", "refresh_issue.py"]:
            shutil.copyfile(ROOT / "tools/data" / name, work / "tools/data" / name)
        (work / ".github/keep").write_text("fixture\n")
        (work / "data/state.json").write_text('{"baseline":true}\n')
        (work / "artifacts/keep").write_text("baseline\n")
        git("add", "."); git("commit", "-m", "Fixture baseline")
        git("remote", "add", "origin", str(remote)); git("push", "origin", "HEAD:main")
        def shell(name, **extra):
            return subprocess.run(["bash", "-e", "-o", "pipefail", "-c", script(name)], cwd=work,
                                  env={**env, **extra}, capture_output=True, text=True)
        def read_remote(path):
            return git("--git-dir", str(remote), "show", "main:" + path).stdout
        yield work, git, shell, read_remote, env


class RefreshWorkflowTests(unittest.TestCase):
    def claim(self, shell):
        result = shell("Claim due refresh")
        self.assertEqual(result.returncode, 0, result.stderr)

    def dirty_data(self, work):
        (work / "data/state.json").write_text('{"unverified":true}\n')
        (work / "data/new.json").write_text("staged source\n")
        (work / "artifacts/new.json").write_text("staged runtime\n")

    def test_running_claim_is_durable_before_any_download(self):
        with fixture() as (work, git, shell, read_remote, env):
            self.claim(shell)
            state = json.loads(read_remote(".github/data-refresh-state.json"))
            self.assertEqual(state["campaign"]["status"], "running")
            self.assertEqual(state["campaign"]["attempts"], 1)
            self.assertEqual(json.loads(read_remote("data/state.json")), {"baseline": True})
            self.assertIn("action=synchronize", Path(env["GITHUB_OUTPUT"]).read_text())

    def test_failed_or_unchanged_runs_never_stage_downloads(self):
        for imported, changed, gate, expected in [("success", "true", "failure", "pending"), ("success", "false", "skipped", "unchanged"), ("failure", "false", "skipped", "pending")]:
            with self.subTest(status=expected), fixture() as (work, git, shell, read_remote, env):
                self.claim(shell); self.dirty_data(work)
                result = shell("Finish refresh and atomically promote verified data/state", REFRESH_OUTCOME=imported, CHANGED=changed, GATE_OUTCOME=gate)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(json.loads(read_remote(".github/data-refresh-state.json"))["campaign"]["status"], expected)
                self.assertEqual(json.loads(read_remote("data/state.json")), {"baseline": True})
                tree = git("--git-dir", str(work.parent / "remote.git"), "ls-tree", "-r", "--name-only", "main").stdout
                self.assertNotIn("data/new.json", tree)
                self.assertNotIn("artifacts/new.json", tree)

    def test_valid_changed_data_and_terminal_state_share_one_commit(self):
        with fixture() as (work, git, shell, read_remote, env):
            self.claim(shell)
            claim = git("rev-parse", "HEAD").stdout.strip()
            self.dirty_data(work)
            result = shell("Finish refresh and atomically promote verified data/state", REFRESH_OUTCOME="success", CHANGED="true", GATE_OUTCOME="success")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(git("log", "-1", "--format=%P").stdout.strip(), claim)
            self.assertEqual(json.loads(read_remote(".github/data-refresh-state.json"))["campaign"]["status"], "changed")
            self.assertEqual(read_remote("data/new.json"), "staged source\n")
            self.assertEqual(read_remote("artifacts/new.json"), "staged runtime\n")

    def test_non_fast_forward_rejects_claim_before_source_io(self):
        with fixture() as (work, git, shell, read_remote, env):
            remote = work.parent / "remote.git"
            other = work.parent / "other"
            git("clone", "--branch", "main", str(remote), str(other))
            git("config", "user.name", "Owner", cwd=other)
            git("config", "user.email", "owner@example.invalid", cwd=other)
            (other / "owner-work").write_text("Do not overwrite\n")
            git("add", ".", cwd=other); git("commit", "-m", "Concurrent owner work", cwd=other)
            git("push", "origin", "HEAD:main", cwd=other)
            result = shell("Claim due refresh")
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(read_remote("owner-work"), "Do not overwrite\n")
            self.assertNotEqual(git("--git-dir", str(remote), "show", "main:.github/data-refresh-state.json", check=False).returncode, 0)
            self.assertIn("steps.plan.outcome == 'success'", WORKFLOW)

    def test_unchanged_refresh_skips_verification_and_pushes_still_verify(self):
        with fixture() as (work, git, shell, read_remote, env):
            for event, manual, outcome, changed, expected in [
                ("schedule", "", "success", "false", "false"),
                ("schedule", "", "failure", "", "false"),
                ("schedule", "", "success", "true", "true"),
                ("push", "", "skipped", "", "true"),
                ("workflow_dispatch", "false", "skipped", "", "true")]:
                # The changed branch copies the staged directory only when present.
                staged = Path(env["RUNNER_TEMP"]) / "refresh-data"
                if not staged.exists(): shutil.copytree(work / "data", staged)
                Path(env["GITHUB_OUTPUT"]).write_text("")
                result = shell("Select verification work", EVENT=event, MANUAL_REFRESH=manual, REFRESH_OUTCOME=outcome, CHANGED=changed)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(Path(env["GITHUB_OUTPUT"]).read_text().strip(), "verify=" + expected)

    def test_successful_gate_after_deadline_still_cannot_promote(self):
        with fixture() as (work, git, shell, read_remote, env):
            self.claim(shell); self.dirty_data(work)
            path = work / '.github/data-refresh-state.json'
            state = json.loads(path.read_text())
            deadline = datetime.now(timezone.utc) - timedelta(minutes=1)
            start = deadline - timedelta(days=3)
            state['campaign'].update(startedAt=start.isoformat(), deadline=deadline.isoformat(), claimedAt=(start + timedelta(hours=1)).isoformat())
            path.write_text(json.dumps(state))
            result = shell("Finish refresh and atomically promote verified data/state", REFRESH_OUTCOME="success", CHANGED="true", GATE_OUTCOME="success")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(read_remote('.github/data-refresh-state.json'))['campaign']['status'], 'exhausted')
            self.assertEqual(json.loads(read_remote('data/state.json')), {'baseline': True})

    def test_workflow_is_opt_in_serialized_and_no_force_push(self):
        self.assertIn("vars.ENABLE_DATA_REFRESH == 'true'", WORKFLOW)
        self.assertIn("cancel-in-progress: false", WORKFLOW)
        self.assertIn("timeout-minutes: 40", WORKFLOW)
        self.assertIn("--retry-only", script("Claim due refresh"))
        self.assertNotIn("--force", WORKFLOW)
        self.assertNotIn("git reset", WORKFLOW)
        self.assertNotIn("git add .", WORKFLOW)
        self.assertIn("npm run test:extensive", WORKFLOW)


if __name__ == "__main__":
    unittest.main()
