# Security policy

## Supported versions

Only the latest beta is maintained. Earlier private evaluation builds and other
beta versions do not receive a separate security backport commitment. There is
no production SLA or guaranteed response time.

## Reporting a vulnerability

**Do not disclose exploitable vulnerabilities, credentials, personal identifiers
or customer data in a public issue or pull request.**

The intended public-beta channel is
[GitHub private vulnerability reporting](https://github.com/arro000/ValiCore/security/advisories/new).
It must be enabled and checked as a publication prerequisite; a Markdown link
alone does not establish that the private reporting service is active. If it is
unavailable, do not fall back to posting sensitive details publicly. Use GitHub's
private support/reporting mechanisms for account/platform incidents.

Include a minimal synthetic reproduction, affected version/runtime composition,
platform, impact and any safe workaround. Identify the relevant dataset edition
when applicable. Do not probe protected registries, accounts, health services or
third-party infrastructure to demonstrate a ValiCore bug.

Maintainers will triage the report, coordinate an appropriate fix and disclosure,
and release a corrected latest beta when warranted. Please allow time for a fix
before publishing exploitation details. No bug bounty or reward is promised.

## Trust boundaries

- Loading a supplied native library executes native code; it is not a sandbox.
- WASM/resource hashes establish byte identity, not that a publisher is trustworthy
  or an identifier is assigned in an official registry.
- Runtime operations are local after initialization. Online loading must use a
  trusted channel; preserve complete-release fallback and resource verification.
- Dataset inputs are caller-controlled: preserve validation, bounded lifecycle
  tests, provenance and explicit unavailable/unknown results.
- Supply a date explicitly where needed. There is no hidden clock or remote
  tax/identity/clinical verification in the Rust engine.
- Old archives, caches, forks or clones may retain exposed material. Rewriting Git
  history or deleting a file does not revoke a credential; rotate it independently.

Security automation and local audits are supporting evidence, not a guarantee
that vulnerabilities or secrets are absent. See [testing](docs/TESTING.md) and
[distribution](docs/DISTRIBUTION.md) for the operational contracts.
