# Dated geographic data and evidence

`state.json` selects the current immutable fiscal-geography snapshot.
`sources/` preserves original hash-addressed downloads; `reference/` holds
reviewed supplementary metadata and [permission evidence](reference/licenses/index.json).
`canonical/`, `snapshots/`, `diffs/` and `reconciliation/` are importer outputs.

Do not hand-edit generated data, prune source history or infer legal dates.
Update the importer/reference evidence and run an explicitly authorized sync.
Normal builds/tests consume committed data and require no live downloads.

The beta distributes only geographic datasets; fiscal algorithms need none.
Source attribution and pending ADE reuse terms are described in
[redistribution and attribution](../docs/DATA-LICENSES.md). MIT applies to project
code, not to every archived source document or dataset.

[Schema and coverage](../docs/DATA.md) · [sources](../docs/SOURCES.md) ·
[reconciliation policy](../docs/RECONCILIATION.md).
