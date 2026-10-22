# Public beta readiness

**Candidate, not published or finally certified.** Draft Rust/JS/engine version:
`0.5.0-beta.1`; Python distribution: `0.5.0b1`. Runtime API8, loader2,
JSON protocol1 and geographic schema1 are independent compatibility numbers.
The first beta candidate exposes fiscal identity and geographic history only.
Final scope/version freeze remains part of go/no-go review.

## Product direction

Free/open-source, developer-installable library, not a hosted validation API.
Complete and selected runtimes coexist. Default installation includes runtime
and geography; online use is explicit. Python consumers do not compile Rust or
locate native libraries manually. Custom datasets remain a supported contract.
Beta ends when the owner decides; maintain latest beta only. No v1 stability
commitment or compatibility with obsolete development prototypes is implied.

Initial hosting is the existing `arro000/ValiCore` repository, GitHub Releases,
demo and shared data channel; language registries/CDN are separate publication
decisions. Do not create another public repository or advertise an API/SLA.

## Evidence boundary

Current local checks cover scoped Rust/ABI, 73 JS tests on Node22/26, TypeScript,
actual installed npm consumers, 18 transport/5 inclusive Python groups, 24
Chromium tests, copied examples, importer and HTTP/integrity/cache checks.
These counts are preparation observations, not proof for a later source change.
Reports retain revision, dirty-tree status, toolchain and resource/corpus hashes.
A dirty-tree report alone is not certification of a committed/tagged release.
Remote CI, registry availability and live hosting require separate observation.

| Target | Current evidence |
| --- | --- |
| Node | Local 22.23.3 and 26.10.0 scoped suites and installed tarballs |
| Browser | Playwright-managed Chromium; not Firefox/WebKit/mobile performance |
| Native/Python | Linux x64, Python 3.12.14 and 3.14.7 inclusive installed wheels |
| Python 3.12 minimum | Actual installed transport/inclusive consumer checks passed locally |
| Windows/macOS/ARM | Configured target-native Actions checks; not executed locally or claimed verified |

Source portability or a wheel filename is not target verification. Unavailable
local targets are delegated to Actions/contributors and do not block local
completion. Final platform claims follow successful target-native reports.

## Ordered remaining gates

1. Finish public docs/source/asset curation and freeze scope/contract/platform
   claims. Preserve custom data, ownership, native ABI and offline operation.
2. Review/activate [the operational workflow](OPERATIONS.md) after go/no-go:
   locally tested monthly claims, changed-only validated promotion, exponential
   retries bounded by 72 hours and idempotent failure-issue reconciliation.
   Ordinary builds use committed data. Local policy/Git/fake-API tests and
   actionlint do not establish successful remote Actions or permissions.
3. Let the configured Actions matrix verify unavailable target-native artifacts.
   The release workflow gates a draft prerelease on all target results and
   validated checksums; it does not publish registries or claim local validation
   of other operating systems. Owner review still controls final publication.
4. Re-run dependency advisories, actual package contents, secret/ref/history and
   non-code-asset review. Earlier scans are bounded historical evidence, not a
   guarantee for changed source or unreachable/compressed Git objects.
5. Resolve or explicitly review the ADE redistribution evidence gap. ANPR/Istat
   permission evidence is archived; ADE public consultability is not a grant.
   No publisher contact is requested or implied. [Rights inventory](DATA-LICENSES.md).
6. Freeze coordinated versions/lockfiles/source/artifact hashes; run the full
   [cross-layer gate](TESTING.md) and installed consumers on that exact candidate.
7. Present go/no-go, platform limitations, residual rights/security risks and
   controlled remote actions. Only then perform authorized publication and
   verify actual public endpoints/installations.

## History and preservation

Publication uses the existing repository. Original work, sessions, source
archives, history and historical release assets have private preservation
requirements; do not erase them to make a public tree smaller. Public initial
import must be honest, not a fabricated timeline or reassigned historical tag.
Before replacing remote refs, recheck all heads/tags/releases, preserve the exact
candidate too, use explicit leases and a reviewed target/ref plan, never blind
force or mirror pushing. Local preparation does not itself change visibility.

## Operational rollback

Channels select complete compatible, hash-addressed runtime/data/notices sets.
A rollback selects an intact compatible release manifest; never mix individual
old/new resource files or overwrite immutable resources. Cache fallback is not
proof that a failed deployment was rolled back. Verify the hosted manifest and
all referenced hashes after an authorized promotion/rollback. Offline packages
remain pinned to their included snapshot until replaced or supplied custom data.

## Current unresolved risks

- ADE T2/publication reuse terms remain undocumented, not silently cleared.
- Other native targets await their real Actions results; local minimum Python checks passed.
- Final full candidate gate, source/history security review and public security
  reporting activation remain unfinished.
- Workflow source changes/local tests are not successful remote CI executions.

Code notices are delivered through hashed inventories in npm/profile/Vite/
native/Python outputs; font OFL and geographic attribution remain separate.
No public npm/PyPI package, Pages channel, release or new Git history is claimed
by this readiness document.
