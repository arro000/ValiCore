# CF candidate-date administrative history

`Engine::birthplace_history`, JSON/JS/TS `birthplaceHistory` and Python
`birthplace_history` compare **every calendar candidate** decoded from a personal
Italian fiscal code with its documented administrative place intervals. This is
an explicitly separate report, not a stricter fiscal-code validator or an
allocation lookup. No candidate century is selected or removed.

## Source and confirmed scope

Article 5 of the Ministry reproduction of the *DM 23 December 1976*, effective
1977-01-13, specifies the **last two digits** of the birth year, month/day/sex
encoding, and birthplace codes from the cadastral municipality/foreign-state
volumes:
[article 5](https://def.finanze.it/DocTribFrontend/getAttoNormativoDetail.do?ACTION=getArticolo&id=%7B8D93A450-E5FE-47FC-A6F0-F938769051BF%7D&codiceOrdinamento=200000500000000&articolo=Articolo%205).
It does not establish a rule for rejecting centuries from ANPR administrative
intervals. The Ministry text is informative/non-certified; its reuse/status
limitations are explained in [VAT sources](VAT.md).

Retrieved original HTML SHA-256:
`b1d2b5f4ca14369b62baf5fbb419694782610cc28f576262b25ad2a9c3aa4ce4`.
Original HTML, literal XML and extracted text are retained in the local research
folder `/tmp/opencode/valicore-fiscal-expansion/fiscal-source-review/`. Downloaded
JavaScript was not executed to extract the text.

[ANPR–ISTAT provenance](DATA.md) supplies administrative versions, not a complete
chronology of tax-registry code allocation. The owner confirmed a separate
candidate-by-candidate administrative report, preserving fiscal validity,
century ambiguity and unknown dates. Automatic century rejection and office
allocation restrictions are not substitutes for these sourced contracts.

## Operation and results

```ts
const report = engine.birthplaceHistory('RSSMRA85C15H501R', {
  yearRange: [1800, 2099],
});
for (const candidate of report.candidates) {
  console.log(candidate.birthDate, candidate.status, candidate.compatible);
}
console.log(report.allocationCheck.status); // not_run
```

Input options are the existing strict `DecodeOptions`: optional `yearRange`
within 1–9999, default the whole range. `onDate`, validation levels, guessed
century policies and unknown fields are rejected. Fiscal structure, checksum
and Gregorian calendar validation occur before history reporting; numeric CF
has no encoded personal birthplace/date and cannot be decoded as one.

The report contains:

- `scope: "administrative_birthplace_history"`; there is **no top-level `valid`**
  that could be confused with fiscal validity.
- `decoded`: all original fiscal fragments, omocodia mask and **all** calendar
  `candidateDates`, in unchanged chronological order.
- `dataVersion`: loaded geographic version, or null without a catalog. ATECO is
  neither required nor consulted.
- `records`: every source version of that Belfiore code in original row order,
  including other centuries, ceased records, uncertain dates and source flags.
- `candidates`: one row per unfiltered calendar date, with `birthDate`,
  `status` (`pass/fail/unknown`), `compatible` (`true/false/null`) and optional error.
- Each candidate partitions source IDs into `matchingRecordIds`,
  `uncertainRecordIds` and `excludedRecordIds`, preserving source order within
  each partition. IDs reference the top-level `records`; no source row disappears.
- `allocationCheck: { name: "fiscal_allocation", status: "not_run" }` always.

## Interval policy

Ends are inclusive. A documented start plus a covering end, or an open end
(`validTo: null` in the geographic schema), supplies a **matching administrative
interval**. This is an interval query on the loaded snapshot, not evidence that
an entity will exist in a future year.

A missing start is unknown, not an inferred founding date or negative infinity.
If such a record is not excluded by a known end, it remains uncertain. A known
bound excluding the date suffices to exclude that record, even when the other
bound is unknown.

| Evidence for a date | Candidate result |
| --- | --- |
| At least one matching interval | `pass`, compatible true |
| No match, at least one uncertain record | `unknown`, compatible null, `UNKNOWN_PLACE_DATES` |
| Catalog not loaded | `unknown`, compatible null, `CAPABILITY_UNAVAILABLE` |
| No record in loaded snapshot | `unknown`, compatible null, `PLACE_NOT_IN_DATASET` |
| Nonempty records, every interval excludes the date | `fail`, compatible false, `PLACE_DATE_MISMATCH` |

Even when there is a matching interval, overlapping uncertain/other records
remain visible in their partitions. A failure means **incompatible with these
recorded administrative bounds**, not invalid fiscal allocation or proof that
no undocumented historical place existed. `birthAllowed`, active/ceased status
and province labels are retained as independent evidence, not rewritten into
this date verdict.

`validate`, `decode`, `matchesPerson` and generation retain their existing
contracts. In particular, this report does not restrict generation from a bare
explicit Belfiore code or make a ceased municipality automatically invalid.
Catalog-free history produces unknown rows for every date, not an empty set or
a hidden downgrade of requested constraints.

## Verification

`tools/tests/generate_birthplace_history_vectors.py` imports neither Rust nor
ValiCore. Fixed correct CF references come from the existing independent fiscal
corpus; Python `datetime.date` independently enumerates centuries/leap dates and
compares bounds. Bounded source cases exercise closed intervals, unknown starts,
undated records, exact endpoints and full chronological candidate preservation.

Rust/facade and JSON ABI tests additionally cover inclusive boundaries, open
ends, all 128 omocodia masks, known administrative mismatches with unchanged CF
validation/generation, strict options/types and returned-snapshot isolation.
Actual WASM/native, separately installed Python, JS/TS and browser tests consume
the contract. The full gate records corpus/runtime/geographic hashes and
revision/working-tree state; normal verification performs no live data sync.
