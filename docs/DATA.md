# ANPR–ISTAT data and synchronization

## Official sources

- Municipalities: <https://www.anagrafenazionale.interno.it/wp-content/uploads/ANPR_archivio_comuni.csv>
- Foreign countries/territories: <https://www.anagrafenazionale.interno.it/wp-content/uploads/tabella_2_statiesteri.xlsx>
- [Archive description](https://www.anagrafenazionale.interno.it/area-tecnica/archivio-storico-dei-comuni/)
- [Official decoding tables](https://www.anagrafenazionale.interno.it/area-tecnica/tabelle-di-decodifica/)
- [Municipality legend](https://www.anagrafenazionale.interno.it/wp-content/uploads/2022/10/Legenda-ANPR-archivio-comuni.txt)
- Province names: [Revenue agency T2 table](https://www1.agenziaentrate.gov.it/servizi/codici/ricerca/VisualizzaTabella.php?ArcName=00T2).
  The sync reconciles this additional source by abbreviation and archives its
  original HTML. It currently supplies 107 name records, including FO and FC.
  [Reviewed supplementary labels](../data/reference/province-supplements.json)
  cover the remaining archive codes, including historical FU/PL/ZA/VG, older
  Sardinian codes, and the EE foreign-place group. All 118 codes in this snapshot
  have a display name.
- [ISTAT current municipality workbook](https://www.istat.it/storage/codici-unita-amministrative/Elenco-comuni-italiani.xlsx), dated by its
  [publication page](https://www.istat.it/classificazione/codici-dei-comuni-delle-province-e-delle-regioni/).
- [Dated Sardinian administrative variations](https://www.istat.it/wp-content/uploads/2024/09/Codici-statistici-e-denominazioni-delle-unita-amministrative-della-Sardegna.zip):
  original CSV/XLSX package with previous/new municipality codes and declared
  statistical effect from 1 January 2026.

Verified on 1 October 2026: the municipality CSV has 19,364 records, including
7,894 active and 11,470 ceased records. Its declared update is 4 June 2026.
It contains 28 ceased records with `CODCATASTALE=ND`, preserved as a missing
code. The country workbook has 238 source records; citizenship-only entries
with neither birth eligibility nor a fiscal place code are excluded from the
runtime catalog but retained in the source archive. The initial combined
runtime catalog has 19,574 records.

The reconciled catalog adds 377 dated ISTAT administrative versions: **19,951
records**, still **7,894 active municipalities**. ISTAT's current list is dated
21 February 2026. The comparison records 378 administrative differences and one
unresolved disagreement (the newer ANPR Vallecrosia Al Mare denomination versus
the older ISTAT Vallecrosia list). Equivalent multilingual names are recorded as
name variants rather than manufactured administrative changes.

`data/state.json` and per-snapshot manifests record the current source
reference dates, raw hashes, and publication metadata. A recent download is
not treated as a new source reference date.

## Schema and provenance

The municipality key is `(source namespace, ANPR ID)`. The ID identifies an
administrative **record/version**, not an immutable municipality. Belfiore
and ISTAT codes are indexed separately and may have multiple historical rows.

Runtime place fields:

```text
id, sourceId, sourceRecordId, name, aliases, kind, status,
belfioreCode, istatCode, province, validFrom, validTo,
birthAllowed, sourceUpdatedAt
```

- `CODCATASTALE` supplies Belfiore; `CODAT` supplies foreign Zxxx codes.
- Original denominations, transliterations, alternative-language names, and
  foreign English/ISO aliases are searchable.
- `STATO`: A → active, C → ceased, D → planned.
- Administrative end dates remain **inclusive**, matching the source's
  contiguous daily record boundaries. `9999-12-31` becomes a null/open end.
- Foreign table `1900-01-01` convention dates are not treated as founding
  dates; the runtime leaves such starts unknown.
- Fiscal, ISO, and ISTAT codes remain distinct strings, preserving leading zeros.
- ND is not a valid Belfiore and never becomes a usable encoding code.

## Bootstrap and resync

```sh
python3 tools/data/sync.py
```

The first sync imports the complete source archives. Subsequent runs still
download the full files but reconcile incrementally:

1. New source ID → insert.
2. Existing ID with modified fields → replace that version's payload, while
   preserving earlier immutable snapshots and raw source archives.
3. Unchanged record → no content change.
4. Missing ID → record in the diff and retain its last known payload; do not
   invent a cessation or remove historical records.

ISTAT current lists and variation editions are complete editions: removed rows
are reported in their source diff and are not retained as current entries.
Immutable downloads/snapshots still preserve every previous edition.
The importer compares municipalities by Belfiore, checking ISTAT identifier
collisions independently. Fiscal discrepancies, absent municipalities, and
unresolved date intervals appear in the reconciliation report.
See [Reconciliation policy and format](RECONCILIATION.md) for temporal overlays,
province-name versions, and how unknown effective dates are handled.

Comparison uses fields, not only `DATAULTIMOAGG`. Row reordering does not
create a data release. Canonical runtime content plus reference dates determines
the version suffix. The importer validates schema, duplicate IDs, dates,
Belfiore formats, active code uniqueness, and empty source archives.

The previous source state is replaced only after every source and the full
runtime dataset pass validation. Downloads use bounded retry/timeouts. Raw
sources are gzip archived with hashes; canonical CSV and JSON snapshots use
deterministic ordering and gzip timestamps.

Offline source files are supported for repeatable import/tests:

```sh
python3 tools/data/sync.py --comuni-file archive.csv --countries-file countries.xlsx
# Additional inputs: --provinces-file provinces.html --istat-file current.xlsx
# --istat-page-file publication.html --sardinia-file variations.zip
```

## Stored artifacts

```text
data/state.json                    current snapshot and last check
data/source-state.json.gz          reconciled raw source payloads
data/sources/<source>-<hash>.gz     original source downloads
data/canonical/places.csv          interoperable normalized CSV
data/snapshots/<version>.json.gz   immutable runtime snapshots
data/diffs/<version>.json          insert/update/missing-record details
data/reconciliation/<version>.json field-level ANPR–ISTAT comparison and evidence
```

The workflow commits verified data state and artifacts, so future runs do not
depend on temporary runner storage. Historical immutable files remain in the
repository as evidence; the pre-v1 distribution assembles only the selected
current runtime/dataset, not every obsolete development release. Failed runs do
not promote a partial channel. Rerunning can assemble the same verified state
without new ANPR changes. Public hosting remains disabled during private evaluation.

## Coverage boundaries

Province availability and municipality membership follow ANPR history and
derived, evidence-linked ISTAT administrative versions. Current province labels
come from ISTAT; historical defaults come from T2 and reviewed supplements.
This is not a complete temporal history of every province's legal name.
No founding/renaming date is inferred from the undated T2 table.
Original name spellings are retained as search aliases, with FO displayed as
Forlì and FC as Forlì-Cesena. The optional schema-v1 `provinces` array carries
this registry independently of municipality records. Optional `validFrom` and
inclusive `validTo` delimit nonoverlapping name versions for each code. Undated
labels represent unknown bounds, not an obsolete schema or a compatibility mode.

Municipality history comes from ANPR, including renamed and ceased records.
Those are administrative versions, not a complete history of tax allocations.
The country table does not provide an exhaustive historic foreign-code archive;
for example, the checked source does not enumerate the Soviet Union,
Czechoslovakia, and Yugoslavia under those denominations. Missing codes produce
indeterminate territory reports, and custom datasets can extend coverage.

Source records with undocumented dates retain null values. No successor/fusion
relationship, state founding date, or unknown Belfiore is invented. Core
algorithms support valid foreign/omocodic codes independently of catalog scope;
catalog-based encoding requires a resolvable known code.

Original code is MIT; third-party data/documents retain their own terms.
See [redistribution and attribution](DATA-LICENSES.md), including unresolved
ADE reuse terms and [archived permission evidence](../data/reference/licenses/index.json).
Provenance is included in each dataset and raw archive.
