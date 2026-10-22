#!/usr/bin/env python3
"""Reconcile official ANPR history with dated ISTAT administrative editions. Standard library only."""
from __future__ import annotations

import argparse
import csv
from datetime import date, datetime, timedelta, timezone
import gzip
import hashlib
import io
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import time
import unicodedata
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[2]
COMUNI_URL = "https://www.anagrafenazionale.interno.it/wp-content/uploads/ANPR_archivio_comuni.csv"
COUNTRIES_URL = "https://www.anagrafenazionale.interno.it/wp-content/uploads/tabella_2_statiesteri.xlsx"
PROVINCES_URL = "https://www1.agenziaentrate.gov.it/servizi/codici/ricerca/VisualizzaTabella.php?ArcName=00T2"
ISTAT_URL = "https://www.istat.it/storage/codici-unita-amministrative/Elenco-comuni-italiani.xlsx"
ISTAT_PAGE_URL = "https://www.istat.it/classificazione/codici-dei-comuni-delle-province-e-delle-regioni/"
SARDINIA_URL = "https://www.istat.it/wp-content/uploads/2024/09/Codici-statistici-e-denominazioni-delle-unita-amministrative-della-Sardegna.zip"
NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def digest(data):
    return hashlib.sha256(data).hexdigest()


def write_gzip(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and gzip.decompress(path.read_bytes()) == data:
        return  # Preserve identical archives across Python/zlib versions.
    path.write_bytes(gzip.compress(data, mtime=0))


def fetch(url):
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "ValiCore/0.1 (+https://github.com/arro000/ValiCore)"})
            with urllib.request.urlopen(request, timeout=60) as response:
                if response.status != 200:
                    raise ValueError(f"Unexpected HTTP status: {response.status}")
                return response.read(), {key: response.headers.get(key) for key in ("ETag", "Last-Modified", "Content-Type")}
        except (OSError, ValueError):
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


def iso(value, *, end=False):
    if not value:
        return None
    value = str(value).strip().split(" ")[0]
    if re.fullmatch(r"\d+(?:\.\d+)?", value):
        # Excel stores some date cells as serial numbers, even in a mostly text column.
        serial = float(value)
        if int(serial) == 60:
            raise ValueError("Excel's fictional 1900-02-29 is not a calendar date")
        origin = date(1899, 12, 30) if serial >= 60 else date(1899, 12, 31)
        value = (origin + timedelta(days=int(serial))).isoformat()
    elif "/" in value:
        value = datetime.strptime(value, "%d/%m/%Y").date().isoformat()
    else:
        value = date.fromisoformat(value).isoformat()
    return None if end and value == "9999-12-31" else value


def belfiore(value):
    if value in (None, "", "ND"):
        return None
    if not re.fullmatch(r"[A-Z][0-9]{3}", value):
        raise ValueError(f"Invalid source Belfiore: {value!r}")
    return value


def municipalities(data):
    reader = csv.DictReader(io.StringIO(data.decode("utf-8-sig")), delimiter=",")
    required = {"ID", "DATAISTITUZIONE", "DATACESSAZIONE", "CODISTAT", "CODCATASTALE", "DENOMINAZIONE_IT", "STATO", "SIGLAPROVINCIA", "DATAULTIMOAGG"}
    if not required <= set(reader.fieldnames or []):
        raise ValueError(f"ANPR CSV is missing columns: {required - set(reader.fieldnames or [])}")
    records = {}
    for row in reader:
        if not row.get("ID") or row["ID"] in records:
            raise ValueError("Missing or duplicate ANPR ID")
        if row["STATO"] not in ("A", "C", "D"):
            raise ValueError(f"Unknown ANPR state {row['STATO']!r}")
        records[row["ID"]] = row
    if not records:
        raise ValueError("Empty municipality archive")
    return records


