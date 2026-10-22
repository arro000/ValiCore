# Automatic ANPR–ISTAT reconciliation

Monthly/manual synchronization downloads
ANPR municipalities/countries, revenue-agency T2, the current ISTAT municipality
XLSX, its dated publication page, and the dated Sardinian code-change ZIP.
All downloads are hash-addressed, including the page evidencing the list's
reference date. Only Python's standard library is required.

## Source roles

- **ANPR** supplies municipality history and the fiscal Belfiore kept in derived
  administrative rows. Country import remains ANPR-based.
- **ISTAT current list** supplies current administrative identifiers, province
  membership, names, and an independent Belfiore comparison.
- **ISTAT Sardinian variations** supplies old/new code correspondence and its
  explicitly declared 1 January 2026 statistical start.
- **T2 and reviewed supplements** supply historical name defaults. New province
  labels do not inherit their predecessors' names as search aliases.

The national 1991–2025 variation workbook linked on the ISTAT page contains
aggregated counts, not individual municipality events. It is not used to invent
event dates. This integration imports the dated Sardinian mapping and compares
the full national current list; it is not a comprehensive SITUAS event-history import.

## Matching and dates

1. Validate each edition's schema, unique six-digit ISTAT/Belfiore identifiers,
   two-letter province codes, consistent province names, and nonempty content.
2. Match current municipalities to active ANPR municipalities by Belfiore. Check
   separately whether the ISTAT identifier belongs to a different ANPR Belfiore.
   Disagreement is reported; no fiscal code overwrites an ANPR value.
3. Compare names, ISTAT codes, and province membership. Case/accent/punctuation
   changes do not create versions. Overlapping original/alternative-language
   names appear as `nameVariants` rather than administrative changes.
4. When old/new ISTAT correspondence and municipality name match a Sardinian
   variation, use its documented statistical date. Otherwise a difference can
   create an observation from the list's **reference date**, not an asserted
   legal founding/change date. A date predating the latest known ANPR/derived
   version is unresolved and leaves that version intact.
5. Split the **derived runtime view**: the previous record ends inclusively the
   day before the boundary; an `istat-current:<code>:<date>` row starts at that
   boundary, keeping the ANPR Belfiore and original name aliases. Exact raw ANPR
   payloads and prior immutable snapshots remain archived.
6. Preserve derived versions across subsequent list editions. An unchanged
   administrative row keeps its earlier boundary; a changed observed row splits
   the latest derived interval rather than shifting an earlier date.

An ISTAT-derived row's `sourceId` identifies its administrative source.
`administrativeReconciliation.overlays` identifies the original ANPR record and
date evidence. Clipped ANPR runtime intervals/statuses describe the reconciled
view; source archives hold their exact original intervals/statuses.

## Province-name versions

`provinces` can contain multiple rows per abbreviation, with optional
`validFrom`/inclusive `validTo`. Intervals must be valid and nonoverlapping.
`listProvinces` chooses the name/aliases applicable to `onDate`, or the latest
label without a date. Availability/counts come from place records; a dictionary
entry alone cannot create an available province.

| Query | Result |
| --- | --- |
| Olbia, 2025-12-31 | SS, ISTAT 090047, Belfiore G015 |
| Olbia, 2026-01-01 | OT, ISTAT 113017, Belfiore G015 |
| OT name, 2010 | Olbia-Tempio |
| OT name, 2026 | Gallura Nord-Est Sardegna |
| CI name, 2026 | Sulcis Iglesiente |
| Cagliari, 2026 | CA, ISTAT 118006, Belfiore B354 |

## Reports and discrepancies

Each immutable snapshot embeds `administrativeReconciliation`; the same report
is committed as `data/reconciliation/<version>.json`:

- `referenceDate`, `anprActiveCount`, `istatCurrentCount` establish the editions.
- `differences` records source IDs and field-level ANPR/ISTAT values.
- `nameVariants` records equivalent bilingual/alternative names separately.
- `overlays` contains original/derived IDs, `effectiveFrom`, evidence source IDs,
  immutable original `sourceHashes`, and `dateBasis`: `documented_statistical_effective_date` or
  `current_list_reference_date`.
- `conflicts` contains fiscal mismatches, identifier collisions, absent records,
  and dates that cannot split the known history.
- `summary` provides counts for `datasetInfo().coverage` and the demo.

The checked editions have **377 documented overlays**, **378 differences**, and
**one unresolved disagreement**: ANPR's later Vallecrosia Al Mare version is kept
instead of replacing it with an older ISTAT denomination. Fiscal identifiers
agree for all 7,894 current municipalities in this comparison.

Unknown historical dates and missing fiscal codes remain explicit. Neither an
administrative observation nor a statistical reform proves tax-registry
allocation dates. Historical foreign-country coverage remains source-limited.
