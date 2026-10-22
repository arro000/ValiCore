#!/usr/bin/env python3
"""Independent regex oracle for the declared province-coded REA presentation.

Registry allocation, office membership and invoice-field limits are not inferred.
No ValiCore imports. Synthetic province/serial combinations are format fixtures.
"""
import argparse
import itertools
import json
from pathlib import Path
import random
import re
import string

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "tests/fixtures/italian-rea-vectors.json"


def generate():
    rng = random.Random(20261006)
    inputs = {"RM-123456", "RM-000123456", "ZZ-0", "AA-" + "1" * 128}
    for letters in itertools.product(string.ascii_uppercase, repeat=2):
        prefix = "".join(letters)
        if rng.randrange(2):
            prefix = prefix.lower()
        inputs.add(prefix + "-" + str(rng.randrange(10**12)))
    valid = []
    for value in sorted(inputs):
        match = re.fullmatch(r"([A-Za-z]{2})-([0-9]+)", value)
        assert match
        valid.append({"input": value, "rea": value.upper(), "provinceCode": match[1].upper(),
                      "serialNumber": match[2]})
    invalid = {"", "RM", "RM-", "R-1", "RMM-1", "RM123456", "RM 123456", "RM--1",
               "RM-+1", "RM--1", "RM-1.0", "RM-1e3", "RM-١", "RM-１", "ＲM-1",
               "RΜ-1", "RM−1", "RM–1", " RM-1", "RM-1 ", "RM-1\n", "RM-1\t", "RM-1\0"}
    for i in range(len("RM-123456")):
        for character in " !+_é\0":
            invalid.add("RM-123456"[:i] + character + "RM-123456"[i + 1:])
    for value in invalid:
        assert re.fullmatch(r"([A-Za-z]{2})-([0-9]+)", value) is None
    return {"reference": "Registro Imprese CF/PIVA/REA description; FatturaPA 1.4 ProvinciaType",
            "scope": "presentation_format_only_not_registry_allocation", "seed": 20261006,
            "oracle": "full-match ASCII regex and capture groups", "valid": valid,
            "invalid": [{"input": value, "error": "INVALID_ITALIAN_REA_STRUCTURE"} for value in sorted(invalid)]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    data = (json.dumps(generate(), indent=2, ensure_ascii=False) + "\n").encode()
    if args.check:
        if OUTPUT.read_bytes() != data:
            raise SystemExit("Italian REA fixture is not reproducible")
        print("Italian REA corpus is reproducible")
    else:
        OUTPUT.write_bytes(data)
        print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    main()