def xlsx_rows(data):
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            strings = ["".join(node.itertext()) for node in ET.fromstring(archive.read("xl/sharedStrings.xml")).findall("s:si", NS)]
        rows = []
        for node in ET.fromstring(archive.read("xl/worksheets/sheet1.xml")).findall(".//s:row", NS):
            cells = {}
            for cell in node.findall("s:c", NS):
                column = re.sub(r"\d+", "", cell.attrib["r"])
                value_node = cell.find("s:v", NS)
                value = value_node.text if value_node is not None else ""
                if cell.attrib.get("t") == "s":
                    value = strings[int(value)]
                elif cell.attrib.get("t") == "inlineStr":
                    value = "".join(cell.find("s:is", NS).itertext())
                cells[column] = value or ""
            rows.append(cells)
        if not rows:
            raise ValueError("Empty country workbook")
        headers = rows[0]
        return [{name: row.get(column, "") for column, name in headers.items()} for row in rows[1:] if row.get("A")]


def countries(data):
    records = {}
    for row in xlsx_rows(data):
        if not {"ID", "DENOMINAZIONE", "CODAT", "NASCITA", "TIPO"} <= row.keys():
            raise ValueError("Country workbook schema changed")
        if not row["ID"].strip() or row["ID"] in records:
            raise ValueError("Missing or duplicate country ID")
        if row["NASCITA"] not in ("S", "N", ""):
            raise ValueError("Unknown country birth eligibility flag")
        records[row["ID"]] = row
    if not records:
        raise ValueError("Empty country archive")
    return records


def provinces(data):
    class TableParser(HTMLParser):
        def __init__(self):
            super().__init__()
            self.rows, self.row, self.cell = [], [], None

        def handle_starttag(self, tag, attrs):
            if tag == "tr": self.row = []
            if tag == "td": self.cell = []

        def handle_data(self, value):
            if self.cell is not None: self.cell.append(value)

        def handle_endtag(self, tag):
            if tag == "td" and self.cell is not None:
                self.row.append(" ".join("".join(self.cell).split()))
                self.cell = None
            if tag == "tr" and len(self.row) == 2: self.rows.append(self.row)

    parser = TableParser()
    parser.feed(data.decode("utf-8-sig"))
    records = {}
    for code, name in parser.rows:
        if not re.fullmatch(r"[A-Z]{2}", code): continue
        if code in records or not name: raise ValueError("Duplicate province code or missing name")
        records[code] = {"ID": code, "NAME": name}
    if not records: raise ValueError("Province table is empty or its HTML schema changed")
    return records


def name_key(value):
    return "".join(c for c in unicodedata.normalize("NFKD", value).upper() if c.isalnum())


def italian_date(text):
    months = "gennaio febbraio marzo aprile maggio giugno luglio agosto settembre ottobre novembre dicembre".split()
    match = re.search(r"(\d{1,2})\s*[°º]?\s+(" + "|".join(months) + r")\s+(\d{4})", text, re.I)
    if not match: raise ValueError("ISTAT publication date is missing or its schema changed")
    return date(int(match[3]), months.index(match[2].lower()) + 1, int(match[1])).isoformat()


def istat_publication(data):
    class TextParser(HTMLParser):
        def __init__(self):
            super().__init__(); self.text = []
        def handle_data(self, value): self.text.append(value)
    parser = TextParser(); parser.feed(data.decode("utf-8-sig"))
    text = " ".join(" ".join(parser.text).split())
    match = re.search(r"Aggiornamento al\s+(.{0,40})", text)
    if not match: raise ValueError("ISTAT reference date not found")
    return {"publication": {"ID": "publication", "DATAULTIMOAGG": italian_date(match[1])}}


