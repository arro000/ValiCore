#!/usr/bin/env python3
"""Independent calendar/interval oracle for CF administrative history only."""
import argparse
from datetime import date
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "tests/fixtures/birthplace-history-vectors.json"


def place(identifier, start, end, *, code="H501", birth_allowed=True):
    return {"id": identifier, "sourceId": "independent-history", "sourceRecordId": identifier,
            "name": identifier, "aliases": [], "kind": "municipality", "status": "ceased" if end else "active",
            "belfioreCode": code, "istatCode": None, "province": "AA", "validFrom": start,
            "validTo": end, "birthAllowed": birth_allowed}


def make_vectors():
    fiscal = json.loads((ROOT / "tests/fixtures/fiscal-vectors.json").read_text())
    cases = []
    # Reuse fixed correct CF references, not the engine, for representative
    # inputs; dedicated domain tests separately enumerate all omocodia masks.
    selected = fiscal["vectors"][:24]
    selected += [row for row in fiscal["vectors"] if row["person"]["birthDate"].endswith("02-29")][:4]
    for index, vector in enumerate(selected):
        birthday = date.fromisoformat(vector["person"]["birthDate"])
        records = [place("bounded", birthday.isoformat(), birthday.isoformat(), code=vector["person"]["birthplace"]["belfioreCode"])]
        if index % 3 == 0:
            records += [place("unknown", None, None, code=vector["person"]["birthplace"]["belfioreCode"])]
        if index % 3 == 1:
            records += [place("unknown-start", None, birthday.isoformat(), code=vector["person"]["birthplace"]["belfioreCode"])]
        candidates = []
        for year in range(1, 10000):
            if year % 100 != birthday.year % 100:
                continue
            try:
                candidate = date(year, birthday.month, birthday.day)
            except ValueError:
                continue
            matching, uncertain, excluded = [], [], []
            for row in records:
                start = date.fromisoformat(row["validFrom"]) if row["validFrom"] else None
                end = date.fromisoformat(row["validTo"]) if row["validTo"] else None
                if (start is not None and candidate < start) or (end is not None and candidate > end):
                    excluded.append(row["id"])
                elif start is None:
                    uncertain.append(row["id"])
                else:
                    matching.append(row["id"])
            compatible = True if matching else None if uncertain else False
            candidates.append({"birthDate": candidate.isoformat(), "compatible": compatible,
                               "status": "pass" if compatible else "unknown" if compatible is None else "fail",
                               "matchingRecordIds": matching, "uncertainRecordIds": uncertain,
                               "excludedRecordIds": excluded})
        cases.append({"code": vector["code"], "records": records, "candidates": candidates})
    return {"scope": "administrative_birthplace_history", "cases": cases}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    content = (json.dumps(make_vectors(), indent=2, ensure_ascii=False) + "\n").encode()
    if args.check:
        if OUTPUT.read_bytes() != content:
            raise SystemExit("Birthplace history vectors are not reproducible")
    else:
        OUTPUT.write_bytes(content)
    print(f"Birthplace history corpus: {hashlib.sha256(content).hexdigest()}")


if __name__ == "__main__":
    main()
