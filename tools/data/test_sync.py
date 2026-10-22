import copy
import csv
import gzip
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
import zipfile
from xml.sax.saxutils import escape

spec = importlib.util.spec_from_file_location("anpr_sync", Path(__file__).with_name("sync.py"))
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


def municipality(id="1", **changes):
    return {"ID": id, "DATAISTITUZIONE": "1861-03-17", "DATACESSAZIONE": "9999-12-31", "CODISTAT": "058091", "CODCATASTALE": "H501",
            "DENOMINAZIONE_IT": "ROMA", "STATO": "A", "SIGLAPROVINCIA": "RM", "DATAULTIMOAGG": "2026-06-04", **changes}


def csv_bytes(rows):
    handle = io.StringIO()
    writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
    writer.writeheader(); writer.writerows(rows)
    return handle.getvalue().encode("utf-8-sig")


def xlsx_bytes(rows):
    def cells(values, number):
        return '<row>' + ''.join(f'<c r="{chr(65+i)}{number}" t="inlineStr"><is><t>{escape(value)}</t></is></c>' for i, value in enumerate(values)) + '</row>'
    xml = '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
    xml += cells(list(rows[0]), 1) + ''.join(cells(list(row.values()), i + 2) for i, row in enumerate(rows)) + '</sheetData></worksheet>'
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w') as archive: archive.writestr('xl/worksheets/sheet1.xml', xml)
    return buffer.getvalue()


def istat_row(code="113017", name="Olbia", province="OT", fiscal="G015", province_name="Gallura Nord-Est Sardegna"):
    return {"Codice Regione": "20", "Codice Comune formato alfanumerico": code, "Denominazione in italiano": name,
            "Denominazione (Italiana e straniera)": name, "Sigla automobilistica": province, "Codice Catastale del Comune": fiscal,
            "Denominazione dell'Unità territoriale sovracomunale \n(valida a fini statistici)": province_name}


def istat_inputs(rows, reference="21 febbraio 2026"):
    return {"istat-current": (xlsx_bytes(rows), {}, "current", sync.istat_municipalities),
            "istat-publication": (f'<p>Aggiornamento al {reference}</p>'.encode(), {}, "publication", sync.istat_publication)}


def snapshot(output, result):
    return json.loads(gzip.decompress((output / 'snapshots' / f"{result['version']}.json.gz").read_bytes()))


