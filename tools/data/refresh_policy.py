#!/usr/bin/env python3
"""Durable monthly refresh policy. No downloads, Git changes or GitHub API calls.

Persist the returned state before executing `synchronize`. Publish staged data
only after `finish(..., 'changed', ...)` returns status `changed`. Retry windows
are operational UTC timestamps, never domain/date-validation defaults.
"""
from __future__ import annotations

import argparse
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import tempfile

WINDOW = timedelta(days=3)
LEASE = timedelta(minutes=45)
TERMINAL = {"changed", "unchanged", "exhausted"}
CAMPAIGN_KEYS = {"id", "kind", "startedAt", "deadline", "status", "attempts", "claimedAt", "nextAttemptAt", "issueNumber"}


def timestamp(value: datetime) -> str:
    if value.tzinfo is None or value.utcoffset() != timedelta(0):
        raise ValueError("Refresh timestamps require explicit UTC")
    return value.isoformat().replace("+00:00", "Z")


def instant(value: str) -> datetime:
    if not isinstance(value, str):
        raise ValueError("Refresh timestamp must be a string")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    timestamp(parsed)
    return parsed


def new_state() -> dict:
    return {"formatVersion": 1, "automaticPeriod": None, "campaign": None}


def validated(state: dict) -> dict:
    if (not isinstance(state, dict) or set(state) != {"formatVersion", "automaticPeriod", "campaign"}
            or type(state["formatVersion"]) is not int or state["formatVersion"] != 1):
        raise ValueError("Invalid refresh state envelope")
    period = state["automaticPeriod"]
    if period is not None:
        if not isinstance(period, str) or len(period) != 7:
            raise ValueError("Invalid automatic period")
        if datetime.strptime(period, "%Y-%m").strftime("%Y-%m") != period:
            raise ValueError("Invalid automatic period")
    campaign = state["campaign"]
    if campaign is not None:
        if not isinstance(campaign, dict) or set(campaign) != CAMPAIGN_KEYS:
            raise ValueError("Invalid refresh campaign")
        if campaign["kind"] not in {"automatic", "manual"} or campaign["status"] not in TERMINAL | {"pending", "running"}:
            raise ValueError("Invalid campaign kind/status")
        if not isinstance(campaign["id"], str) or not campaign["id"] or not all(c.isascii() and (c.isalnum() or c in "-_") for c in campaign["id"]):
            raise ValueError("Invalid campaign identifier")
        start, deadline = instant(campaign["startedAt"]), instant(campaign["deadline"])
        if deadline - start != WINDOW or type(campaign["attempts"]) is not int or campaign["attempts"] < 0:
            raise ValueError("Invalid retry window/attempt count")
        issue = campaign["issueNumber"]
        if issue is not None and (type(issue) is not int or issue < 1 or campaign["status"] != "exhausted"):
            raise ValueError("Invalid failure issue")
        claimed, retry = campaign["claimedAt"], campaign["nextAttemptAt"]
        if claimed is not None and not start <= instant(claimed) < deadline:
            raise ValueError("Invalid claimed timestamp")
        if retry is not None and not start <= instant(retry) <= deadline:
            raise ValueError("Invalid retry timestamp")
        if (claimed is None) != (campaign["attempts"] == 0):
            raise ValueError("Attempt count and claim timestamp disagree")
        if claimed is not None and retry is not None and instant(retry) < instant(claimed):
            raise ValueError("Retry predates its attempt")
        if campaign["status"] in {"changed", "unchanged"} and campaign["attempts"] == 0:
            raise ValueError("Successful campaigns need an actual attempt")
        if campaign["kind"] == "automatic" and (period != start.strftime("%Y-%m") or campaign["id"] != "automatic-" + period):
            raise ValueError("Automatic campaign and monthly period disagree")
        if campaign["status"] == "running" and (claimed is None or retry is not None or campaign["attempts"] < 1):
            raise ValueError("Invalid running lease")
        if campaign["status"] == "pending" and retry is None:
            raise ValueError("Pending campaign needs a retry timestamp")
        if campaign["status"] in TERMINAL and retry is not None:
            raise ValueError("Terminal campaign cannot schedule retries")
    return deepcopy(state)


def backoff(attempts: int) -> timedelta:
    if type(attempts) is not int or attempts < 1:
        raise ValueError("Attempt count must be positive")
    return timedelta(hours=min(24, 2 ** min(attempts - 1, 5)))


def campaign(kind: str, start: datetime, identifier: str) -> dict:
    return {"id": identifier, "kind": kind, "startedAt": timestamp(start), "deadline": timestamp(start + WINDOW),
            "status": "pending", "attempts": 0, "claimedAt": None, "nextAttemptAt": timestamp(start), "issueNumber": None}


