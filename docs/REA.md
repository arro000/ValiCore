# Italian REA presentation validation

`validate_italian_rea` (Rust), `validateItalianRea` (JSON ABI/JS/TS) and
`validate_italian_rea` (Python) are owned by fiscal identity. No geographic or
business registry dataset is required. This is **presentation-format validation**,
not confirmation that a province/CCIAA or serial is allocated to a business.

## Primary evidence

- [Registro Imprese: CF, VAT and REA](https://www.registroimprese.it/codice-fiscale-p.iva-rea)
  explains that REA is a progressive decimal number associated with the assigning
  province/CCIAA code and publishes `RM-123456` as a presentation example. A
  business can have multiple provincial REA numbers; REA is not a national
  unique business/person identity and is not a VAT number.
- [FatturaPA ordinary invoice schema 1.2.3, format 1.4](https://www.fatturapa.gov.it/export/documenti/fatturapa/v1.4/Schema_VFPR12_v1.2.3.xsd)
  defines REA `Ufficio` as `ProvinciaType`, `[A-Z]{2}`.
- [FatturaPA format specification 1.4](https://www.fatturapa.gov.it/export/documenti/fatturapa/v1.4/Specifiche_tecniche_del_formato_FatturaPA_V1.4.pdf)
  distinguishes the office from `NumeroREA`. The invoice's maximum-20-character
  Basic-Latin number field is a **transport constraint**, not evidence of an
  intrinsic REA serial-length or allocation rule. This API does not validate a
  complete invoice or apply that limit to arbitrary REA presentations.

Observed 2026-10-06; temporary originals in
`/tmp/opencode/valicore-fiscal-expansion/`:

| Evidence | SHA-256 |
| --- | --- |
| Registro Imprese HTML | `002d505e3f9d47a59b94b8f78fdc20ca4537d0ece6de31556daaae983acb2d30` |
| FatturaPA XSD | `152944f6eef9f5d69ef6e955ee173b32142b00a8c1c5222fc97dfab5910e8a8c` |
| FatturaPA specification PDF | `8adde9acf0596f14e2cce66f3c1a4d36ce4e13f65582b45c333fe28eee4d93dc` |

No Telemaco authentication, business-record extraction or registry search was
performed. Failed guessed URLs were discarded, not used as specifications.

## Contract

- Two ASCII letters, `-`, one or more ASCII decimal digits. ASCII lowercase
  office letters normalize to uppercase; digits/leading zeros are preserved.
- No whitespace trimming, Unicode transliteration, alternate dash or number
  conversion. Non-string transport inputs fail with `INVALID_ARGUMENT`, field
  `rea`. Malformed presentations return `INVALID_ITALIAN_REA_STRUCTURE` in the
  structure check, not a coerced number or partial result.
- No invented check digit, province/office allowlist or serial-range restriction.
  Synthetic examples including `ZZ-0` can pass this bounded presentation grammar
  without becoming registered identifiers. Current geographic labels do not
  substitute for dated chamber jurisdiction or allocation evidence.
- Report: normalized `rea`, `provinceCode`, `serialNumber` (null on structure
  failure), `countryCode: 'IT'`, `scope: 'presentation_format'`, `valid`,
  `ruleEdition` and `structure`/`registry` checks. `registry` is always `not_run`.
- Structured outputs are snapshots, not mutable registry state. Calls through
  disposed/wrong-thread wrappers retain the existing lifecycle errors.

## Independent expectations

`tools/tests/generate_rea_vectors.py` uses ASCII regex full-match/capture groups,
not the Rust byte parser, with fixed seed 20261006. All province-letter pairs,
leading zeros, long decimal presentations, mixed case, malformed separators and
Unicode lookalikes are covered. These are **format**, not allocation fixtures.
Rust tests additionally exercise every Unicode scalar in office/serial positions.
The shared corpus is consumed by Rust/ABI, real WASM, native and the independently
installed Python package; reproducibility/hashes are part of the extensive gate.

### Verified intermediate checkpoint

Runtime `ec892ef169e230a243a1` passed the rebuilt **19-phase** gate in
`verification-reports/extensive-2026-10-05T22-46-06-812Z.json` (revision `06e70eb`
plus pending fiscal work, not a committed release). The **680** positive and
**75** negative presentations have corpus SHA-256
`3d2b39d36cf8155eea0456ab9fd6e53fd8d662b577f7423d98153cf2df8c3a77`.
Rust/ABI, real WASM with/without catalog, native (13,096 total verifier calls),
TypeScript, browser/distribution and the independently installed Python consumer
passed; Python ran **13** test groups without skips. All **180** pre-existing
protected data/archive/corpus/design files retained their hashes. Runtime files
were appended, never rewritten. No geographic live sync occurred.
A real npm tarball was independently installed offline and exercised with and
without the catalog; the installed TypeScript declaration/example compiled and
executed. The Python offline example now also emits the REA report and passed
again through the independent installed-wheel consumer.

The broader fiscal-completion milestone also requires ATECO and review of the
remaining CF/VAT requirements. REA alone does not complete that milestone.
