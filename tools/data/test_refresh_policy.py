"""Deterministic operational tests: no source/network/Git/GitHub side effects."""
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("refresh_policy", Path(__file__).with_name("refresh_policy.py"))
policy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(policy)
START = datetime(2026, 10, 1, 5, 17, tzinfo=timezone.utc)


class RefreshPolicyTests(unittest.TestCase):
    def test_monthly_claim_is_due_once_and_does_not_mutate_input(self):
        original = policy.new_state()
        before, action = policy.plan(original, START - timedelta(seconds=1))
        self.assertEqual(action, "none")
        self.assertEqual(before, original)
        state, action = policy.plan(original, START)
        self.assertEqual(action, "synchronize")
        self.assertIsNone(original["campaign"])
        self.assertEqual(state["automaticPeriod"], "2026-10")
        self.assertEqual(state["campaign"]["attempts"], 1)
        self.assertEqual(policy.instant(state["campaign"]["deadline"]), START + timedelta(days=3))
        duplicate, action = policy.plan(state, START + timedelta(minutes=10))
        self.assertEqual(action, "none")
        self.assertEqual(duplicate, state)
        for result in ["changed", "unchanged"]:
            done = policy.finish(state, result, START + timedelta(minutes=1))
            self.assertEqual(done["campaign"]["status"], result)
            self.assertEqual(policy.plan(done, START + timedelta(days=20))[1], "none")
            next_month, action = policy.plan(done, START.replace(month=11))
            self.assertEqual(action, "synchronize")
            self.assertEqual(next_month["automaticPeriod"], "2026-11")

    def test_exponential_backoff_is_capped_and_never_runs_after_72_hours(self):
        self.assertEqual([policy.backoff(n).total_seconds() / 3600 for n in range(1, 9)], [1, 2, 4, 8, 16, 24, 24, 24])
        state, action = policy.plan(policy.new_state(), START)
        now = START
        claims = []
        while action == "synchronize":
            claims.append(now)
            failed = policy.finish(state, "failed", now)
            retry = policy.instant(failed["campaign"]["nextAttemptAt"])
            self.assertEqual(policy.plan(failed, retry - timedelta(microseconds=1))[1], "none")
            now = retry
            state, action = policy.plan(failed, now)
        self.assertEqual([(t - START).total_seconds() / 3600 for t in claims], [0, 1, 3, 7, 15, 31, 55])
        self.assertEqual(now, START + timedelta(hours=72))
        self.assertEqual(action, "issue")
        self.assertEqual(state["campaign"]["status"], "exhausted")
        self.assertIsNone(state["campaign"]["nextAttemptAt"])
        self.assertEqual(state["campaign"]["attempts"], 7)

    def test_backoff_starts_after_failure_not_before_it(self):
        state, _ = policy.plan(policy.new_state(), START)
        failed = policy.finish(state, "failed", START + timedelta(minutes=20))
        self.assertEqual(policy.instant(failed["campaign"]["nextAttemptAt"]), START + timedelta(hours=1, minutes=20))
        self.assertEqual(policy.plan(failed, START + timedelta(hours=1))[1], "none")

    def test_killed_runner_recovers_after_lease_without_resetting_campaign(self):
        state, _ = policy.plan(policy.new_state(), START)
        self.assertEqual(policy.plan(state, START + timedelta(minutes=46))[1], "none")
        recovered, action = policy.plan(state, START + timedelta(hours=1))
        self.assertEqual(action, "synchronize")
        self.assertEqual(recovered["campaign"]["attempts"], 2)
        self.assertEqual(recovered["campaign"]["startedAt"], state["campaign"]["startedAt"])
        self.assertEqual(recovered["campaign"]["deadline"], state["campaign"]["deadline"])
        self.assertEqual(policy.plan(recovered, START + timedelta(hours=2))[1], "none")
        self.assertEqual(policy.plan(recovered, START + timedelta(hours=3))[1], "synchronize")

    def test_delayed_scheduler_uses_original_monthly_deadline(self):
        late, action = policy.plan(policy.new_state(), START + timedelta(hours=71))
        self.assertEqual(action, "synchronize")
        self.assertEqual(policy.instant(late["campaign"]["startedAt"]), START)
        expired, action = policy.plan(policy.new_state(), START + timedelta(hours=72))
        self.assertEqual(action, "issue")
        self.assertEqual(expired["campaign"]["attempts"], 0)
        self.assertEqual(policy.plan(expired, START + timedelta(days=4))[1], "issue")

    def test_late_success_is_not_permission_to_publish(self):
        claimed, _ = policy.plan(policy.new_state(), START + timedelta(hours=71))
        for outcome in ["changed", "unchanged", "failed"]:
            completed = policy.finish(claimed, outcome, START + timedelta(hours=72))
            self.assertEqual(completed["campaign"]["status"], "exhausted")
            self.assertEqual(policy.plan(completed, START + timedelta(hours=73))[1], "issue")

    def test_issue_recording_is_idempotent_and_prevents_repeated_signals(self):
        exhausted, _ = policy.plan(policy.new_state(), START + timedelta(days=4))
        reported = policy.record_issue(exhausted, 123)
        self.assertEqual(policy.record_issue(reported, 123), reported)
        self.assertEqual(policy.plan(reported, START + timedelta(days=20))[1], "none")
        with self.assertRaises(ValueError):
            policy.record_issue(reported, 124)
        for invalid in [None, False, 0, -1, 1.5, "123"]:
            with self.assertRaises(ValueError):
                policy.record_issue(exhausted, invalid)
        next_month, action = policy.plan(reported, START.replace(month=11))
        self.assertEqual(action, "synchronize")
        self.assertEqual(next_month["campaign"]["issueNumber"], None)

    def test_manual_dispatch_does_not_reset_active_or_unreported_campaigns(self):
        state, _ = policy.plan(policy.new_state(), START)
        manual, action = policy.plan(state, START + timedelta(minutes=10), manual=True)
        self.assertEqual(manual, state)
        self.assertEqual(action, "none")
        exhausted, _ = policy.plan(state, START + timedelta(days=4))
        self.assertEqual(policy.plan(exhausted, START + timedelta(days=5), manual=True)[1], "issue")
        reported = policy.record_issue(exhausted, 123)
        manual, action = policy.plan(reported, START + timedelta(days=5), manual=True)
        self.assertEqual(action, "synchronize")
        self.assertEqual(manual["campaign"]["kind"], "manual")
        self.assertEqual(policy.instant(manual["campaign"]["deadline"]), START + timedelta(days=8))
        self.assertEqual(manual["automaticPeriod"], "2026-10")

    def test_invalid_state_or_clock_fails_closed_without_silent_restart(self):
        running, _ = policy.plan(policy.new_state(), START)
        changes = [lambda s: s.update(formatVersion=True), lambda s: s.update(extra=True),
                   lambda s: s.update(automaticPeriod="2026-13"),
                   lambda s: s["campaign"].update(attempts=True),
                   lambda s: s["campaign"].update(attempts=0),
                   lambda s: s["campaign"].update(deadline=policy.timestamp(START + timedelta(days=4))),
                   lambda s: s["campaign"].update(startedAt="2026-10-01"),
                   lambda s: s["campaign"].update(issueNumber=1),
                   lambda s: s["campaign"].update(id="unsafe/identifier"),
                   lambda s: s["campaign"].update(status="other"),
                   lambda s: s["campaign"].update(nextAttemptAt=policy.timestamp(START))]
        for change in changes:
            malformed = deepcopy(running)
            change(malformed)
            with self.assertRaises(ValueError):
                policy.plan(malformed, START + timedelta(minutes=1))
        with self.assertRaises(ValueError):
            policy.plan(running, START - timedelta(seconds=1))
        with self.assertRaises(ValueError):
            policy.plan(running, START.replace(tzinfo=None))
        with self.assertRaises(ValueError):
            policy.plan(running, START, manual="false")
        with self.assertRaises(ValueError):
            policy.finish(running, "changed", START - timedelta(seconds=1))
        with self.assertRaises(ValueError):
            policy.finish(policy.new_state(), "changed", START)

    def test_hourly_activation_does_not_create_retroactive_monthly_failures(self):
        for day in [2, 5, 20]:
            state, action = policy.plan(policy.new_state(), START + timedelta(days=day), automatic=False)
            self.assertEqual(action, "none")
            self.assertIsNone(state["campaign"])
        manual, action = policy.plan(policy.new_state(), START + timedelta(days=20), manual=True, automatic=False)
        self.assertEqual(action, "synchronize")
        self.assertEqual(manual["automaticPeriod"], "2026-10")
        done = policy.finish(manual, "unchanged", START + timedelta(days=20, minutes=1))
        self.assertEqual(policy.plan(done, START + timedelta(days=21), automatic=False)[1], "none")
        self.assertEqual(policy.plan(done, START.replace(month=11))[1], "synchronize")

    def test_hourly_mode_still_retries_and_reports_existing_campaigns(self):
        running, _ = policy.plan(policy.new_state(), START)
        failed = policy.finish(running, "failed", START)
        retried, action = policy.plan(failed, START + timedelta(hours=1), automatic=False)
        self.assertEqual(action, "synchronize")
        self.assertEqual(retried["campaign"]["attempts"], 2)
        expired, action = policy.plan(retried, START + timedelta(days=3), automatic=False)
        self.assertEqual(action, "issue")
        self.assertEqual(expired["campaign"]["status"], "exhausted")
        with self.assertRaises(ValueError):
            policy.plan(running, START, automatic="false")

    def test_cli_persists_before_action_and_corruption_is_not_overwritten(self):
        with tempfile.TemporaryDirectory() as temporary:
            state = Path(temporary) / "state.json"
            command = [sys.executable, str(Path(__file__).with_name("refresh_policy.py")), "plan", "--state", str(state), "--now", policy.timestamp(START)]
            result = subprocess.run(command, check=True, capture_output=True, text=True)
            self.assertEqual(json.loads(result.stdout)["action"], "synchronize")
            saved = json.loads(state.read_text())
            self.assertEqual(saved["campaign"]["status"], "running")
            state.write_text('{"broken":true}')
            failure = subprocess.run(command, capture_output=True, text=True)
            self.assertNotEqual(failure.returncode, 0)
            self.assertEqual(state.read_text(), '{"broken":true}')
            self.assertFalse(state.with_name("state.json.tmp").exists())


if __name__ == "__main__":
    unittest.main()
