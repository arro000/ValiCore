#!/usr/bin/env python3
"""Exercise fiscal/geographic corpora through the real public native C ABI."""
import ctypes
import gzip
import json
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
calls = 0
lib = ctypes.CDLL(str(root / 'target/release/libvalicore_abi.so'))
lib.valicore_alloc.argtypes = [ctypes.c_uint32]
lib.valicore_alloc.restype = ctypes.c_void_p
lib.valicore_dealloc.argtypes = [ctypes.c_void_p, ctypes.c_uint32]
lib.valicore_dealloc.restype = None
lib.valicore_invoke.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.POINTER(ctypes.c_uint32)]
lib.valicore_invoke.restype = ctypes.c_void_p
assert all(getattr(lib, name, None) is None for name in ('cf_alloc', 'cf_dealloc', 'cf_invoke'))
subprocess.run(['cc', '-std=c11', '-Wall', '-Wextra', '-Werror', '-fsyntax-only',
                '-I', str(root / 'include'), '-x', 'c', '-'], check=True, input=b'''
#include "valicore.h"
#include "valicore.h"
uint8_t *(*allocate)(uint32_t) = valicore_alloc;
void (*release)(uint8_t *, uint32_t) = valicore_dealloc;
uint8_t *(*invoke_json)(const uint8_t *, uint32_t, uint32_t *) = valicore_invoke;
''')


def envelope(data):
    global calls
    calls += 1
    ptr = lib.valicore_alloc(len(data))
    ctypes.memmove(ptr, data, len(data))
    length = ctypes.c_uint32()
    output = lib.valicore_invoke(ptr, len(data), ctypes.byref(length))
    try:
        return json.loads(ctypes.string_at(output, length.value))
    finally:
        lib.valicore_dealloc(output, length.value)
        lib.valicore_dealloc(ptr, len(data))


def invoke(request):
    result = envelope(json.dumps({**request, 'protocol': 1}).encode())
    assert result['ok'], result
    return result['value']


def error(request, code, field=None):
    result = envelope(json.dumps({'protocol': 1, **request}).encode())
    assert result['ok'] is False and result['error']['code'] == code, result
    if field is not None:
        assert result['error']['field'] == field, result


info = invoke({'op': 'info'})
assert info['runtimeName'] == 'ValiCore' and info['runtimeApiMajor'] == 8 and info['loaderProtocol'] == 2
assert info['modules'] == ['fiscal_identity', 'geo_historical']
state = json.loads((root / 'data/state.json').read_text())
dataset = json.loads(gzip.decompress((root / 'data' / state['snapshot']).read_bytes()))
handle = invoke({'op': 'create', 'dataset': dataset})
person = {'name': 'Mario', 'surname': 'Rossi', 'sex': 'M', 'birthDate': '1985-03-15', 'birthplace': {'belfioreCode': 'H501'}}
code = 'RSSMRA85C15H501R'
assert invoke({'op': 'encode', 'handle': handle, 'person': person}) == code
assert invoke({'op': 'validate', 'handle': handle, 'code': code})['valid'] is True
assert len(invoke({'op': 'omocodes', 'code': code})) == 128
provinces = invoke({'op': 'listProvinces', 'handle': handle, 'options': {'onDate': '1985-03-15'}})
assert any(province['code'] == 'FO' and province['placeCount'] > 0 for province in provinces)
assert not any(province['code'] == 'RN' for province in provinces)
invoke({'op': 'dispose', 'handle': handle})

# Independent reference expectations are shared with Rust/WASM/Python suites.
corpus = json.loads((root / 'tests/fixtures/fiscal-vectors.json').read_text())
codes = sorted({row['person']['birthplace']['belfioreCode'] for row in corpus['vectors']})
golden = {'schemaVersion': 1, 'version': 'native-golden', 'sources': {}, 'coverage': {}, 'places': [
    {'id': value, 'sourceId': 'synthetic-golden', 'sourceRecordId': value, 'name': f'TEST {value}', 'aliases': [],
     'kind': 'foreign_country' if value.startswith('Z') else 'municipality', 'status': 'active', 'belfioreCode': value,
     'istatCode': None, 'province': 'EE' if value.startswith('Z') else 'AA', 'validFrom': None, 'validTo': None, 'birthAllowed': True}
    for value in codes]}
handle = invoke({'op': 'create', 'dataset': golden})
for row in corpus['vectors']:
    assert invoke({'op': 'encode', 'handle': handle, 'person': row['person']}) == row['code'], row['id']
    assert invoke({'op': 'toBase', 'code': row['code']}) == row['baseCode'], row['id']
    year = int(row['person']['birthDate'][:4])
    decoded = invoke({'op': 'decode', 'handle': handle, 'code': row['code'], 'options': {'yearRange': [year, year]}})
    assert decoded['candidateDates'] == [row['person']['birthDate']], row['id']
    assert decoded['sex'] == row['person']['sex'], row['id']
    assert decoded['nameCode'] == row['nameCode'], row['id']
    assert decoded['surnameCode'] == row['surnameCode'], row['id']
for row in corpus['decodeCases']:
    response = envelope(json.dumps({'protocol': 1, 'op': 'decode', 'handle': handle, 'code': row['code'], 'options': row['options']}).encode())
    if 'error' in row:
        assert response['error']['code'] == row['error']
    else:
        for field, value in row['expected'].items():
            assert response['value'][field] == value, (row['code'], field)
for row in corpus['names']:
    assert invoke({'op': 'nameCode', 'name': row['input']}) == row['nameCode']
    assert invoke({'op': 'surnameCode', 'surname': row['input']}) == row['surnameCode']
