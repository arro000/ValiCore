# Reusable date, province, and municipality fields

The optional browser entry point `@arro000/valicore/ui` binds ordinary
HTML controls to the compiled Rust catalog. It does not require a framework,
CSS package, or fiscal-code calculation. Use your application's own labels and
styles. Native select, input, and datalist elements provide keyboard interaction.
Use the included beta runtime and geographic snapshot; initialization does not
need a remote update channel. Online loading must be selected explicitly and
requires an exactly compatible runtime composition.

The reconciled ANPR–ISTAT catalog preserves dated province names. For example,
Olbia resolves to SS on 2025-12-31 and OT on
2026-01-01 while keeping G015. Searching OT in 2010 displays Olbia-Tempio;
in 2026 it displays Gallura Nord-Est Sardegna. Dates describe administrative
or statistical versions, not fiscal allocation dates.

```html
<label>Birth date <input id="date" type="date" value="1985-03-15" required></label>
<label>Province <input id="province" placeholder="Province name or abbreviation"></label>
<label>Municipality or foreign country <input id="municipality" required></label>
```

```ts
import { createValiCore } from '@arro000/valicore';
import { attachPlaceSelector } from '@arro000/valicore/ui';

const cf = await createValiCore({ distribution: { mode: 'bundled' } });
const selector = attachPlaceSelector({
  engine: cf,
  date: document.querySelector<HTMLInputElement>('#date')!,
  province: document.querySelector<HTMLInputElement>('#province')!,
  municipality: document.querySelector<HTMLInputElement>('#municipality')!,
  onChange: ({ place, resolution, onDate }) => {
    // place contains the complete source record; null means no unique selection.
    console.log(place?.name, place?.province, place?.belfioreCode, onDate);
  },
});

// Use the selector in a standard personal-data form without asking for Belfiore.
const code = cf.encode({
  name: 'Mario', surname: 'Rossi', sex: 'M', birthDate: '1985-03-15',
  birthplace: selector.query(),
});

// Or use it independently: no person or fiscal code is needed.
selector.value;     // selected ANPR record, or null
selector.resolve(); // full unique/ambiguous/missing/missing_code resolution
selector.dispose();// remove listeners and the generated datalist
cf.dispose();
```

Province lists come from `cf.listProvinces({onDate, query})`, not a separate JavaScript
province catalog. A province input searches names, aliases, and abbreviations
and displays labels such as `Forlì (FO)` or `Roma (RM)`. A native province select
is still supported and now displays names alongside codes. Municipality autocomplete uses `searchPlaces` with both province and date
constraints. Belfiore is resolved internally and remains available in the
returned record. Province labels use source abbreviations; `EE` groups foreign
countries and territories eligible as birthplaces.

## Date and selection behavior

- Changing the province clears the municipality, preventing a stale selection
  from another province.
- Changing the date updates a selected place to a record with the same Belfiore
  in the new administrative interval, including any province change.
- When that Belfiore did not exist in the new interval, the selector retains
  the name for a fresh resolution and discards the stale code. Missing/ambiguous
  input remains explicit; no fuzzy suggestion is silently chosen.
- Native datalist selection preserves its record association through input
  events. Exact-name input is also accepted when it resolves uniquely.
- Programmatic changes need `selector.refresh()`; native user input updates
  automatically. The callback and a bubbling `placechange` event carry the
  selected record, resolution, province, and reference date.
- With an empty date, the full archive is searched, including historical
  versions. Birth forms should require a valid date to constrain the interval.

The date constrains administrative source records, not official tax allocation.
For example, ANPR lists Cattolica as `FO` until 1992-04-15 and `RN` from
1992-04-16. Its Belfiore remains `C357`; changing the province label does not
change that fiscal place code. Do not replace historic FO with today's FC.

For framework-specific components, the headless API is also available:

```ts
cf.listProvinces({ onDate: '1985-03-15' });
cf.listProvinces({ onDate: '1985-03-15', query: 'forli' }); // Forlì (FO)
cf.searchPlaces('Cattolica', { province: 'FO', onDate: '1985-03-15' });
cf.resolvePlace({ name: 'Cattolica', province: 'FO', onDate: '1985-03-15' });
```

The demo's **Calculate** and **Place selector** tabs use this same exported
adapter. The UI entry point is optional; Node/Rust/native clients use the
catalog operations directly.
