#!/usr/bin/env python3
"""Independent decimal lookup oracle for the sourced Italian numeric scheme.

Does not import ValiCore. The Rust core doubles digits arithmetically; this oracle
uses the ten-value substitution table and searches all possible final digits.
All fixtures are formal examples, not registry-allocation expectations.
"""
import argparse
import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "tests/fixtures/italian-vat-vectors.json"
EVEN = "0246813579"


def passes(code):
    return (sum(int(c) for c in code[::2])
            + sum(int(EVEN[int(c)]) for c in code[1::2])) % 10 == 0


def complete(body):
    candidates = [body + str(d) for d in range(10) if passes(body + str(d))]
    assert len(candidates) == 1
    return candidates[0]


def generate():
    rng = random.Random(20261005)
    bodies = {"0000000000", "0636339100", "1234567890", "0000001999", "0000001888",
              "0000001000", "0000001120", "0000001121", "9999999999"}
    # Exercise every value in every position independently of random coverage.
    bodies.update("0" * p + str(d) + "0" * (9 - p) for p in range(10) for d in range(10))
    bodies.update("".join(str(rng.randrange(10)) for _ in range(10)) for _ in range(128))
    valid = [{"input": complete(body), "vat": complete(body)} for body in sorted(bodies)]
    assert passes("06363391001")  # Published ADE footer; not an allocation query.
    invalid = []
    for row in valid:
        code = row["vat"]
        for p, c in enumerate(code):
            mutated = code[:p] + str((int(c) + 1) % 10) + code[p + 1:]
            assert not passes(mutated)
            invalid.append({"input": mutated, "error": "INVALID_ITALIAN_VAT_CHECKSUM"})
    invalid.extend({"input": s, "error": "INVALID_ITALIAN_VAT_STRUCTURE"} for s in [
        "", "IT", "0636339100", "063633910011", "IT0636339100", "FR06363391001",
        "IＴ06363391001", "ＩＴ06363391001", "0636339100A", "+06363391001",
        "06363391001 ", " 06363391001", "063 63391001", "IT 06363391001",
        "06363391001\t", "06363391001\n", "0636339100\u00a01", "０６３６３３９１００１",
        "٠٦٣٦٣٣٩١٠٠١", "0636339100\0", "ITIT06363391001", "1" * 4096,
    ])
    return {
        "reference": "DM 1976-12-23 articles 8-9 via MEF; EC TIN study June 2026 volume 2 p10",
        "scope": "format_checksum_only_no_allocation_expectations",
        "seed": 20261005,
        "oracle": "decimal substitution table and exhaustive final-digit search",
        "valid": valid,
        "invalid": invalid,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    data = (json.dumps(generate(), indent=2, ensure_ascii=False) + "\n").encode()
    if args.check:
        if OUTPUT.read_bytes() != data:
            raise SystemExit("Italian VAT fixture is not reproducible")
        print("Italian VAT corpus is reproducible")
    else:
        OUTPUT.write_bytes(data)
        print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    main()