def istat_municipalities(data):
    records, codes, names = {}, set(), {}
    for raw in xlsx_rows(data):
        row = {" ".join(k.split()): v.strip() for k, v in raw.items()}
        required = {"Codice Comune formato alfanumerico", "Denominazione in italiano", "Sigla automobilistica", "Codice Catastale del Comune", "Codice Regione",
                    "Denominazione dell'Unità territoriale sovracomunale (valida a fini statistici)"}
        if not required <= row.keys(): raise ValueError("ISTAT municipality workbook schema changed")
        code, fiscal, province = row["Codice Comune formato alfanumerico"], belfiore(row["Codice Catastale del Comune"]), row["Sigla automobilistica"]
        name = row.get("Denominazione (Italiana e straniera)") or row["Denominazione in italiano"]
        province_name = row["Denominazione dell'Unità territoriale sovracomunale (valida a fini statistici)"]
        if not re.fullmatch(r"\d{6}", code) or not re.fullmatch(r"[A-Z]{2}", province) or not fiscal or not name or not province_name:
            raise ValueError("Invalid ISTAT municipality identifiers or names")
        if code in records or fiscal in codes: raise ValueError("Duplicate ISTAT municipality or Belfiore code")
        if province in names and names[province] != province_name: raise ValueError("Conflicting current ISTAT province names")
        codes.add(fiscal); names[province] = province_name
        records[code] = {"ID": code, "NAME": name, "ALIASES": [row["Denominazione in italiano"], row.get("Denominazione (Italiana e straniera)", name), row.get("Denominazione altra lingua", "")],
                         "BELFIORE": fiscal, "PROVINCE": province, "PROVINCE_NAME": province_name, "REGION": row["Codice Regione"]}
    if not records: raise ValueError("Empty ISTAT municipality workbook")
    return records


def sardinia_variations(data):
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        files = [name for name in archive.namelist() if name.endswith(".csv")]
        if len(files) != 1: raise ValueError("Sardinia archive must contain one CSV")
        raw = archive.read(files[0])
    try: text = raw.decode("utf-8-sig")
    except UnicodeDecodeError: text = raw.decode("cp1252")
    lines = csv.reader(io.StringIO(text), delimiter=";")
    title = next(lines)[0]
    if "In vigore dal" not in title: raise ValueError("Sardinia variation effective date is missing")
    effective = italian_date(title.split("In vigore dal", 1)[1])
    headers = [" ".join(cell.split()) for cell in next(lines)]
    required = {"Codice Comune", "Denominazione Comune", "Codice Comune precedente"}
    if not required <= set(headers): raise ValueError("Sardinia variation schema changed")
    records = {}
    for cells in lines:
        if not cells or not any(cells): continue
        row = dict(zip(headers, cells))
        code, old = row.get("Codice Comune", "").strip(), row.get("Codice Comune precedente", "").strip()
        if not re.fullmatch(r"\d{6}", code) or not re.fullmatch(r"\d{6}", old) or code in records:
            raise ValueError("Invalid or duplicate Sardinia variation code")
        records[code] = {"ID": code, "OLD_ISTAT": old, "NAME": row["Denominazione Comune"].strip(), "EFFECTIVE_FROM": effective, "DATAULTIMOAGG": effective}
    if not records: raise ValueError("Empty Sardinia variation archive")
    return records


