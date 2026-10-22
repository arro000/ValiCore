"""Executable installed-package example: packaged defaults or explicit native/data inputs."""
import argparse
import json

from valicore import create_valicore

parser = argparse.ArgumentParser(description="ValiCore offline Python example")
parser.add_argument("--library", help="Explicit trusted native library; otherwise use the platform wheel")
geography = parser.add_mutually_exclusive_group()
geography.add_argument("--dataset", help="Custom schema-compatible JSON or gzip geographic catalog")
geography.add_argument("--without-geography", action="store_true", help="Do not read packaged geographic data")
args = parser.parse_args()

options = {}
if args.library is not None:
    options["library_path"] = args.library
if args.dataset is not None:
    options["dataset"] = args.dataset
elif args.without_geography:
    options["dataset"] = None

with create_valicore(**options) as engine:
    code = engine.encode({"name": "Mario", "surname": "Rossi", "sex": "M",
                          "birthDate": "1985-03-15", "birthplace": {"belfioreCode": "H501"}})
    versions = engine.version_info()
    print(json.dumps({
        "code": code,
        "capabilities": engine.capabilities(),
        "calendarValid": engine.validate(code, {"level": "calendar"})["valid"],
        "candidateDates": engine.decode(code, {"yearRange": [1900, 2099]})["candidateDates"],
        "birthplaceHistory": engine.birthplace_history(code, {"yearRange": [1900, 2099]}) if "geo" in versions["components"] else None,
        "italianVat": engine.validate_italian_vat("IT06363391001"),
        "italianRea": engine.validate_italian_rea("RM-000123456"),
        "versions": versions,
    }, ensure_ascii=False, indent=2))
# Formal checks do not establish identity or official tax-registry allocation.
