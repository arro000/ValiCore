# Geographic refresh and deployment operations

The checked-in workflow implements the policy below. Local tests validate
state transitions, actual shell blocks against disposable local Git remotes,
and issue calls against a fake API. They do **not** establish successful remote
Actions, branch permissions, issue creation or Pages deployment.

## Activation

Keep `ENABLE_DATA_REFRESH` unset until publication/source-terms go/no-go review.
Enabling it is an explicit repository-variable operation; preparation does not
enable it. The workflow token needs contents/issue write access and main-branch
rules permitting reviewed automation commits. No force push or branch-protection
bypass is used. Pages activation is separate; private previews do not imply a
public website. Pending [ADE terms](DATA-LICENSES.md) remain a review gate.

For an initial midmonth activation, dispatch with `refresh_data: true` to perform
an explicitly requested first check. The hourly cron only retries existing
campaigns and cannot invent a retroactive monthly failure. A manual check after
the month's scheduled slot also satisfies that month's baseline.

## Schedule and durable state

- Monthly start: day 1, 05:17 UTC.
- Hourly wake-up: minute 17, only for due retries/unreported exhausted campaigns.
- Manual dispatch without refresh checks current committed source; with refresh
  starts/retries a campaign, requiring the activation variable.
- `.github/data-refresh-state.json` holds the current campaign, claim count,
  timestamps, next attempt, monthly period and optional failure issue number.

The policy writes an atomic validated state file. The workflow commits/pushes
a running claim **before** downloading sources. If that ordinary push is
rejected, no source request follows; concurrent owner work is not reset/rebased
or overwritten. State-only/data-artifact commits do not recursively trigger
code verification.

Automatic windows anchor to the monthly slot, not a delayed runner's start.
Retries back off 1, 2, 4, 8, 16 then at most 24 hours after failure. No attempt
starts at/after 72 hours. A killed runner is recoverable after the running lease
and original backoff; the whole job times out before that lease expires.
Manual dispatch does not reset an active/unreported failure window.

GitHub scheduling/availability is not an SLA. The first hourly run at/after the
deadline reports exhaustion; runner delays can delay that report but cannot
extend permission to retry/promote. Missing workflow executions, initial claim
permission failures or unavailable GitHub services require operational review,
not a claim that a source check succeeded.

## Staging and promotion

Source import runs on an isolated copy of committed geographic data. Unchanged
content does not enter runtime/site assembly or deployment. Changed data is
copied into the disposable checkout and must pass the complete extensive gate,
including actual native/WASM, installed npm/Python, browser and HTTP tests.

Only a successful **on-time** changed result stages data, immutable runtime
artifacts and terminal campaign state together in one commit. Failed/unchanged
runs stage only operational state, never partial source/data/runtime outputs.
An ordinary non-fast-forward rejection cannot overwrite concurrent owner work.
Late success is exhaustion, not permission to publish. Existing loaded clients
keep their snapshots; no in-place update or personal-data API is introduced.

## Failure issue

At exhaustion, a bot-owned campaign marker identifies the failure issue. Lookup
includes closed issues and pagination; a lost creation response can reuse the
created issue on the next run. The recorded issue number prevents repeated
hourly reports. No preexisting label is required. Reports contain campaign/run
links, not credentials, personal data or raw provider error dumps.

Issue/network failures leave the campaign unreported for a later hourly retry.
This is idempotent reconciliation, not an exactly-once transaction guarantee
provided by GitHub's issue API. A manual new campaign follows recording the old
failure rather than silently erasing it.

## Rollback

Select a previously verified complete compatible release manifest and check all
runtime/data/notices hashes before deployment. Do not independently swap files
or overwrite immutable URLs. Cache fallback is not deployment rollback. Retain
failed staged outputs only as diagnostic artifacts, never as a promoted channel.
After an authorized promotion/rollback, independently verify the hosted manifest
and referenced resources. Local tests cannot certify that remote operation.
