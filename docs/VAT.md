# Italian VAT-number formal validation

`validate_italian_vat` (Rust) and `validateItalianVat` (JSON ABI/JS/TS) are in the
fiscal-identity module. They need no geographic catalog. The jurisdiction is
explicitly Italy, independent of wrapper language, UI language or locale.

## Source scope and edition

1. Ministry of Finance, *Decreto ministeriale 23 December 1976*, GU no. 345,
   29 December 1976, ordinary supplement. The ministry database labels it
   `13813`; its articles 8–9 are in force from **1977-01-13**:
   - [Article 8: eleven-digit numeric scheme](https://def.finanze.it/DocTribFrontend/getAttoNormativoDetail.do?ACTION=getArticolo&id=%7B8D93A450-E5FE-47FC-A6F0-F938769051BF%7D&codiceOrdinamento=200000800000000&articolo=Articolo%208)
     describes seven serial digits, three issuing-province digits and one check
     digit for non-personal fiscal codes.
   - [Article 9: numeric check digit](https://def.finanze.it/DocTribFrontend/getAttoNormativoDetail.do?ACTION=getArticolo&id=%7B8D93A450-E5FE-47FC-A6F0-F938769051BF%7D&codiceOrdinamento=200000900000000&articolo=Articolo%209)
     specifies the weighted decimal sum described below.
   - [Ministry legal notice](https://def.finanze.it/DocTribFrontend/noteLegali.jsp):
     these texts are **free, informative, non-official reproductions**; the
     certified/printed Gazzetta text prevails in a discrepancy. Reproduction is
     permitted with source, gratuitousness and non-official status identified.
     No statement here treats the ministry HTML as a certified legal copy.
2. European Commission, *Study on Taxpayer Identification Numbers (TINs) and
   possible verification instruments*, **June 2026**, final report, volume 2,
   printed page **10**, Italy row:
   [Commission-hosted report](https://taxation-customs.ec.europa.eu/document/download/4946617a-f656-465c-9fb7-2bca7c4eb95d_en?filename=TIN%20Study_Final%20Report_Volume%202%20Annexes_clean.pdf).
   It identifies the VAT number as the eleven-digit numeric scheme with serial
   digits 1–7, issuing-office digits 8–10 and a checksum at digit 11, and an `IT`
   prefix for intra-EU presentation. This is a commissioned descriptive report,
   not a new normative allocation rule. Do not extrapolate its simplified
   CF/VAT relationship into universal identifier equality or identity matching.
3. [Revenue agency VAT lookup](https://telematici.agenziaentrate.gov.it/VerificaPIVA/Scegli.do)
   distinguishes registry presence/activity/ownership from a local numeric
   calculation. Its footer independently publishes `06363391001` as its fiscal
   code and VAT number; this is a checksum reference, not a live status query.
   No captcha submissions or registry lookups were automated.
4. [FatturaPA controls, version 2.0 dated 2025-01-31](https://www.fatturapa.gov.it/export/documenti/fatturapa/v1.4/Elenco-Controlli-versione-2.0.pdf),
   section on existence/validity of fiscal identifiers, describes checks against
   Anagrafe tributaria. These remote invoicing controls are **not implemented**
   by a local checksum validator.

Downloads observed on **2026-10-05**, retained under
`/tmp/opencode/valicore-vat/` and its `retry/` subdirectory:

| Retrieved bytes | SHA-256 |
| --- | --- |
| Ministry article 8 HTML | `fd11423d4295b41863a8707a2e039a6a69a37d4c0f09f7f1abd2dd787ec3ac15` |
| Ministry article 9 HTML | `3e9333aea21985f5bb19be026fd37e4d663f2a537407ed7ef36602f2dfab1d03` |
| Ministry legal notice HTML | `91fff604ea0fcc5cd9ff4cb070b69fcd9afbae09c78a4cfa609636c1b825e979` |
| Commission report PDF | `0674357130f7191a3f76120bdcb37634db2ef906c57fe3f0d42fb5f640bb065a` |
| FatturaPA controls PDF | `a3ec6b4b5f74c43bca8c5849f49b33d2c9b0784c5d227f32a25a81b1d7caf9f2` |

Initial speculative supplement/PDF URLs returned 404, and the OECD TIN endpoint
returned 403. The main Gazzetta scan only lists the separate supplement. None
of these failures supplies a substitute algorithm. The successful ministry
search and the linked official publishers above resolve the bounded formal-rule
source gate; the absent certified supplement is not used as an invented source.

## Implemented rules and input policy

- Exactly **eleven ASCII digits**, preserving all zeros. Optional ASCII `IT`
  prefix is accepted case-insensitively and removed. This normalization policy
  does not infer a country from locale or accept other country prefixes.
- No spaces (including surrounding spaces), tabs, newlines, punctuation, signs,
  Unicode digit variants or lookalikes. Non-string ABI/JS inputs return
  `INVALID_ARGUMENT` with field `vat`, rather than losing leading zeros.
- On the first ten digits, sum one-based odd positions unchanged. Double each
  even-position digit and sum the decimal digits of that product. The eleventh
  digit is `(10 - (sum % 10)) % 10`. `vat.rs` calls the existing Rust
  `numeric_checksum` function; no second VAT algorithm exists in a wrapper.
- No serial-allocation checks or office-code allowlist. In particular, **the
  proposed `888/999` exception claims remain unverified and are not implemented
  restrictions or asserted allocation rules**. Artificial examples for `000`,
  `120`, `121`, `888`, `999` office digits exercise only the numeric calculation.
  No current province catalog is substituted for fiscal allocation history.

The owner explicitly confirmed **format/checksum** as the fiscal-completion
contract after reviewing the missing issuing-office specification. Office/serial
allocation, proposed `888/999` restrictions and registry attribution remain
outside that confirmed contract; their absence is not disguised as verification.

## Results and limits

`ItalianVatReport` contains `vat` (eleven digits or null on structure failure),
`countryCode: 'IT'`, `scope: 'format_checksum'`, `valid`, `ruleEdition` and checks
`structure`, `checksum`, `registry`. Checksum is `not_run` after structure failure;
`registry` is **always `not_run`**. Definite formal failures have English messages
and `INVALID_ITALIAN_VAT_STRUCTURE` or `INVALID_ITALIAN_VAT_CHECKSUM` codes.

**`valid: true` means only format and checksum passed.** Even `00000000000` passes
that bounded calculation; the result does not make it an allocated VAT number.
Do not present the boolean as registry validity. Allocation, an active/ceased
business, ownership, VAT-group membership, VIES eligibility and invoicing
acceptance require separate authoritative checks. There is no network/clock in
these Rust rules, no registry lookup capability and no automatic exemption
inferred from the number. The generic numeric-CF API remains separate; it is not
renamed into VAT validation and does not gain person semantics.

```ts
const engine = await createValiCore({
  catalog: false, distribution: { mode: 'bundled' },
});
try {
  const report = engine.validateItalianVat('IT06363391001');
  console.log(report.vat); // '06363391001'
  console.log(report.valid, report.scope); // true, 'format_checksum'
  console.log(report.checks[2].status); // 'not_run': registry was not queried
} finally { engine.dispose(); }
```

## Independent verification

`tools/tests/generate_vat_vectors.py` does not import ValiCore. It uses a decimal
substitution table plus exhaustive final-digit search, rather than the Rust
arithmetic implementation. Fixed seed `20261005` and position/value coverage
produce **226 formal-positive and 2,508 negative cases**, including single-digit
mutations, unsupported prefixes, Unicode lookalikes, whitespace, sizes and
placeholders. They are not allocation fixtures.

Corpus: `tests/fixtures/italian-vat-vectors.json`, SHA-256
`983ac9f637ff72ad9842340826ade93edd85ce07743b93c13a0d1151e55dd310`.
Rust domain/ABI, native ABI and real WASM consume these expectations; JS checks
catalog-backed and catalog-free modes, malformed types and disposal. Browser
checks include catalog-free VAT use without dataset requests. Reproducibility
and the corpus hash/counts are included in the full verification gate.

These bounded matrices are not a proof of correct allocation or universal
registry acceptance. The source corpus, geographic data and existing fiscal
vectors are preserved independently.

### Verified checkpoint (2026-10-05)

Runtime `1312a5f4fbeab68c52c2` passed the rebuilt **18-phase** full gate, including
42 JS tests, 21 browser tests, 12,335 native ABI calls, Rust/importer/TypeScript/
HTTP distribution checks, eight compiled and fourteen executed JS/TS examples.
Report: `verification-reports/extensive-2026-10-05T14-22-30-062Z.json` (ignored
local evidence; revision `30591d3` plus a dirty working tree, not a release).

A real npm tarball was installed into a separate offline consumer. The shared
VAT corpus passed with a catalog, then without a catalog while that consumer's
`places.json` was deliberately unavailable; the installed TypeScript declarations
also passed checks. Rustdoc passed with warnings denied. All 167 pre-existing
protected data/archive/corpus/tooling files retained their SHA-256 hashes. No
live geographic sync or public publication occurred. The initial gate's new JS
expectation for nonfinite numbers was corrected to test the existing generic
transport error separately from domain-field errors; neither guard was weakened.

Before the authorised VAT commit/push, the subsequent Actions archive commit
`91e5787` was inspected and fast-forwarded: only new hash-verified archives and
source-check metadata changed, not source code or the dataset snapshot. The
integrated tree passed all 18 phases again:
`verification-reports/extensive-2026-10-05T14-26-54-865Z.json` (revision `91e5787`
plus the pending VAT working tree). All 166 protected files other than the
explicitly reviewed `data/state.json` metadata update remained byte-identical;
all pending VAT files were preserved during the fast-forward.
