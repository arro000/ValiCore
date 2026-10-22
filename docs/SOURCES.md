# Source assessment and recommended reconciliation

## Recommendation

Keep **ANPR as the primary municipality history**, add **ISTAT as an independent
administrative cross-check**, and use **Agenzia delle Entrate for fiscal-code
catalog questions**. Multiple sources are useful when each has a defined role;
blindly combining them or replacing historical rows with current records is not.

## Current sources and limits

| Source | Current role | Coverage boundary |
| --- | --- | --- |
| [ANPR municipality archive](https://www.anagrafenazionale.interno.it/area-tecnica/archivio-storico-dei-comuni/) | Primary names, Belfiore/ISTAT codes, aliases, administrative versions, province membership | Administrative validity dates do not establish fiscal-code allocation dates; source publication may lag recent changes |
| [ANPR decoding tables](https://www.anagrafenazionale.interno.it/area-tecnica/tabelle-di-decodifica/) — foreign countries | Official birth-eligible foreign places and Zxxx codes | The checked workbook is not an exhaustive archive of ceased foreign countries; citizenship-only rows are not birthplaces |
| [Revenue-agency T2](https://www1.agenziaentrate.gov.it/servizi/codici/ricerca/VisualizzaTabella.php?ArcName=00T2) | Province names associated with abbreviations, including FO and FC | A tax-form decoding table, not a complete province history or complete catalog of all current/historic territorial units |
| [Supplementary labels](../data/reference/province-supplements.json) | Names for codes absent from T2, EE grouping, typographic display corrections | Reviewed project metadata, not a separately downloaded official historical province dataset; references and aliases are preserved |

Checked on 1 October 2026: the ANPR CSV declares **4 June 2026**, and the
foreign-country publication page declares **12 January 2024**. A successful
download today is not evidence that the underlying content was updated today.
T2 does not declare an effective history for each name; its reference date is
left unknown. Hashes and download metadata are tracked independently.

The archive preserves 19,364 municipality records, not 19,364 distinct current
municipalities. It includes 7,894 active records and 28 ceased records with no
usable Belfiore. Those missing codes are retained as null rather than invented.

Source provenance and successful schema/conformance tests make these appropriate
official inputs. They are not proof that every historical entry is correct or
that the aggregate archive covers every possible fiscal birthplace. The verified
Cattolica example is consistent with the raw ANPR FO/RN versions; its initial
selection error was in the demo, not in synchronization.

## Additional sources worth integrating

### Observed difference: the 2026 Sardinian administrative reform

A targeted manual comparison on 1 October 2026 used the
[current ISTAT municipality XLSX](https://www.istat.it/storage/codici-unita-amministrative/Elenco-comuni-italiani.xlsx)
and the ANPR snapshot. Both contain 7,894 current municipality rows, but their
administrative identifiers/membership are not identical:

| Municipality | ANPR current record | ISTAT 2026 record | Belfiore in both |
| --- | --- | --- | --- |
| Olbia | ISTAT 090047, SS | ISTAT 113017, OT, Gallura Nord-Est Sardegna | G015 |
| Cagliari | ISTAT 092009, CA | ISTAT 118006, CA | B354 |
| Sassari | ISTAT 090064, SS | ISTAT 112050, SS | I452 |

The [ISTAT administrative-code publication](https://www.istat.it/classificazione/codici-dei-comuni-delle-province-e-delle-regioni/)
explicitly adopts the new Sardinian statistical codes from 1 January 2026.
This demonstrates why equal counts and a more recent ANPR download/reference
date are insufficient cross-checks. The former ANPR-only selector could lag that
administrative/statistical classification even when the Belfiore was unchanged.

For up-to-date administrative forms, dated ISTAT current membership/names should
be reconciled with the ANPR history. In particular, the legacy OT display name
Olbia-Tempio must not be indiscriminately reused for the new Gallura Nord-Est
Sardegna unit. A complete solution needs temporal province identities/names,
not only a static abbreviation-to-name dictionary. The runtime now applies the
verified Sardinian mappings as dated overlays and scopes the OT/CI replacement
names by date; exact original ANPR payloads remain archived.

### Recommended integrations

1. **[ISTAT administrative codes and variations](https://www.istat.it/it/archivio/6789)**:
   compare the latest dated list of municipalities, province/city-metropolitan
   names, ISTAT codes, and reported fusions/renamings against ANPR. Use official
   current XLSX/variation publications and their stated reference dates, not an
   old permalink merely because it still returns HTTP 200.
2. **[Revenue-agency archive of municipalities and foreign states](https://arcom.agenziaentrate.gov.it/CitizenArCom/)**:
   resolve fiscal Belfiore discrepancies and investigate ceased foreign-state
   coverage. An integration needs a documented reproducible source or agreed
   export; the consultation interface alone is not an unrestricted bulk API.
3. **Official legal/territorial acts**, when exact historical denomination or
   boundary dates are required: retain them as evidence for dated corrections,
   distinct from undated display labels.

The pipeline now reconciles ANPR, T2, and the national ISTAT current list, and
imports the dated Sardinian code-change package. It emits field-level comparison
reports and derives administrative versions while retaining ANPR Belfiore.
See [the implemented policy](RECONCILIATION.md). A comprehensive historical
foreign-state import remains a recommended extension.

## Reconciliation policy

- Preserve source-specific identifiers, original payloads, effective dates,
  download dates, and immutable snapshots.
- Prefer documented fiscal authority for Belfiore allocation semantics, ISTAT
  for administrative variation evidence, and ANPR for its own historical
  registry versions. Record field-level evidence rather than overwriting rows.
- Compare code, name, province, interval, and date basis; count differences are
  a useful signal but not a complete reconciliation.
- Report conflicts explicitly. Do not invent province/date changes, convert
  unknown Belfiore to a successor's code, or silently treat an unavailable
  territory check as valid.
- Keep human-facing names/aliases separate from fiscal identifiers. A place
  can change province or spelling while keeping the same Belfiore.

Actual allocation and person correspondence in the tax registry require the
[official verification service](https://telemanagrafici.agenziaentrate.gov.it/VerificaCF/Scegli.jsp)
or an authorized integration. No offline catalog can establish that allocation.
