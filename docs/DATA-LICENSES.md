# Dataset redistribution and attribution

MIT covers project code, not a blanket relicensing of datasets, source documents,
runtime dependencies, fonts or other assets. Provenance and permission to
redistribute are separate checks. Pending entries below are not permission
grants or legal advice.

## Geographic beta inventory

| Material | Evidence | Redistribution condition |
| --- | --- | --- |
| ANPR municipality history and foreign decoding tables | Ministry of the Interior's [legal notice](https://www.anagrafenazionale.interno.it/note-legali/) states CC-BY-4.0 unless otherwise specified, including third-party exceptions | Preserve Ministry attribution, original URLs, license link and transformation notice; review source-specific exceptions |
| ISTAT administrative lists and Sardinian variations | [Istat legal notice](https://www.istat.it/note-legali/), with archived permission evidence | Attribute Istat, link sources/license, identify transformations; check source-specific notices |
| ADE T2 province labels and referenced fiscal publications | Source URLs/hashes are preserved; the reviewed [privacy/legal page](https://www.agenziaentrate.gov.it/portale/web/guest/privacy) does not establish a dataset redistribution grant | **Pending:** applicable terms or qualified legal basis must be reviewed; do not assign CC-BY or MIT by analogy |
| Supplementary geographic labels | [Reviewed project metadata](../data/reference/province-supplements.json) preserves supporting sources | Distinguish project-authored reconciliation from third-party originals; review terms for referenced documents |

[CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/) requires appropriate
credit, a license link and an indication of changes. Do not imply provider
endorsement or impose additional restrictions on the licensed material.

**ADE terms remain unresolved for the combined geographic distribution.** Public
consultability is not a redistribution grant. The source has not been silently
removed, nor have unknown rights been represented as cleared. Publication needs
an explicit go/no-go review of this residual issue; no contact with publishers
is required or implied by these preparation steps.

## Geographic attribution

Sources: Ministero dell'Interno (ANPR municipality archive and foreign decoding
tables), Istat (administrative lists and Sardinian variations), and Agenzia delle
Entrate (T2 province labels, applicable reuse terms still under review). ANPR and
Istat site notices state Creative Commons Attribution 4.0 unless otherwise
specified. ValiCore converts/reconciles source editions into dated JSON,
normalizes fields and derives evidence-linked administrative overlays. Original
URLs, hashes and reference dates are preserved in snapshot provenance. No
provider endorses ValiCore. The derived catalog does not prove tax-registry
allocation or universally complete geographic history.

This attribution does not close the pending rights review. Shipped notices must
carry attribution and limitations rather than relying on a private audit.

## Preserved evidence

[Evidence inventory](../data/reference/licenses/index.json) identifies the
compressed original pages and decoded SHA-256 values. On 2026-10-21 the ANPR
notice was captured successfully. Its separate CC0 exception for the site's
"Numeri" section is not applied to municipality/foreign tables. The live Istat
legal URL returned 403; the archived statement was decompressed and hash-checked
instead. The captured ADE page concerns privacy/cookies and supplied no dataset
redistribution grant. These observations are dated evidence, not assurances
that external pages or source-specific terms will remain unchanged.