for row in corpus['checksums']:
    assert invoke({'op': 'checksum', 'body': row['body']}) == row['expected']
for row in corpus['numericChecksums']:
    assert invoke({'op': 'numericChecksum', 'body': row['body']}) == row['expected']
    for digit in range(10):
        assert invoke({'op': 'validate', 'handle': handle, 'code': row['body'] + str(digit)})['valid'] == (str(digit) == row['expected'])
for invalid in [b'', b'{', b'not JSON', b'\xff\xfe', b'{"protocol":1,}']:
    assert envelope(invalid)['error']['code'] == 'INVALID_JSON'
for mask in [-1, 128, 1.5, None, '1', True]:
    error({'op': 'toOmocode', 'code': code, 'mask': mask}, 'INVALID_MASK')
for include_base in [None, 0, 1, 'false', [], {}]:
    error({'op': 'omocodes', 'code': code, 'includeBase': include_base}, 'INVALID_ARGUMENT', 'includeBase')
invoke({'op': 'dispose', 'handle': handle})
error({'op': 'datasetInfo', 'handle': handle}, 'INVALID_HANDLE')
for _ in range(20):
    handle = invoke({'op': 'create'})
    assert invoke({'op': 'capabilities', 'handle': handle}) == {'fiscalIdentity': True, 'geoHistorical': False}
    assert invoke({'op': 'encode', 'handle': handle, 'person': person}) == code
    decoded = invoke({'op': 'decode', 'handle': handle, 'code': code})
    assert decoded['dataVersion'] is None and decoded['places'] == []
    report = invoke({'op': 'validate', 'handle': handle, 'code': code})
    assert report['valid'] is None and report['checks'][3]['error']['code'] == 'CAPABILITY_UNAVAILABLE'
    for op, args in [('datasetInfo', {}), ('searchPlaces', {'query': 'Roma'}), ('listProvinces', {}), ('resolvePlace', {'query': {'belfioreCode': 'H501'}})]:
        error({'op': op, 'handle': handle, **args}, 'CAPABILITY_UNAVAILABLE')
    invoke({'op': 'dispose', 'handle': handle})
vat_corpus = json.loads((root / 'tests/fixtures/italian-vat-vectors.json').read_text())
for row in vat_corpus['valid']:
    for prefix in ['', 'IT', 'it']:
        report = invoke({'op': 'validateItalianVat', 'vat': prefix + row['input']})
        assert report['valid'] is True and report['vat'] == row['vat']
        assert report['scope'] == 'format_checksum'
        assert [(c['name'], c['status']) for c in report['checks']] == [('structure', 'pass'), ('checksum', 'pass'), ('registry', 'not_run')]
for row in vat_corpus['invalid']:
    report = invoke({'op': 'validateItalianVat', 'vat': row['input']})
    assert report['valid'] is False
    assert next(c['error']['code'] for c in report['checks'] if c['status'] == 'fail') == row['error']
for value in [None, True, 42, 1.5, [], {}]:
    error({'op': 'validateItalianVat', 'vat': value}, 'INVALID_ARGUMENT', 'vat')
rea_corpus = json.loads((root / 'tests/fixtures/italian-rea-vectors.json').read_text())
for category, expected in [('valid', True), ('invalid', False)]:
    for row in rea_corpus[category]:
        report = invoke({'op': 'validateItalianRea', 'rea': row['input']})
        assert report['valid'] is expected and report['checks'][1]['status'] == 'not_run'
        if expected:
            assert all(report[field] == row[field] for field in ['rea', 'provinceCode', 'serialNumber'])
        else:
            assert report['checks'][0]['error']['code'] == row['error']
for value in [None, True, 42, 1.5, [], {}]:
    error({'op': 'validateItalianRea', 'rea': value}, 'INVALID_ARGUMENT', 'rea')
history_corpus = json.loads((root / 'tests/fixtures/birthplace-history-vectors.json').read_text())
for case in history_corpus['cases']:
    handle = invoke({'op': 'create', 'dataset': {'schemaVersion': 1, 'version': 'native-history', 'sources': {}, 'coverage': {}, 'places': case['records']}})
    report = invoke({'op': 'birthplaceHistory', 'handle': handle, 'code': case['code']})
    assert report['scope'] == 'administrative_birthplace_history' and report['allocationCheck']['status'] == 'not_run'
    assert [{key: value for key, value in row.items() if key != 'error'} for row in report['candidates']] == case['candidates']
    assert report['decoded']['candidateDates'] == invoke({'op': 'decode', 'handle': handle, 'code': case['code']})['candidateDates']
    invoke({'op': 'dispose', 'handle': handle})
handle = invoke({'op': 'create'})
report = invoke({'op': 'birthplaceHistory', 'handle': handle, 'code': code})
assert len(report['candidates']) == 100 and all(row['compatible'] is None for row in report['candidates'])
invoke({'op': 'dispose', 'handle': handle})
# Removed domains must not remain hidden callable operations, even with a bad handle.
for op in ['validateIban', 'validateItalianNre', 'validateAteco', 'lookupItalianAic']:
    error({'op': op, 'handle': 0}, 'UNKNOWN_OPERATION', 'op')
for extra in ['atecoDataset', 'aicDataset', 'unexpected']:
    error({'op': 'create', extra: None}, 'INVALID_ARGUMENT', extra)
print(f'Native C ABI: fiscal/VAT/REA/history corpora, mutations, strict scope, malformed JSON, handles and buffer ownership verified ({calls} calls).', flush=True)
subprocess.run([sys.executable, str(root / 'tools/test_python.py')], cwd=root, check=True)
