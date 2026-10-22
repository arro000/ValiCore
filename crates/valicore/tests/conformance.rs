use serde_json::json;
use valicore::*;

#[test]
fn province_name_versions_are_date_scoped_and_reject_overlaps() {
    let mut dataset = engine().dataset().unwrap().clone();
    dataset.provinces = serde_json::from_value(json!([
        {"code":"RM", "name":"Old name", "aliases":["Legacy alias"], "validTo":"2025-12-31"},
        {"code":"RM", "name":"Current name", "aliases":[], "validFrom":"2026-01-01"}
    ]))
    .unwrap();
    let cf = Engine::new(dataset.clone()).unwrap();
    for (date, name) in [("2025-12-31", "Old name"), ("2026-01-01", "Current name")] {
        let result = cf
            .list_provinces(&ProvinceOptions {
                on_date: Some(date.into()),
                query: Some("RM".into()),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(result[0].name.as_deref(), Some(name));
    }
    assert!(
        cf.list_provinces(&ProvinceOptions {
            on_date: Some("2026-01-01".into()),
            query: Some("Legacy alias".into()),
            ..Default::default()
        })
        .unwrap()
        .is_empty()
    );
    assert_eq!(
        cf.list_provinces(&ProvinceOptions {
            query: Some("RM".into()),
            ..Default::default()
        })
        .unwrap()[0]
            .name
            .as_deref(),
        Some("Current name")
    );
    dataset.provinces[0].valid_to = Some("2026-01-01".into());
    assert!(Engine::new(dataset).is_err());
}

#[test]
fn provinces_are_dated_and_count_distinct_places_not_versions() {
    let mut dataset = engine().dataset().unwrap().clone();
    let mut duplicate = dataset.places[0].clone();
    duplicate.id = "rome-version".into();
    dataset.places.push(duplicate);
    let engine = Engine::new(dataset).unwrap();
    let legacy = engine
        .list_provinces(&ProvinceOptions {
            query: Some("rm".into()),
            ..Default::default()
        })
        .unwrap();
    assert_eq!(legacy[0].code, "RM");
    assert!(legacy[0].name.is_none());
    let provinces = engine
        .list_provinces(&ProvinceOptions {
            on_date: Some("1985-03-15".into()),
            ..Default::default()
        })
        .unwrap();
    assert_eq!(
        provinces
            .iter()
            .find(|province| province.code == "RM")
            .unwrap()
            .place_count,
        1
    );
    assert_eq!(
        provinces
            .iter()
            .find(|province| province.code == "VI")
            .unwrap()
            .place_count,
        1
    );
    assert!(
        engine
            .list_provinces(&ProvinceOptions {
                on_date: Some("1985-02-31".into()),
                ..Default::default()
            })
            .is_err()
    );
}

fn engine() -> Engine {
    let mut places = Vec::new();
    for (id, name, code, province, status, start, end) in [
        ("rome", "ROMA", "H501", "RM", "active", "1870-09-20", None),
        (
            "turin",
            "TORINO",
            "L219",
            "TO",
            "active",
            "1861-03-17",
            None,
        ),
        (
            "old",
            "CASTEGNERO",
            "C056",
            "VI",
            "ceased",
            "1866-11-19",
            Some("2026-02-20"),
        ),
        (
            "new",
            "CASTEGNERO NANTO",
            "M439",
            "VI",
            "active",
            "2026-02-21",
            None,
        ),
        (
            "ambiguous1",
            "SAN TEST",
            "A001",
            "AA",
            "active",
            "1900-01-01",
            None,
        ),
        (
            "ambiguous2",
            "SAN TEST",
            "A002",
            "BB",
            "active",
            "1900-01-01",
            None,
        ),
    ] {
        places.push(Place {
            id: id.into(),
            source_id: "fixture".into(),
            source_record_id: id.into(),
            name: name.into(),
            aliases: vec![],
            kind: "municipality".into(),
            status: status.into(),
            belfiore_code: Some(code.into()),
            istat_code: None,
            province: Some(province.into()),
            valid_from: Some(start.into()),
            valid_to: end.map(str::to_owned),
            birth_allowed: None,
            source_updated_at: None,
        });
    }
    Engine::new(Dataset {
        provinces: vec![],
        schema_version: 1,
        version: "fixture".into(),
        sources: json!({}),
        coverage: json!({}),
        places,
    })
    .unwrap()
}

#[test]
fn known_independent_vectors() {
    assert_eq!(
        encode_with_belfiore("Fabio", "Caccamo", "M", "1985-04-03", "L219", 0).unwrap(),
        "CCCFBA85D03L219P"
    );
    assert_eq!(
        encode_with_belfiore("Mario", "Rossi", "M", "1985-03-15", "H501", 0).unwrap(),
        "RSSMRA85C15H501R"
    );
    assert_eq!(name_code("Francesco").unwrap(), "FNC");
    assert_eq!(surname_code("Li").unwrap(), "LIX");
    assert_eq!(name_code("Io").unwrap(), "IOX");
}

#[test]
fn all_masks_are_unique_reversible_and_reomocodable() {
    for base in ["CCCFBA85D03L219P", "RSSMRA85C15H501R"] {
        let variants = omocodes(base, true).unwrap();
        assert_eq!(variants.len(), 128);
        assert_eq!(
            variants
                .iter()
                .collect::<std::collections::HashSet<_>>()
                .len(),
            128
        );
        for (mask, code) in variants.iter().enumerate() {
            checked_code(code).unwrap();
            assert_eq!(omocodia_mask(code).unwrap(), mask as u8);
            assert_eq!(to_base(code).unwrap(), base);
            assert_eq!(to_omocode(code, 127).unwrap(), variants[127]);
        }
        assert_eq!(omocodes(&variants[127], false).unwrap().len(), 127);
    }
    assert!(to_omocode("RSSMRA85C15H501R", 128).is_err());
    assert!(omocodia_mask("invalid").is_err());
}

#[test]
fn calendar_rejects_overflow_and_handles_century_ambiguity() {
    for date in [
        "1985-02-31",
        "1900-02-29",
        "2000-13-01",
        "2000-01-00",
        "0000-01-01",
        "1985-2-03",
    ] {
        assert!(CivilDate::parse(date).is_err(), "{date}");
    }
    assert!(CivilDate::parse("2000-02-29").is_ok());
    let code = encode_with_belfiore("Mario", "Rossi", "M", "2000-02-29", "H501", 0).unwrap();
    let decoded = decode(
        &code,
        &DecodeOptions {
            year_range: Some([1900, 2099]),
        },
    )
    .unwrap();
    assert_eq!(decoded.candidate_dates, ["2000-02-29"]);
    assert!(
        decode(
            &code,
            &DecodeOptions {
                year_range: Some([1900, 1900])
            }
        )
        .is_err()
    );
    let decoded = decode(
        "RSSMRA85C15H501R",
        &DecodeOptions {
            year_range: Some([1900, 2099]),
        },
    )
    .unwrap();
    assert_eq!(decoded.candidate_dates, ["1985-03-15", "2085-03-15"]);
    assert!(decoded.century_ambiguous);
}

#[test]
fn invalid_day_and_unknown_territory_do_not_pass() {
    let engine = engine();
    for body in [
        "RSSMRA85B31H501",
        "RSSMRA85A00H501",
        "RSSMRA85A32H501",
        "RSSMRA85A40H501",
        "RSSMRA85A72H501",
    ] {
        let code = format!("{body}{}", checksum(body).unwrap());
        assert_eq!(
            engine.validate(&code, &Default::default()).unwrap().valid,
            Some(false)
        );
    }
    assert_eq!(
        engine
            .validate("RSSMRA85A01A000H", &Default::default())
            .unwrap()
            .valid,
        None
    );
    assert_eq!(
        engine
            .validate("rssmra85c15h501r", &Default::default())
            .unwrap()
            .valid,
        Some(true)
    );
    assert_eq!(
        engine
            .validate("RSSMRA85C15H501A", &Default::default())
            .unwrap()
            .valid,
        Some(false)
    );
}

#[test]
fn history_and_ambiguity_are_explicit() {
    let engine = engine();
    let query = PlaceQuery {
        name: Some("Castegnero".into()),
        on_date: Some("2026-02-20".into()),
        ..Default::default()
    };
    assert_eq!(
        engine
            .resolve_place(&query)
            .unwrap()
            .belfiore_code
            .as_deref(),
        Some("C056")
    );
    assert_eq!(
        engine
            .resolve_place(&PlaceQuery {
                on_date: Some("2026-02-21".into()),
                ..query
            })
            .unwrap()
            .status,
        "missing"
    );
    let query = PlaceQuery {
        name: Some("San Test".into()),
        ..Default::default()
    };
    assert_eq!(engine.resolve_place(&query).unwrap().status, "ambiguous");
    assert_eq!(
        engine
            .resolve_place(&PlaceQuery {
                province: Some("AA".into()),
                ..query
            })
            .unwrap()
            .status,
        "unique"
    );
}

#[test]
fn person_matching_accepts_omocodia_without_equating_identity() {
    let engine = engine();
    let person = Person {
        name: "Mario".into(),
        surname: "Rossi".into(),
        sex: "M".into(),
        birth_date: "1985-03-15".into(),
        birthplace: PlaceQuery {
            belfiore_code: Some("H501".into()),
            ..Default::default()
        },
        omocodia_mask: 0,
    };
    assert!(
        engine
            .matches_person(
                &to_omocode(&engine.encode(&person).unwrap(), 127).unwrap(),
                &person
            )
            .unwrap()
            .matches
    );
    let different = Person {
        name: "Fabio".into(),
        ..person
    };
    assert!(
        !engine
            .matches_person("RSSMRA85C15H501R", &different)
            .unwrap()
            .matches
    );
}

#[test]
fn latin_normalization_is_explicit() {
    assert_eq!(surname_code("Éé").unwrap(), "EEX");
    assert_eq!(normalize_name("D’Angelo").unwrap(), "DANGELO");
    assert_eq!(normalize_name("Müller").unwrap(), "MULLER");
    assert_eq!(normalize_name("Straße").unwrap(), "STRASSE");
    assert_eq!(search_key("Città Sant'Angelo"), "CITTASANTANGELO");
    assert!(normalize_name("Иван").is_err());
    assert!(normalize_name("123").is_err());
}

#[test]
fn numeric_codes_have_separate_checksum_semantics() {
    assert_eq!(numeric_checksum("0636339100").unwrap(), "1");
    let report = engine()
        .validate("06363391001", &Default::default())
        .unwrap();
    assert_eq!(report.kind, "numeric");
    assert_eq!(report.valid, Some(true));
    assert!(report.decoded.is_none());
    assert_eq!(
        engine()
            .validate("06363391002", &Default::default())
            .unwrap()
            .valid,
        Some(false)
    );
}
