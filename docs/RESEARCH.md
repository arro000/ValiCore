# Initial research: codice-fiscale-js

Verified on 1 October 2026 against npm **2.4.0** and commit
`d9c19f359096c8b459b4b47d2bada10e4927e918` of
<https://github.com/lucavandro/CodiceFiscaleJS>.

The published CommonJS bundle matches the repository bundle byte-for-byte;
SHA-256: `98140e9f7217ed3664fd0daf20608c45c1de7f948b4c2834900c3de31ab4cdcd`.
This was source inspection and targeted behavioral testing, not a complete
execution of the upstream test suite.

## Existing functionality

Calculation, name/surname/date/sex encoding, checksum, format/checksum
validation, reverse decoding, omocodia, municipality/country lookup,
historical tuples, browser helpers, TypeScript declarations, and a CSV
update script are present. It is a useful functional benchmark.

## Reproduced gaps

| Area | Observed result |
| --- | --- |
| Invalid calendar | `check('RSSMRA85B31H501B')` returns true for 31 February |
| Invalid day/sex | Days 00, 32, 40, 72 can pass format/checksum |
| Unknown code | `RSSMRA85A01A000H` passes `check`, then reverse lookup fails |
| Date normalization | Encoding 31 February 1985 silently produces 3 March |
| Omocodia | 127 variants from already omocodic `RSSMRAU5C15H501O`; only 63 pass the package's own check, with `undefined` in malformed variants |
| Detection | `isOmocodia('invalid')` returns true |
| Century | Reverse decoding guesses 19xx/20xx using the current year |
| Accents | `surnameCode('Éé')` returns XXX, unlike Ee → EEX |
| Types | Runtime APIs such as static isOmocodia/reverse/deomocodification are missing from declarations |

Its territorial records model code, province, name, and active flag, rather
than temporal versions with provenance. The update script preserves existing
foreign entries without refreshing them, appends new municipality tuples,
and recalculates municipality flags. It does not reconstruct a dated archive.

## Initial ISTAT comparison and revised source choice

The legacy ISTAT CSV used upstream returned 7,896 municipalities and separate
Castegnero/Nanto rows, with HTTP Last-Modified 26 January 2024. The official
XLSX permalink was dated 21 February 2026, contained 7,894 municipalities,
and included Castegnero Nanto `M439`.

The user subsequently selected the ANPR historical CSV as the project source.
It provides dated record versions and includes the fusion boundaries directly.
See [ANPR data](DATA.md). Freshness is determined from source reference dates
and content, not merely a successful recent download.

## References

- [Upstream core](https://github.com/lucavandro/CodiceFiscaleJS/blob/d9c19f359096c8b459b4b47d2bada10e4927e918/src/codice-fiscale.js)
- [Upstream locations](https://github.com/lucavandro/CodiceFiscaleJS/blob/d9c19f359096c8b459b4b47d2bada10e4927e918/src/comune.js)
- [Upstream date utilities](https://github.com/lucavandro/CodiceFiscaleJS/blob/d9c19f359096c8b459b4b47d2bada10e4927e918/src/utils.js)
- [Upstream updater](https://github.com/lucavandro/CodiceFiscaleJS/blob/d9c19f359096c8b459b4b47d2bada10e4927e918/update_comuni.js)
- [Official allocation verification service](https://telemanagrafici.agenziaentrate.gov.it/VerificaCF/Scegli.jsp)
- [DM 23 December 1976, reproduced in the Official Gazette](https://www.gazzettaufficiale.it/atto/serie_generale/caricaArticolo?art.codiceRedazionale=098A2638&art.dataPubblicazioneGazzetta=1998-04-01&art.flagTipoArticolo=2&art.idArticolo=1&art.idGruppo=0&art.idSottoArticolo=1&art.idSottoArticolo1=10&art.progressivo=0&art.versione=1)

The upstream repository uses CC-BY-SA-4.0; this project is an original
implementation of the rules with independently acquired official source data.