def plan(state: dict, now: datetime, *, manual: bool = False, automatic: bool = True) -> tuple[dict, str]:
    """Claim due work. A caller MUST durably save state before running it.

    Automatic windows begin at 05:17 UTC on the first, even if the scheduler is
    late. Outages cannot silently restart an expired three-day retry window.
    Manual dispatch never resets a currently active campaign.
    """
    timestamp(now)
    if type(manual) is not bool or type(automatic) is not bool:
        raise ValueError("Dispatch flags must be boolean")
    state = validated(state)
    current = state["campaign"]
    period = now.strftime("%Y-%m")
    due = now.replace(day=1, hour=5, minute=17, second=0, microsecond=0)
    if current is None or current["status"] in TERMINAL:
        # An unreported exhausted campaign cannot be overwritten by a new run.
        if current and current["status"] == "exhausted" and current["issueNumber"] is None:
            return state, "issue"
        if manual:
            current = campaign("manual", now, "manual-" + now.strftime("%Y%m%dT%H%M%S%fZ"))
            if now >= due:
                state["automaticPeriod"] = period
        elif automatic and now >= due and state["automaticPeriod"] != period:
            state["automaticPeriod"] = period
            current = campaign("automatic", due, "automatic-" + period)
        else:
            return state, "none"
        state["campaign"] = current
    start, deadline = instant(current["startedAt"]), instant(current["deadline"])
    if now < start:
        raise ValueError("Operational clock predates the campaign")
    if now >= deadline:
        current.update(status="exhausted", nextAttemptAt=None)
        return state, "issue" if current["issueNumber"] is None else "none"
    if current["status"] == "running":
        claimed = instant(current["claimedAt"])
        if now < claimed:
            raise ValueError("Operational clock predates the attempt")
        # A killed runner cannot leave a permanent running flag. Wait for its
        # lease and original backoff; never claim concurrent duplicate work.
        retry = claimed + max(LEASE, backoff(current["attempts"]))
        if now < retry:
            return state, "none"
    elif now < instant(current["nextAttemptAt"]):
        return state, "none"
    current.update(status="running", attempts=current["attempts"] + 1,
                   claimedAt=timestamp(now), nextAttemptAt=None)
    return state, "synchronize"


def finish(state: dict, outcome: str, now: datetime) -> dict:
    timestamp(now)
    state = validated(state)
    current = state["campaign"]
    if current is None or current["status"] != "running" or outcome not in {"changed", "unchanged", "failed"}:
        raise ValueError("Only a claimed refresh can finish with a known outcome")
    if now < instant(current["claimedAt"]):
        raise ValueError("Operational clock predates the attempt")
    deadline = instant(current["deadline"])
    if now >= deadline:
        current.update(status="exhausted", nextAttemptAt=None)
    elif outcome == "failed":
        current.update(status="pending", nextAttemptAt=timestamp(min(deadline, now + backoff(current["attempts"]))))
    else:
        current.update(status=outcome, nextAttemptAt=None)
    return state


def record_issue(state: dict, number: int) -> dict:
    state = validated(state)
    current = state["campaign"]
    if current is None or current["status"] != "exhausted" or type(number) is not int or number < 1:
        raise ValueError("Only an exhausted campaign can record a positive issue number")
    if current["issueNumber"] not in {None, number}:
        raise ValueError("A different failure issue is already recorded")
    current["issueNumber"] = number
    return state


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["plan", "finish", "record-issue"])
    parser.add_argument("--state", type=Path, required=True)
    parser.add_argument("--now", help="Explicit UTC time for deterministic verification; otherwise operational UTC now")
    parser.add_argument("--manual", action="store_true")
    parser.add_argument("--retry-only", action="store_true", help="Do not start a monthly window; retry/issue existing campaigns only")
    parser.add_argument("--outcome", choices=["changed", "unchanged", "failed"])
    parser.add_argument("--issue", type=int)
    args = parser.parse_args()
    state = json.loads(args.state.read_text()) if args.state.exists() else new_state()
    now = instant(args.now) if args.now else datetime.now(timezone.utc)
    action = "none"
    if args.command == "plan":
        state, action = plan(state, now, manual=args.manual, automatic=not args.retry_only)
    elif args.command == "finish":
        state = finish(state, args.outcome, now)
        if state["campaign"]["status"] == "exhausted":
            action = "issue"
    else:
        state = record_issue(state, args.issue)
    validated(state)
    descriptor, name = tempfile.mkstemp(prefix="." + args.state.name + "-", dir=args.state.parent)
    temporary = Path(name)
    try:
        with os.fdopen(descriptor, "w") as output:
            output.write(json.dumps(state, indent=2) + "\n")
            output.flush()
            os.fsync(output.fileno())
        temporary.replace(args.state)
    finally:
        temporary.unlink(missing_ok=True)
    print(json.dumps({"action": action, "state": state}))


if __name__ == "__main__":
    main()
