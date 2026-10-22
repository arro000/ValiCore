"""Boundary matrices and transaction regressions; no network access."""
import calendar
import copy
from datetime import date, timedelta
import gzip
import json
from pathlib import Path
import tempfile
import unittest

from test_sync import sync, municipality, csv_bytes, xlsx_bytes, istat_row, istat_inputs, snapshot


def country(id='1', **changes):
    return {'ID': id, 'DENOMINAZIONE': 'TEST COUNTRY', 'CODAT': 'Z001', 'NASCITA': 'S', 'TIPO': 'STATO',
            'DATAINIZIOVALIDITA': '1900-01-01', 'DATAFINEVALIDITA': '', **changes}


class EdgeTests(unittest.TestCase):
    def test_date_serials_calendar_centuries_sentinels_and_fractional_times(self):
        for value, expected in [('1', '1900-01-01'), ('59', '1900-02-28'), ('61', '1900-03-01'),
                                ('45303.75', '2024-01-12'), ('9999-12-31', '9999-12-31'),
                                ('01/01/0001', '0001-01-01'), ('2000-02-29 12:30:00', '2000-02-29')]:
            with self.subTest(value=value): self.assertEqual(sync.iso(value), expected)
        self.assertIsNone(sync.iso('9999-12-31', end=True))
        self.assertIsNone(sync.iso(''))
        for year in [1600, 1700, 1800, 1900, 2000, 2100, 2400]:
            for month in range(1, 13):
                maximum = calendar.monthrange(year, month)[1]
                self.assertEqual(sync.iso(f'{year}-{month:02}-{maximum:02}'), f'{year}-{month:02}-{maximum:02}')
                with self.assertRaises(ValueError): sync.iso(f'{year}-{month:02}-{maximum+1:02}')
        for value in ['60', '60.5', '0000-01-01', '2026-00-01', 'not a date']:
            with self.subTest(value=value), self.assertRaises(ValueError): sync.iso(value)

    def test_belfiore_formats_preserve_leading_zeros_and_missing_values(self):
        for first in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ':
            for tail in ['000', '001', '009', '010', '099', '100', '999']:
                self.assertEqual(sync.belfiore(first + tail), first + tail)
        for value in [None, '', 'ND']: self.assertIsNone(sync.belfiore(value))
        for value in ['h501', 'H50', 'H5010', '0501', 'H50A', 'H５01', ' H501', 'N/D']:
            with self.subTest(value=value), self.assertRaises(ValueError): sync.belfiore(value)

    def test_country_birth_eligibility_and_conventional_dates(self):
        for kind in ['STATO', 'TERRITORIO', 'ALTRO', '']:
            for birth in ['S', 'N', '']:
                for code in ['Z001', '']:
                    row = country(TIPO=kind, NASCITA=birth, CODAT=code)
                    result = sync.place('anpr-countries', row)
                    if birth != 'S' and not code: self.assertIsNone(result)
                    else:
                        self.assertIsNone(result['validFrom'])
                        self.assertEqual(result['birthAllowed'], birth == 'S')
                        self.assertEqual(result['kind'], 'foreign_country' if kind == 'STATO' else 'foreign_territory')
        ceased = sync.place('anpr-countries', country(DATAFINEVALIDITA='1991-12-31'))
        self.assertEqual(ceased['status'], 'ceased')
        self.assertEqual(ceased['validTo'], '1991-12-31')

    def test_country_parser_rejects_missing_duplicate_ids_and_unknown_birth_flags(self):
        for rows in [[country(id='')], [country(id=' ')], [country(), country()], [country(NASCITA='?')]]:
            with self.subTest(rows=rows), self.assertRaises(ValueError): sync.countries(xlsx_bytes(rows))

    def test_alias_deduplication_and_reversed_intervals(self):
        row = municipality(DENOMINAZIONE_IT='FORLÌ', DENOMTRASLITTERATA="FORLI'", ALTRADENOMINAZIONE="FORLI'", ALTRADENOMTRASLITTERATA='FORLÌ')
        self.assertEqual(sync.place('anpr-comuni', row)['aliases'], ["FORLI'"])
        for start, end in [('2000-01-02', '2000-01-01'), ('2026-01-01', '1900-01-01')]:
            with self.subTest(start=start), self.assertRaises(ValueError):
                sync.place('anpr-comuni', municipality(DATAISTITUZIONE=start, DATACESSAZIONE=end, STATO='C'))
        single = sync.place('anpr-comuni', municipality(DATAISTITUZIONE='2000-01-01', DATACESSAZIONE='2000-01-01', STATO='C'))
        self.assertEqual(single['validFrom'], single['validTo'])

    def test_every_failed_import_preserves_all_published_state_not_only_source_payloads(self):
        good = {'anpr-comuni': (csv_bytes([municipality()]), {}, 'source', sync.municipalities)}
        bad = [
            {'anpr-comuni': (b'ID,NAME\n1,Roma', {}, 'source', sync.municipalities)},
            {'anpr-comuni': (csv_bytes([municipality(CODCATASTALE='bad')]), {}, 'source', sync.municipalities)},
            {'anpr-comuni': (csv_bytes([municipality(), municipality('2')]), {}, 'source', sync.municipalities)},
            {'anpr-comuni': (csv_bytes([municipality(DATAISTITUZIONE='2000-01-02', DATACESSAZIONE='2000-01-01')]), {}, 'source', sync.municipalities)},
            {'anpr-countries': (xlsx_bytes([country(NASCITA='N', CODAT='')]), {}, 'source', sync.countries)},
            {**good, 'istat-current': (xlsx_bytes([istat_row()]), {}, 'current', sync.istat_municipalities)},
        ]
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp); result = sync.sync(output, good)
            protected = [output/'state.json', output/'source-state.json.gz', output/'canonical/places.csv', output/'snapshots'/f"{result['version']}.json.gz"]
            original = {path: path.read_bytes() for path in protected}
            for inputs in bad:
                with self.subTest(sources=list(inputs)), self.assertRaises(ValueError): sync.sync(output, inputs)
                for path, content in original.items(): self.assertEqual(path.read_bytes(), content, str(path))

    def test_reference_reordering_and_equivalent_bilingual_names_do_not_create_overlays(self):
        raw = csv_bytes([municipality(DENOMINAZIONE_IT='DOBERDÒ DEL LAGO-DOBERDOB', CODISTAT='031003', CODCATASTALE='D312', SIGLAPROVINCIA='GO')])
        row = istat_row(code='031003', name='Doberdò del Lago', province='GO', fiscal='D312', province_name='Gorizia')
        row['Denominazione (Italiana e straniera)'] = 'Doberdò del Lago-Doberdob'
        row['Denominazione altra lingua'] = 'Doberdob'
        inputs = {'anpr-comuni': (raw, {}, 'anpr', sync.municipalities), **istat_inputs([row])}
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp); first = sync.sync(output, inputs); data = snapshot(output, first)
            self.assertEqual(len(data['places']), 1)
            self.assertEqual(data['administrativeReconciliation']['summary']['overlays'], 0)
            # Province metadata versions for multiple codes must be canonically ordered.
            inputs.update(istat_inputs([row, istat_row()]))
            second = sync.sync(output, inputs)
            inputs.update(istat_inputs([istat_row(), row]))
            self.assertFalse(sync.sync(output, inputs)['changed'])
            self.assertEqual(snapshot(output, second)['provinces'], snapshot(output, sync.sync(output, inputs))['provinces'])

    def test_anpr_catching_up_keeps_the_documented_historical_transition(self):
        raw = csv_bytes([municipality(DENOMINAZIONE_IT='OLBIA', CODISTAT='090047', SIGLAPROVINCIA='SS', CODCATASTALE='G015')])
        variations = {'113017': {'ID':'113017', 'OLD_ISTAT':'090047', 'NAME':'Olbia', 'EFFECTIVE_FROM':'2026-01-01', 'DATAULTIMOAGG':'2026-01-01'}}
        inputs = {'anpr-comuni': (raw, {}, 'anpr', sync.municipalities), **istat_inputs([istat_row()]),
                  'istat-sardinia': (b'fixture', {}, 'variations', lambda _: variations)}
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp); sync.sync(output, inputs)
            rows = [municipality(DENOMINAZIONE_IT='OLBIA', CODISTAT='090047', SIGLAPROVINCIA='SS', CODCATASTALE='G015', STATO='C', DATACESSAZIONE='2025-12-31'),
                    municipality('2', DENOMINAZIONE_IT='OLBIA', CODISTAT='113017', SIGLAPROVINCIA='OT', CODCATASTALE='G015', DATAISTITUZIONE='2026-01-01')]
            inputs['anpr-comuni'] = (csv_bytes(rows), {}, 'anpr', sync.municipalities)
            data = snapshot(output, sync.sync(output, inputs))
            self.assertEqual(len(data['places']), 2)
            self.assertEqual([p['sourceId'] for p in data['places']], ['anpr-comuni', 'anpr-comuni'])
            self.assertEqual(data['places'][0]['validTo'], '2025-12-31')
            self.assertEqual(data['places'][1]['validFrom'], '2026-01-01')
            self.assertFalse(sync.sync(output, inputs)['changed'])


if __name__ == '__main__': unittest.main()
