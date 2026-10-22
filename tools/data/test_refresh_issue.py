"""Failure issue adapter tests; fake API only, never GitHub or credentials."""
from datetime import datetime, timedelta, timezone
import unittest

import refresh_policy as policy
from refresh_issue import ensure_issue

START = datetime(2026, 10, 1, 5, 17, tzinfo=timezone.utc)
REPOSITORY = "example/ValiCore"
RUN = "https://github.com/example/ValiCore/actions/runs/123"


def exhausted():
    return policy.plan(policy.new_state(), START + timedelta(days=4))[0]


class RefreshIssueTests(unittest.TestCase):
    def test_creation_has_safe_marker_and_no_source_error_dump(self):
        calls = []
        def api(method, path, payload=None):
            calls.append((method, path, payload))
            return [] if method == "GET" else {"number": 42}
        self.assertEqual(ensure_issue(exhausted(), REPOSITORY, RUN, api), 42)
        self.assertEqual([row[0] for row in calls], ["GET", "POST"])
        body = calls[1][2]["body"]
        self.assertIn("<!-- valicore-data-refresh:automatic-2026-10 -->", body)
        self.assertIn(RUN, body)
        self.assertIn("No failed or incomplete dataset", body)
        self.assertNotIn("labels", calls[1][2], "Reporting must not depend on a preexisting label")

    def test_lost_post_response_reuses_the_created_issue(self):
        rows, posts = [], []
        def api(method, path, payload=None):
            if method == "GET":
                return rows
            posts.append(payload)
            rows.append({"number": 42, "body": payload["body"], "user": {"login": "github-actions[bot]"}, "state": "closed"})
            raise TimeoutError("Response lost after remote creation")
        with self.assertRaises(TimeoutError):
            ensure_issue(exhausted(), REPOSITORY, RUN, api)
        self.assertEqual(ensure_issue(exhausted(), REPOSITORY, RUN, api), 42)
        self.assertEqual(len(posts), 1)

    def test_pagination_bot_author_and_pull_request_guards(self):
        marker = "<!-- valicore-data-refresh:automatic-2026-10 -->"
        calls = []
        def api(method, path, payload=None):
            calls.append(path)
            self.assertEqual(method, "GET")
            if "page=1&" in path:
                return [{"number": 9, "body": marker, "user": {"login": "someone-else"}}] * 99 + [
                    {"number": 10, "body": marker, "user": {"login": "github-actions[bot]"}, "pull_request": {}}]
            return [{"number": 42, "body": marker, "user": {"login": "github-actions[bot]"}, "state": "closed"}]
        self.assertEqual(ensure_issue(exhausted(), REPOSITORY, RUN, api), 42)
        self.assertEqual(len(calls), 2)

    def test_recorded_issue_has_no_api_calls_and_bad_context_fails_closed(self):
        def forbidden(*args):
            raise AssertionError("No API call expected")
        reported = policy.record_issue(exhausted(), 42)
        self.assertEqual(ensure_issue(reported, REPOSITORY, RUN, forbidden), 42)
        for state, repository, url in [(policy.new_state(), REPOSITORY, RUN),
                                       (exhausted(), "other/repository", RUN),
                                       (exhausted(), "unsafe/repo/extra", RUN),
                                       (exhausted(), REPOSITORY, "http://github.com/example/ValiCore/actions/runs/123"),
                                       (exhausted(), REPOSITORY, RUN + "/extra")]:
            with self.assertRaises(ValueError):
                ensure_issue(state, repository, url, forbidden)

    def test_malformed_api_results_do_not_look_like_success(self):
        def wrong_listing(*args):
            return {"message": "Unavailable"}
        with self.assertRaises(ValueError):
            ensure_issue(exhausted(), REPOSITORY, RUN, wrong_listing)
        for response in [{}, {"number": True}, {"number": 0}, {"number": "42"}]:
            def api(method, path, payload=None):
                return [] if method == "GET" else response
            with self.assertRaises(ValueError):
                ensure_issue(exhausted(), REPOSITORY, RUN, api)


if __name__ == "__main__":
    unittest.main()