def administrative_catalog(places, current, variations, reference, previous_snapshot=None):
    """Derive dated administrative versions; raw ANPR records stay in source archives."""
    active = {p["belfioreCode"]: p for p in places if p["kind"] == "municipality" and p["status"] == "active"}
    by_istat = {p["istatCode"]: p for p in active.values()}
    report = {"referenceDate": reference, "anprActiveCount": len(active), "istatCurrentCount": len(current), "differences": [], "nameVariants": [], "conflicts": [], "overlays": []}
    output = [dict(p) for p in places]
    by_id = {p["id"]: p for p in output}
    latest = {code: by_id[p["id"]] for code, p in active.items()}
    previous_snapshot = previous_snapshot or {}
    old_places = {p["id"]: p for p in previous_snapshot.get("places", [])}
    for overlay in sorted(previous_snapshot.get("administrativeReconciliation", {}).get("overlays", []), key=lambda o: o["effectiveFrom"]):
        original = by_id.get(overlay["anprId"])
        old_original, derived = old_places.get(overlay["anprId"]), old_places.get(overlay["derivedId"])
        if not original or not old_original or not derived: continue
        if active.get(original["belfioreCode"], {}).get("id") != original["id"]: continue
        if any(original[key] != old_original[key] for key in ("name", "istatCode", "province", "belfioreCode", "validFrom")): continue
        if original["validFrom"] and overlay["effectiveFrom"] <= original["validFrom"]: continue
        prior = latest[original["belfioreCode"]]
        prior["validTo"] = (date.fromisoformat(overlay["effectiveFrom"]) - timedelta(days=1)).isoformat()
        prior["status"] = "ceased"
        copy = {**derived, "status": "active", "validTo": None}
        output.append(copy); latest[copy["belfioreCode"]] = copy
        report["overlays"].append(overlay)
    for code, row in sorted(current.items()):
        p = active.get(row["BELFIORE"])
        if p is None:
            other = by_istat.get(code)
            report["conflicts"].append({"type": "belfiore_mismatch" if other else "missing_in_anpr", "istatId": code, "istat": row, "anpr": other})
            continue
        other = by_istat.get(code)
        if other and other["id"] != p["id"]:
            report["conflicts"].append({"type": "identifier_collision", "istatId": code, "istat": row, "anpr": other})
            continue
        fields = {field: {"anpr": p[field], "istat": value} for field, value in
                  (("istatCode", code), ("province", row["PROVINCE"]), ("name", row["NAME"]))
                  if (name_key(p[field]) != name_key(value) if field == "name" else p[field] != value)}
        if "name" in fields and {name_key(n) for n in [p["name"], *p["aliases"]] if n} & {name_key(n) for n in [row["NAME"], *row["ALIASES"]] if n}:
            report["nameVariants"].append({"anprId": p["id"], "istatId": code, "names": fields.pop("name"), "classification": "alias_equivalent"})
        previous_place = latest[p["belfioreCode"]]
        if fields:
            report["differences"].append({"anprId": p["id"], "istatId": code, "belfioreCode": row["BELFIORE"], "fields": fields})
        elif previous_place["id"] == p["id"]:
            continue
        if previous_place["istatCode"] == code and previous_place["province"] == row["PROVINCE"] and name_key(previous_place["name"]) == name_key(row["NAME"]): continue
        variation = variations.get(code)
        documented = variation and variation["OLD_ISTAT"] == p["istatCode"] and name_key(variation["NAME"]) == name_key(row["NAME"])
        start = variation["EFFECTIVE_FROM"] if documented else reference
        if not start or (previous_place["validFrom"] and start <= previous_place["validFrom"]):
            report["conflicts"].append({"type": "istat_reference_predates_anpr_version" if not documented else "unresolved_interval", "anprId": p["id"], "istatId": code})
            continue
        original = by_id[p["id"]] if previous_place["id"] == p["id"] else previous_place
        original["validTo"] = (date.fromisoformat(start) - timedelta(days=1)).isoformat()
        original["status"] = "ceased"
        derived = {**previous_place, "status": "active", "id": f"istat-current:{code}:{start}", "sourceId": "istat-current", "sourceRecordId": code,
                   "istatCode": code, "province": row["PROVINCE"], "name": row["NAME"], "validFrom": start, "validTo": None, "sourceUpdatedAt": reference,
                   "aliases": sorted({p["name"], *p["aliases"], *row["ALIASES"]} - {"", row["NAME"]})}
        output.append(derived)
        latest[p["belfioreCode"]] = derived
        report["overlays"].append({"anprId": p["id"], "istatId": code, "derivedId": derived["id"], "effectiveFrom": start,
                                   "dateBasis": "documented_statistical_effective_date" if documented else "current_list_reference_date",
                                   "evidence": ["istat-current", "istat-sardinia" if documented else "istat-publication"]})
    current_codes = {row["BELFIORE"] for row in current.values()}
    for code, p in sorted(active.items()):
        if code not in current_codes: report["conflicts"].append({"type": "missing_in_istat", "anprId": p["id"], "anpr": p})
    report["summary"] = {key: len(report[key]) for key in ("differences", "conflicts", "overlays")}
    return sorted(output, key=lambda p: p["id"]), report


