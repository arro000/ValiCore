#!/usr/bin/env python3
"""Report an exhausted refresh using the workflow-authenticated gh CLI.

No credentials are read/printed here. Importing this module performs no IO.
An immutable campaign marker and bot-author check permit reuse after a lost
creation response; closed issues are reused too, not recreated each hour.
"""
import argparse
import json
from pathlib import Path
import re
import subprocess

from refresh_policy import validated


class GitHubAPI:
    def __call__(self, method, path, payload=None):
        command = ["gh", "api", "--method", method, path]
        if payload is not None:
            command += ["--input", "-"]
        result = subprocess.run(command, input=json.dumps(payload) if payload is not None else None,
                                capture_output=True, text=True, check=True, timeout=30)
        return json.loads(result.stdout)


def ensure_issue(state, repository, run_url, api):
    state = validated(state)
    current = state["campaign"]
    if current is None or current["status"] != "exhausted":
        raise ValueError("Only an exhausted campaign may create a failure issue")
    if (not isinstance(repository, str) or not re.fullmatch(r"[A-Za-z0-9-]+/[A-Za-z0-9_.-]+", repository)
            or repository.split("/")[-1] in {".", ".."}):
        raise ValueError("Expected an explicit owner/repository")
    if not isinstance(run_url, str) or not run_url.startswith("https://github.com/" + repository + "/actions/runs/") or not run_url.rsplit("/", 1)[-1].isdigit():
        raise ValueError("Expected the matching GitHub Actions run URL")
    if current["issueNumber"] is not None:
        return current["issueNumber"]
    marker = "<!-- valicore-data-refresh:" + current["id"] + " -->"
    page = 1
    while True:
        path = f"repos/{repository}/issues?state=all&per_page=100&page={page}&since={current['startedAt']}"
        rows = api("GET", path)
        if not isinstance(rows, list):
            raise ValueError("Malformed issue listing")
        matches = [row["number"] for row in rows if isinstance(row, dict)
                   and "pull_request" not in row and row.get("user", {}).get("login") == "github-actions[bot]"
                   and marker in (row.get("body") or "") and type(row.get("number")) is int and row["number"] > 0]
        if matches:
            return min(matches)
        if len(rows) < 100:
            break
        page += 1
    body = (f"{marker}\n\nThe geographic source refresh did not complete within its bounded retry window.\n\n"
            f"- Campaign: `{current['id']}`\n- Started: {current['startedAt']}\n"
            f"- Deadline: {current['deadline']}\n- Claimed attempts: {current['attempts']}\n"
            f"- Workflow: {run_url}\n\n"
            "No failed or incomplete dataset is authorized for promotion. Inspect workflow logs and source/schema availability; "
            "do not paste credentials or personal data into this issue. A manual retry starts a new campaign only after this failure is recorded.")
    result = api("POST", f"repos/{repository}/issues", {"title": f"Geographic data refresh exhausted: {current['id']}", "body": body})
    if not isinstance(result, dict) or type(result.get("number")) is not int or result["number"] < 1:
        raise ValueError("Malformed issue creation response")
    return result["number"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state", type=Path, required=True)
    parser.add_argument("--repository", required=True)
    parser.add_argument("--run-url", required=True)
    args = parser.parse_args()
    number = ensure_issue(json.loads(args.state.read_text()), args.repository, args.run_url, GitHubAPI())
    print(number)


if __name__ == "__main__":
    main()