class SyncTests(unittest.TestCase):
    def test_istat_schema_bilingual_names_and_publication_date(self):
        row = istat_row(); row['Denominazione (Italiana e straniera)'] = 'Olbia-Other name'
        self.assertEqual(sync.istat_municipalities(xlsx_bytes([row]))['113017']['NAME'], 'Olbia-Other name')
        self.assertEqual(sync.istat_publication(b'<p>Aggiornamento al <b>21 febbraio 2026</b></p>')['publication']['DATAULTIMOAGG'], '2026-02-21')
        with self.assertRaises(ValueError): sync.istat_municipalities(xlsx_bytes([row, row]))
        with self.assertRaises(ValueError): sync.istat_publication(b'<p>Download today</p>')
        with self.assertRaises(ValueError): sync.istat_municipalities(xlsx_bytes([{'Changed': 'schema'}]))

    def test_sardinia_variation_uses_declared_date_and_mapping(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w') as archive:
            archive.writestr('variation.csv', ('In vigore dal 1° gennaio 2026;;;\nCodice Comune;Denominazione Comune;Codice Comune precedente\n113017;Olbia;090047\n').encode('cp1252'))
        rows = sync.sardinia_variations(buffer.getvalue())
        self.assertEqual(rows['113017']['EFFECTIVE_FROM'], '2026-01-01')
        self.assertEqual(rows['113017']['OLD_ISTAT'], '090047')

    def test_dated_reconciliation_preserves_belfiore_history_and_is_idempotent(self):
        raw = csv_bytes([municipality(DENOMINAZIONE_IT='OLBIA', CODISTAT='090047', SIGLAPROVINCIA='SS', CODCATASTALE='G015')])
        variation = {'113017': {'ID': '113017', 'OLD_ISTAT': '090047', 'NAME': 'Olbia', 'EFFECTIVE_FROM': '2026-01-01', 'DATAULTIMOAGG': '2026-01-01'}}
        inputs = {'anpr-comuni': (raw, {}, 'municipalities', sync.municipalities), **istat_inputs([istat_row()]),
                  'istat-sardinia': (b'fixture', {}, 'variations', lambda _: variation)}
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp); result = sync.sync(output, inputs); data = snapshot(output, result)
            old, new = data['places']
            self.assertEqual((old['province'], old['validTo']), ('SS', '2025-12-31'))
            self.assertEqual((new['province'], new['validFrom'], new['istatCode']), ('OT', '2026-01-01', '113017'))
            self.assertEqual(old['belfioreCode'], new['belfioreCode'])
            self.assertEqual(data['administrativeReconciliation']['summary'], {'differences': 1, 'conflicts': 0, 'overlays': 1})
            self.assertFalse(sync.sync(output, inputs)['changed'])
            archived = json.loads(gzip.decompress((output/'source-state.json.gz').read_bytes()))
            self.assertEqual(archived['anpr-comuni']['1']['DATACESSAZIONE'], '9999-12-31')
            # A newer list must not move a previously evidenced boundary.
            inputs.update(istat_inputs([istat_row()], '1 marzo 2026'))
            data = snapshot(output, sync.sync(output, inputs))
            self.assertEqual(data['places'][1]['validFrom'], '2026-01-01')
            self.assertEqual(data['administrativeReconciliation']['overlays'][0]['sourceHashes'],
                             snapshot(output, result)['administrativeReconciliation']['overlays'][0]['sourceHashes'])

    def test_conflicts_and_stale_istat_do_not_replace_fiscal_codes_or_newer_names(self):
        raw = csv_bytes([municipality(DENOMINAZIONE_IT='NEW NAME', CODISTAT='113017', SIGLAPROVINCIA='OT', CODCATASTALE='G015', DATAISTITUZIONE='2026-05-01')])
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            inputs = {'anpr-comuni': (raw, {}, 'anpr', sync.municipalities), **istat_inputs([istat_row(name='Old name')])}
            data = snapshot(output, sync.sync(output, inputs))
            self.assertEqual(data['places'][0]['name'], 'NEW NAME')
            self.assertEqual(data['administrativeReconciliation']['conflicts'][0]['type'], 'istat_reference_predates_anpr_version')
            inputs.update(istat_inputs([istat_row(fiscal='G016')]))
            data = snapshot(output, sync.sync(output, inputs))
            self.assertEqual(data['places'][0]['belfioreCode'], 'G015')
            self.assertIn('belfiore_mismatch', [c['type'] for c in data['administrativeReconciliation']['conflicts']])

    def test_successive_observed_editions_keep_history_and_do_not_retain_removed_current_rows(self):
        raw = csv_bytes([municipality(DENOMINAZIONE_IT='OLBIA', CODISTAT='090047', SIGLAPROVINCIA='SS', CODCATASTALE='G015')])
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            inputs = {'anpr-comuni': (raw, {}, 'anpr', sync.municipalities), **istat_inputs([istat_row()])}
            first = sync.sync(output, inputs)
            inputs.update(istat_inputs([istat_row()], '1 marzo 2026'))
            second = sync.sync(output, inputs)
            self.assertEqual(snapshot(output, first)['places'], snapshot(output, second)['places'])
            inputs.update(istat_inputs([istat_row(code='113018', name='Olbia New', province_name='New province name')], '1 aprile 2026'))
            result = sync.sync(output, inputs); data = snapshot(output, result)
            self.assertEqual(len(data['places']), 3)
            derived = sorted(data['places'][1:], key=lambda p: p['validFrom'])
            self.assertEqual(derived[0]['validTo'], '2026-03-31')
            self.assertEqual(derived[1]['validFrom'], '2026-04-01')
            self.assertFalse(sync.sync(output, inputs)['changed'])
            archived = json.loads(gzip.decompress((output/'source-state.json.gz').read_bytes()))
            self.assertEqual(list(archived['istat-current']), ['113018'])
            # A later correction back to the original ANPR values must end the overlay.
            inputs.update(istat_inputs([istat_row(code='090047', name='OLBIA', province='SS', province_name='Sassari')], '1 maggio 2026'))
            data = snapshot(output, sync.sync(output, inputs))
            latest = next(p for p in data['places'] if p['status'] == 'active')
            self.assertEqual((latest['istatCode'], latest['province']), ('090047', 'SS'))
            self.assertEqual(len(data['places']), 4)

    def test_province_table_parses_names_and_rejects_changed_schema(self):
        rows = sync.provinces(b"<table><tr><th>Code</th><th>Name</th></tr><tr><td>FO</td><td> FORLI&#39; </td></tr><tr><td>RM</td><td><span>ROMA</span></td></tr></table>")
        self.assertEqual(rows["FO"]["NAME"], "FORLI'")
        self.assertEqual(rows["RM"]["NAME"], "ROMA")
        with self.assertRaises(ValueError): sync.provinces(b"<html>No table</html>")
        with self.assertRaises(ValueError): sync.provinces(b"<tr><td>FO</td><td>FORLI</td></tr><tr><td>FO</td><td>OTHER</td></tr>")

    def test_province_name_update_versions_data_without_changing_municipalities(self):
        def inputs(name):
            html = f"<table><tr><td>RM</td><td>{name}</td></tr></table>".encode()
            return {"anpr-comuni": (csv_bytes([municipality()]), {}, "municipalities", sync.municipalities),
                    "ade-provinces": (html, {}, "provinces", sync.provinces)}
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            first = sync.sync(output, inputs("ROMA"))
            second = sync.sync(output, inputs("ROMA"))
            self.assertFalse(second["changed"])
            third = sync.sync(output, inputs("ROMA CAPITALE"))
            self.assertNotEqual(first["version"], third["version"])
            self.assertEqual(third["sources"]["anpr-comuni"]["modified"], 0)
            snapshot = json.loads(gzip.decompress((output / "snapshots" / f"{third['version']}.json.gz").read_bytes()))
            self.assertEqual(snapshot["provinces"][0]["name"], "Roma Capitale")

    def test_upsert_retains_missing_records_and_detects_field_changes(self):
        before = {"1": municipality(), "2": municipality("2")}
        after = {"1": municipality(STATO="C", DATACESSAZIONE="2026-06-04"), "3": municipality("3")}
        records, diff = sync.reconcile(before, after)
        self.assertEqual(set(records), {"1", "2", "3"})
        self.assertEqual(diff["added"], ["3"])
        self.assertEqual(diff["missing"], ["2"])
        self.assertIn("STATO", diff["modified"][0]["fields"])

    def test_duplicate_ids_and_changed_schema_fail(self):
        with self.assertRaises(ValueError): sync.municipalities(csv_bytes([municipality(), municipality()]))
        with self.assertRaises(ValueError): sync.municipalities(b"ID,NAME\n1,Roma\n")

    def test_nd_is_not_a_belfiore_and_sentinel_is_open(self):
        row = municipality(STATO="C", CODCATASTALE="ND")
        place = sync.place("anpr-comuni", row)
        self.assertIsNone(place["belfioreCode"])
        self.assertIsNone(place["validTo"])
        with self.assertRaises(ValueError): sync.place("anpr-comuni", municipality(CODCATASTALE="ND"))

    def test_excel_serial_and_calendar_dates(self):
        self.assertEqual(sync.iso("45303"), "2024-01-12")
        self.assertEqual(sync.iso("29/02/2000 00:00:00"), "2000-02-29")
        with self.assertRaises(ValueError): sync.iso("31/02/2026")
        with self.assertRaises(ValueError): sync.iso("60")

    def test_citizenship_only_rows_do_not_become_birthplaces(self):
        self.assertIsNone(sync.place("anpr-countries", {"NASCITA": "N", "CODAT": ""}))

    def test_reorder_is_idempotent_and_new_record_changes_snapshot(self):
        rows = [municipality(), municipality("2", CODCATASTALE="L219", DENOMINAZIONE_IT="TORINO")]
        def inputs(values):
            return {"anpr-comuni": (csv_bytes(values), {}, "https://example.com/ANPR.csv", sync.municipalities)}
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            first = sync.sync(output, inputs(rows))
            second = sync.sync(output, inputs(list(reversed(rows))))
            self.assertTrue(first["changed"])
            self.assertFalse(second["changed"])
            self.assertEqual(first["version"], second["version"])
            third = sync.sync(output, inputs(rows + [municipality("3", CODCATASTALE="M439", DENOMINAZIONE_IT="CASTEGNERO NANTO")]))
            self.assertTrue(third["changed"])
            self.assertNotEqual(first["version"], third["version"])
            old = json.loads(gzip.decompress((output / "snapshots" / f"{first['version']}.json.gz").read_bytes()))
            self.assertEqual(len(old["places"]), 2)

    def test_failed_import_keeps_previous_state(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            sync.sync(output, {"anpr-comuni": (csv_bytes([municipality()]), {}, "source", sync.municipalities)})
            original = (output / "source-state.json.gz").read_bytes()
            with self.assertRaises(ValueError):
                sync.sync(output, {"anpr-comuni": (csv_bytes([municipality(CODCATASTALE="???")]), {}, "source", sync.municipalities)})
            self.assertEqual(original, (output / "source-state.json.gz").read_bytes())


if __name__ == "__main__": unittest.main()