def reconcile(previous, incoming):
    result = dict(previous)
    diff = {"added": [], "modified": [], "missing": sorted(set(previous) - set(incoming)), "unchanged": 0}
    for key, row in incoming.items():
        if key not in previous:
            diff["added"].append(key)
        elif previous[key] != row:
            diff["modified"].append({"id": key, "fields": sorted(k for k in set(previous[key]) | set(row) if previous[key].get(k) != row.get(k))})
        else:
            diff["unchanged"] += 1
        result[key] = row
    diff["added"].sort()
    diff["modified"].sort(key=lambda row: row["id"])
    return result, diff


def place(source, row):
    municipal = source == "anpr-comuni"
    if not municipal and row["NASCITA"] != "S" and not row.get("CODAT"):
        # Citizenship-only classifications are not fiscal birthplace records.
        return None
    start = iso(row.get("DATAISTITUZIONE" if municipal else "DATAINIZIOVALIDITA"))
    end = iso(row.get("DATACESSAZIONE" if municipal else "DATAFINEVALIDITA"), end=True)
    if start and end and start > end:
        raise ValueError(f"Reversed interval for {source}:{row['ID']}")
    if municipal:
        name = row["DENOMINAZIONE_IT"]
        aliases = [row.get(key) for key in ("DENOMTRASLITTERATA", "ALTRADENOMINAZIONE", "ALTRADENOMTRASLITTERATA")]
        status = {"A": "active", "C": "ceased", "D": "planned"}[row["STATO"]]
    else:
        name = row["DENOMINAZIONE"]
        aliases = [row.get(key) for key in ("DENOMINAZIONEISTAT", "DENOMINAZIONEISTAT_EN", "CODISO3166_1_ALPHA3")]
        status = "ceased" if end else "active"
        # ANPR's 1900 start is a conventional registry bound, not state founding.
        if start == "1900-01-01":
            start = None
    code = belfiore(row.get("CODCATASTALE" if municipal else "CODAT"))
    if municipal and status == "active" and code is None:
        raise ValueError(f"Active municipality has no Belfiore: {row['ID']}")
    return {
        "id": f"{source}:{row['ID']}", "sourceId": source, "sourceRecordId": row["ID"],
        "name": name, "aliases": sorted(set(value for value in aliases if value and value != name)),
        "kind": "municipality" if municipal else ("foreign_country" if row["TIPO"] == "STATO" else "foreign_territory"),
        "status": status, "belfioreCode": code, "istatCode": row.get("CODISTAT") or None,
        "province": row["SIGLAPROVINCIA"] if municipal else "EE",
        "validFrom": start, "validTo": end,
        "birthAllowed": None if municipal else row["NASCITA"] == "S",
        "sourceUpdatedAt": iso(row.get("DATAULTIMOAGG")),
    }


