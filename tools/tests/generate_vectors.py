#!/usr/bin/env python3
"""Independent, offline reference corpus. Never imports the production implementation."""
import argparse
import calendar
import json
from pathlib import Path
import random

ROOT = Path(__file__).resolve().parents[2]
# Ministerial fiscal-code rules: odd/even character values, month letters and
# digit substitutions. This deliberately uses dictionaries and decimal strings,
# independently of the Rust byte-indexed implementation.
ODD = dict(zip('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
               [1, 0, 5, 7, 9, 13, 15, 17, 19, 21,
                1, 0, 5, 7, 9, 13, 15, 17, 19, 21, 2, 4, 18, 20, 11, 3, 6, 8, 12, 14, 16, 10, 22, 25, 24, 23]))
EVEN = {**{str(n): n for n in range(10)}, **{chr(65+n): n for n in range(26)}}


def check_character(body):
    return chr(65 + sum((ODD if position % 2 else EVEN)[letter] for position, letter in enumerate(body.upper(), 1)) % 26)


def letters(text, given):
    text = ''.join(c for c in text.upper() if c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
    consonants = ''.join(c for c in text if c not in 'AEIOU')
    vowels = ''.join(c for c in text if c in 'AEIOU')
    return consonants[0] + consonants[2:4] if given and len(consonants) > 3 else (consonants + vowels + 'XXX')[:3]


def reference(person, mask):
    year, month, day = map(int, person['birthDate'].split('-'))
    body = (letters(person['surname'], False) + letters(person['name'], True) + f'{year % 100:02}'
            + dict(enumerate('ABCDEHLMPRST', 1))[month] + f"{day + (40 if person['sex'] == 'F' else 0):02}"
            + person['birthplace']['belfioreCode'])
    base = body + check_character(body)
    chars = list(body)
    substitutions = dict(zip('0123456789', 'LMNPQRSTUV'))
    for bit, index in enumerate([14, 13, 12, 10, 9, 7, 6]):
        if mask & (1 << bit): chars[index] = substitutions[chars[index]]
    variant = ''.join(chars)
    return base, variant + check_character(variant)


def numeric_digit(body):
    # Decimal concatenation, rather than the production division/remainder rule.
    expanded = ''.join(str(int(char) * (2 if position % 2 == 0 else 1)) for position, char in enumerate(body, 1))
    return str((-sum(map(int, expanded))) % 10)


def corpus():
    rng = random.Random(20261002)
    names = ['Mario', 'Fabio', 'Francesco', 'Anna', 'Io', 'A', 'Li', 'Christopher', 'Jean-Paul', "D'Angelo", 'AEIOU', 'BCDF', 'Y', 'X', 'Gian Luca', 'Maria Elena', 'Alessandro', 'Giovanni', 'Paolo', 'Sara', 'Luigi', 'Emma', 'Andrea', 'Noemi']
    surnames = ['Rossi', 'Caccamo', 'Li', 'A', 'Ng', "D'Amico", 'De Luca', 'Bianchi', 'Esposito', 'AEIOU', 'BCDF', 'Smith', 'Van der Meer', 'Costa', 'Russo', 'Di Matteo']
    codes = ['H501', 'L219', 'F205', 'C357', 'G015', 'B354', 'Z404', 'Z110', 'Z129', 'A000', 'Z999', 'M439']
    years = [1, 4, 99, 100, 400, 999, 1600, 1700, 1800, 1900, 1999, 2000, 2024, 2026, 2099, 2100, 2400, 9999]
    vectors = []
    for index in range(512):
        year, month = rng.choice(years), index % 12 + 1
        last = calendar.monthrange(year, month)[1]
        day = [1, last, rng.randint(1, last)][index % 3]
        person = {'name': rng.choice(names), 'surname': rng.choice(surnames), 'sex': 'MF'[index % 2],
                  'birthDate': f'{year:04}-{month:02}-{day:02}', 'birthplace': {'belfioreCode': rng.choice(codes)}}
        mask = [0, 1, 2, 4, 8, 16, 32, 64, 127, rng.randrange(128)][index % 10]
        base, code = reference(person, mask)
        vectors.append({'id': f'ordinary-{index:04}', 'person': {**person, 'omocodiaMask': mask}, 'code': code,
                        'baseCode': base, 'nameCode': letters(person['name'], True), 'surnameCode': letters(person['surname'], False)})
    # External established anchors prevent a self-consistent reference error
    # from silently redefining the already independently verified contract.
    for name, surname, birth, place, expected in [('Mario', 'Rossi', '1985-03-15', 'H501', 'RSSMRA85C15H501R'),
                                                ('Fabio', 'Caccamo', '1985-04-03', 'L219', 'CCCFBA85D03L219P')]:
        person = {'name': name, 'surname': surname, 'sex': 'M', 'birthDate': birth, 'birthplace': {'belfioreCode': place}}
        assert reference(person, 0)[0] == expected
        vectors.append({'id': f'anchor-{name}', 'person': person, 'code': expected, 'baseCode': expected,
                        'nameCode': letters(name, True), 'surnameCode': letters(surname, False)})
    names = [{'input': value, 'normalized': normalized, 'nameCode': letters(normalized, True), 'surnameCode': letters(normalized, False)}
             for value, normalized in [('Éé', 'EE'), ('E\u0301e\u0301', 'EE'), ('D’Angelo', 'DANGELO'), ('Müller', 'MULLER'),
                                       ('Straße', 'STRASSE'), ('Ægir', 'AEGIR'), ('Œdipe', 'OEDIPE'), ('Søren', 'SOREN'),
                                       ('Łukasz', 'LUKASZ'), ('Đorđe', 'DORDE'), ('Þór', 'THOR'), ('ıpek', 'IPEK'),
                                       ('  Anna-Maria. ', 'ANNAMARIA'), ('Ｆａｂｉｏ', 'FABIO'), ('ﬁona', 'FIONA'),
                                       ('\u0301Anna', 'ANNA'), ('Y', 'Y'), ('Io', 'IO'), ('Ng', 'NG'), ('BCDF', 'BCDF')]]
    checksums = []
    for position in range(15):
        for char in '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ':
            body = '000000000000000'[:position] + char + '000000000000000'[position+1:]
            checksums.append({'body': body, 'expected': check_character(body)})
    numeric = [{'body': body, 'expected': numeric_digit(body)} for body in
               ['0000000000', '9999999999', '0636339100', '0000000001'] + [f'{rng.randrange(10**10):010}' for _ in range(512)]]
    inverse = []
    for month in range(1, 13):
        for sex in ['M', 'F']:
            day = calendar.monthrange(1985, month)[1]
            body = f"RSSMRA85{'ABCDEHLMPRST'[month-1]}{day + (40 if sex == 'F' else 0):02}H501"
            inverse.append({'code': body + check_character(body), 'options': {'yearRange': [1800, 2199]},
                            'expected': {'surnameCode': 'RSS', 'nameCode': 'MRA', 'yearTwoDigits': 85, 'month': month, 'day': day, 'sex': sex,
                                         'belfioreCode': 'H501', 'omocodiaMask': 0, 'centuryAmbiguous': True,
                                         'candidateDates': [f'{year}-{month:02}-{day:02}' for year in [1885, 1985, 2085, 2185]]}})
    for body, bounds, dates, sex, day, month in [
        ('RSSMRA00B29H501', [1900,2100], ['2000-02-29'], 'M',29,2),
        ('RSSMRA00B69Z404', [1800,2400], ['2000-02-29','2400-02-29'], 'F',29,2),
        ('XXXYYY01A01A000', [1,101], ['0001-01-01','0101-01-01'], 'M',1,1),
        ('RSSMRA99T71Z999', [9899,9999], ['9899-12-31','9999-12-31'], 'F',31,12),
    ]:
        inverse.append({'code': body + check_character(body), 'options': {'yearRange': bounds},
                        'expected': {'surnameCode':body[:3], 'nameCode':body[3:6], 'yearTwoDigits':int(body[6:8]), 'month':month,
                                     'day':day, 'sex':sex, 'belfioreCode':body[11:15], 'omocodiaMask':0,
                                     'centuryAmbiguous':len(dates)>1, 'candidateDates':dates}})
    for body, bounds, error in [('RSSMRA00B29H501',[1800,1900],'INVALID_CALENDAR'),
                                ('RSSMRA24B31H501',[2024,2024],'INVALID_CALENDAR'),
                                ('RSSMRA85C15H501',[2000,2000],'INVALID_CALENDAR'),
                                ('RSSMRA85G15H501',[1900,2099],'INVALID_FORMAT')] + [
                                    (f'RSSMRA85A{day:02}H501',[1900,2099],'INVALID_DAY_SEX') for day in [0,32,40,72,99]]:
        inverse.append({'code':body + check_character(body), 'options':{'yearRange':bounds}, 'error':error})
    return {'formatVersion': 1, 'seed': 20261002,
            'provenance': 'Independent Python reference from the ministerial encoding tables; two established anchors; fictitious people, not tax-registry allocations. Unicode spellings are explicit project normalization fixtures.',
            'vectors': vectors, 'decodeCases': inverse, 'names': names, 'checksums': checksums, 'numericChecksums': numeric}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    path = ROOT / 'tests/fixtures/fiscal-vectors.json'
    content = json.dumps(corpus(), ensure_ascii=False, indent=2) + '\n'
    if args.check:
        if not path.exists() or path.read_text() != content: raise SystemExit('Reference corpus differs; review and regenerate explicitly.')
    else:
        path.parent.mkdir(parents=True, exist_ok=True); path.write_text(content)
    print('Independent corpus: 514 people, 37 inverse cases, 20 name fixtures, 540 positional checksums, 516 numeric checksums.')
