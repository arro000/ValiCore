# Documentation

Start with the [README](../README.md) and [beta PRD](../PRD.md). The current scope
is Italian fiscal identity and geographic history. Implemented checks do not
prove official allocation, identity, universally complete history or performance
budgets.

| Question | Document |
| --- | --- |
| What remains before publication? | [Release readiness](RELEASE.md) |
| How do monthly retries, promotion and failure reporting work? | [Operations](OPERATIONS.md) |
| Where does code belong? | [Modules and filesystem](MODULES.md) |
| What are the API semantics? | [Architecture](ARCHITECTURE.md) |
| How are runtimes/components selected? | [Composition](MODULAR-BUILD.md) |
| How do buffers/handles work? | [ABI](ABI.md) |
| How do defaults, custom data, cache and fallback work? | [Distribution](DISTRIBUTION.md) |
| How do I install/use Python? | [Python](PYTHON.md) |
| Does a VAT checksum prove registration? | [VAT](VAT.md) |
| Does a REA presentation prove allocation? | [REA](REA.md) |
| How are candidate dates compared with place history? | [Birthplace history](BIRTHPLACE-HISTORY.md) |
| Which names and package locations apply? | [Naming](NAMING.md) |
| What does the catalog cover? | [Data/schema](DATA.md) |
| Which authority supplies which facts? | [Sources](SOURCES.md) |
| Which permissions are evidenced or pending? | [Data attribution/licenses](DATA-LICENSES.md) |
| How are source disagreements retained? | [Reconciliation](RECONCILIATION.md) |
| How do HTML selectors work? | [UI adapter](UI.md) |
| How is behavior verified? | [Testing](TESTING.md) |
| How should performance be measured? | [Performance](PERFORMANCE.md) |

[JS/TS package](../packages/js/README.md) · [Python package](../packages/python/README.md) ·
[Contributing](../CONTRIBUTING.md) · [Security](../SECURITY.md)

README files are entry points; contracts live here. Add declarations and tests
with API changes. Do not copy stale development reports or deferred prototype
features into release claims.