def sync(output, inputs):
    output.mkdir(parents=True, exist_ok=True)
    archive_path = output / "source-state.json.gz"
    previous = json.loads(gzip.decompress(archive_path.read_bytes())) if archive_path.exists() else {}
    previous_snapshot = {}
    if (output / "state.json").exists():
        old_state = json.loads((output / "state.json").read_text())
        previous_snapshot = json.loads(gzip.decompress((output / old_state["snapshot"]).read_bytes()))
    records, changes, sources = {}, {}, {}
    for source, (raw, metadata, url, parser) in inputs.items():
        incoming = parser(raw)
        records[source], changes[source] = reconcile(previous.get(source, {}), incoming)
        if source.startswith("istat-"):
            # These are complete editions, not historical upsert archives.
            records[source] = incoming
        reference = max((iso(row.get("DATAULTIMOAGG")) or "" for row in incoming.values()), default="")
        if source == "anpr-countries" and not reference:
            reference = "2024-01-12"  # Publication date declared on ANPR's decoding-table page.
        sources[source] = {"url": url, "referenceDate": reference or None, "sha256": digest(raw), "recordCount": len(incoming), **metadata}
        write_gzip(output / "sources" / f"{source}-{digest(raw)}.gz", raw)
    if "istat-current" in records:
        if "istat-publication" not in records: raise ValueError("ISTAT current list requires its dated publication page")
        sources["istat-current"]["referenceDate"] = sources["istat-publication"]["referenceDate"]
        if not sources["istat-current"]["referenceDate"]: raise ValueError("Missing ISTAT current reference date")
    places = sorted((p for source, source_records in records.items() if source in ("anpr-comuni", "anpr-countries") for row in source_records.values()
                     if (p := place(source, row)) is not None), key=lambda row: row["id"])
    if not places:
        raise ValueError("Sources produced an empty runtime place catalog")
    administrative_report = None
    if "istat-current" in records:
        places, administrative_report = administrative_catalog(places, records["istat-current"], records.get("istat-sardinia", {}), sources["istat-current"]["referenceDate"], previous_snapshot)
        for overlay in administrative_report["overlays"]:
            if "sourceHashes" not in overlay:
                overlay["sourceHashes"] = {key: sources[key]["sha256"] for key in ["anpr-comuni", *overlay["evidence"]]}
    supplements_path = ROOT / "data/reference/province-supplements.json"
    supplements = json.loads(supplements_path.read_text())
    province_names = []
    for code in sorted({p["province"] for p in places if p["province"]}):
        row = records.get("ade-provinces", {}).get(code)
        source_name = row["NAME"] if row else supplements["names"].get(code)
        if source_name:
            name = supplements["displayOverrides"].get(code, source_name.title() if row else source_name)
            province_names.append({"code": code, "name": name, "aliases": sorted({source_name} - {name})})
    if "istat-current" in records:
        for code, name in sorted({row["PROVINCE"]: row["PROVINCE_NAME"] for row in records["istat-current"].values()}.items()):
            entry = next((p for p in province_names if p["code"] == code), None)
            old_entries = [dict(p) for p in previous_snapshot.get("provinces", []) if p["code"] == code]
            if any(p.get("validFrom") or p.get("validTo") for p in old_entries):
                province_names = [p for p in province_names if p["code"] != code] + old_entries
                entry = max(old_entries, key=lambda p: p.get("validFrom") or "")
            if entry and name_key(entry["name"]) == name_key(name): continue
            rows = [row for row in records["istat-current"].values() if row["PROVINCE"] == code]
            dates = {records.get("istat-sardinia", {}).get(row["ID"], {}).get("EFFECTIVE_FROM") for row in rows}
            start = next(iter(dates)) if len(dates) == 1 and None not in dates else sources["istat-current"]["referenceDate"]
            if entry and entry.get("validFrom") and start <= entry["validFrom"]:
                start = sources["istat-current"]["referenceDate"]
                if start <= entry["validFrom"]: raise ValueError("Conflicting ISTAT province names within the same edition date")
            if entry: entry["validTo"] = (date.fromisoformat(start) - timedelta(days=1)).isoformat()
            province_names.append({"code": code, "name": name, "aliases": [], "validFrom": start,
                                   "sourceId": "istat-current", "sourceSha256": sources["istat-current"]["sha256"],
                                   "dateBasis": "documented_statistical_effective_date" if len(dates) == 1 and None not in dates and start in dates else "current_list_reference_date"})
    province_names.sort(key=lambda p: (p["code"], p.get("validFrom") or "", p["name"]))
    active_codes = [p["belfioreCode"] for p in places if p["kind"] == "municipality" and p["status"] == "active"]
    if len(active_codes) != len(set(active_codes)):
        raise ValueError("Active municipalities have duplicate Belfiore codes")
    sources["province-supplements"] = {"url": "https://github.com/arro000/ValiCore/blob/main/data/reference/province-supplements.json", "referenceDate": None,
                                      "sha256": digest(supplements_path.read_bytes()), "recordCount": len(supplements["names"]), "references": supplements["sources"]}
    content = {"schemaVersion": 1, "places": places, "provinces": province_names, "referenceDates": {k: v["referenceDate"] for k, v in sources.items()}}
    if administrative_report is not None: content["administrativeReconciliation"] = administrative_report
    content_hash = digest(canonical(content))
    reference = max((s["referenceDate"] or "" for s in sources.values()), default="unknown")
    version = f"{reference or 'undated'}-{content_hash[:12]}"
    coverage = {"municipalities": "ANPR historical archive, including ceased and planned records",
                "foreignPlaces": "ANPR birth-enabled foreign country/territory table; historical coverage is source-limited",
                "missingBelfioreRecords": sum(p["belfioreCode"] is None for p in places),
                "administrativeDatesAreFiscalAllocationDates": False}
    coverage["provinceNames"] = "Dated ISTAT current labels plus T2 and reviewed historical supplements; not a complete legal-name history"
    if administrative_report is not None:
        coverage["administrativeReconciliation"] = administrative_report["summary"]
        coverage["administrativeDatePolicy"] = "Documented ISTAT statistical dates when mapped; otherwise current-list reference date (observation, not legal inception). Belfiore conflicts are reported, not overwritten."
    snapshot = {"schemaVersion": 1, "version": version, "sources": sources, "coverage": coverage, "places": places, "provinces": province_names}
    if administrative_report is not None: snapshot["administrativeReconciliation"] = administrative_report
    snapshot_path = output / "snapshots" / f"{version}.json.gz"
    changed = not snapshot_path.exists()
    if changed:
        write_gzip(snapshot_path, canonical(snapshot))
    else:
        snapshot = json.loads(gzip.decompress(snapshot_path.read_bytes()))
    diff_path = output / "diffs" / f"{version}.json"
    if changed:
        diff_path.parent.mkdir(parents=True, exist_ok=True)
        diff_path.write_text(json.dumps(changes, indent=2) + "\n")
        if administrative_report is not None:
            report_path = output / "reconciliation" / f"{version}.json"
            report_path.parent.mkdir(parents=True, exist_ok=True)
            report_path.write_text(json.dumps(administrative_report, ensure_ascii=False, indent=2) + "\n")
    # Save state only after every source and the complete dataset have passed validation.
    write_gzip(archive_path, canonical(records))
    state_path = output / "state.json"
    state = {"schemaVersion": 1, "version": version, "snapshot": f"snapshots/{version}.json.gz", "contentHash": content_hash,
             "lastCheckedAt": datetime.now(timezone.utc).isoformat(), "sources": sources}
    state_path.write_text(json.dumps(state, indent=2) + "\n")
    canonical_dir = output / "canonical"
    canonical_dir.mkdir(exist_ok=True)
    with (canonical_dir / "places.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(places[0]), lineterminator="\n")
        writer.writeheader()
        for p in places:
            writer.writerow({**p, "aliases": json.dumps(p["aliases"], ensure_ascii=False)})
    summary = {"changed": changed, "version": version, "placeCount": len(places), "sources": {k: {field: len(v[field]) for field in ("added", "modified", "missing")} for k, v in changes.items()}}
    if administrative_report is not None: summary["reconciliation"] = administrative_report["summary"]
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "data")
    parser.add_argument("--comuni-file", type=Path)
    parser.add_argument("--countries-file", type=Path)
    parser.add_argument("--provinces-file", type=Path)
    parser.add_argument("--istat-file", type=Path)
    parser.add_argument("--istat-page-file", type=Path)
    parser.add_argument("--sardinia-file", type=Path)
    args = parser.parse_args()
    inputs = {}
    for source, path, url, adapter in (("anpr-comuni", args.comuni_file, COMUNI_URL, municipalities), ("anpr-countries", args.countries_file, COUNTRIES_URL, countries), ("ade-provinces", args.provinces_file, PROVINCES_URL, provinces),
                                      ("istat-current", args.istat_file, ISTAT_URL, istat_municipalities), ("istat-publication", args.istat_page_file, ISTAT_PAGE_URL, istat_publication),
                                      ("istat-sardinia", args.sardinia_file, SARDINIA_URL, sardinia_variations)):
        raw, metadata = (path.read_bytes(), {}) if path else fetch(url)
        inputs[source] = (raw, metadata, url, adapter)
    summary = sync(args.output, inputs)
    print(json.dumps(summary, indent=2))
    import os
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as handle:
            handle.write(f"changed={str(summary['changed']).lower()}\nversion={summary['version']}\n")


if __name__ == "__main__":
    main()
