use serde_json::{Value, json};
use std::collections::HashSet;
use valicore::*;

fn corpus() -> Value {
    serde_json::from_str(include_str!("../../../tests/fixtures/fiscal-vectors.json")).unwrap()
}

fn catalog() -> Dataset {
    serde_json::from_value(json!({
        "schemaVersion":1,"version":"edge-fixture","sources":{},"coverage":{},
        "places":[
            {"id":"old","sourceId":"fixture","sourceRecordId":"1","name":"OLD NAME","aliases":["Shared name"],"kind":"municipality","status":"ceased","belfioreCode":"A001","istatCode":"001001","province":"AA","validFrom":"1900-01-01","validTo":"1999-12-31"},
            {"id":"new","sourceId":"fixture","sourceRecordId":"2","name":"NEW NAME","aliases":["Shared name"],"kind":"municipality","status":"active","belfioreCode":"A001","istatCode":"002001","province":"BB","validFrom":"2000-01-01","validTo":null},
            {"id":"homonym","sourceId":"fixture","sourceRecordId":"3","name":"NEW NAME","aliases":[],"kind":"municipality","status":"active","belfioreCode":"A002","istatCode":"003001","province":"CC","validFrom":"2000-01-01","validTo":null},
            {"id":"missing","sourceId":"fixture","sourceRecordId":"4","name":"NO CODE","aliases":["Shared name"],"kind":"municipality","status":"ceased","belfioreCode":null,"istatCode":null,"province":"AA","validFrom":null,"validTo":null},
            {"id":"foreign","sourceId":"fixture","sourceRecordId":"5","name":"FOREIGN COUNTRY","aliases":["Country alias"],"kind":"foreign_country","status":"active","belfioreCode":"Z001","istatCode":null,"province":"EE","validFrom":null,"validTo":null,"birthAllowed":true},
            {"id":"forbidden","sourceId":"fixture","sourceRecordId":"6","name":"CITIZENSHIP ONLY","aliases":[],"kind":"foreign_territory","status":"active","belfioreCode":"Z002","istatCode":null,"province":"EE","validFrom":null,"validTo":null,"birthAllowed":false},
            {"id":"planned","sourceId":"fixture","sourceRecordId":"7","name":"FUTURE PLACE","aliases":[],"kind":"municipality","status":"planned","belfioreCode":"A003","istatCode":"004001","province":"DD","validFrom":"2100-01-01","validTo":null}
        ],
        "provinces":[{"code":"BB","name":"Before rename","aliases":["Legacy label"],"validTo":"2025-12-31"},
                     {"code":"BB","name":"After rename","aliases":[],"validFrom":"2026-01-01"}]
    })).unwrap()
}

fn person(query: PlaceQuery) -> Person {
    Person {
        name: "Mario".into(),
        surname: "Rossi".into(),
        sex: "M".into(),
        birth_date: "2000-01-01".into(),
        birthplace: query,
        omocodia_mask: 0,
    }
}

#[test]
fn independent_golden_corpus_covers_people_names_and_both_checksums() {
    let data = corpus();
    for row in data["vectors"].as_array().unwrap() {
        let p: Person = serde_json::from_value(row["person"].clone()).unwrap();
        let code = encode_with_belfiore(
            &p.name,
            &p.surname,
            &p.sex,
            &p.birth_date,
            p.birthplace.belfiore_code.as_ref().unwrap(),
            p.omocodia_mask,
        )
        .unwrap();
        assert_eq!(code, row["code"].as_str().unwrap(), "{}", row["id"]);
        assert_eq!(to_base(&code).unwrap(), row["baseCode"]);
        let year = p.birth_date[..4].parse().unwrap();
        let decoded = decode(
            &code,
            &DecodeOptions {
                year_range: Some([year, year]),
            },
        )
        .unwrap();
        assert_eq!(decoded.candidate_dates, vec![p.birth_date.clone()]);
        assert_eq!(decoded.sex, p.sex);
        assert_eq!(decoded.name_code, row["nameCode"]);
        assert_eq!(decoded.surname_code, row["surnameCode"]);
        assert_eq!(decoded.year_two_digits, (year % 100) as u8);
        assert_eq!(decoded.month, p.birth_date[5..7].parse::<u8>().unwrap());
        assert_eq!(decoded.day, p.birth_date[8..].parse::<u8>().unwrap());
        assert_eq!(decoded.belfiore_code, p.birthplace.belfiore_code.unwrap());
    }
    for row in data["names"].as_array().unwrap() {
        let name = row["input"].as_str().unwrap();
        assert_eq!(normalize_name(name).unwrap(), row["normalized"]);
        assert_eq!(name_code(name).unwrap(), row["nameCode"]);
        assert_eq!(surname_code(name).unwrap(), row["surnameCode"]);
    }
    for row in data["checksums"].as_array().unwrap() {
        assert_eq!(
            checksum(row["body"].as_str().unwrap()).unwrap(),
            row["expected"]
        );
    }
    for row in data["numericChecksums"].as_array().unwrap() {
        assert_eq!(
            numeric_checksum(row["body"].as_str().unwrap()).unwrap(),
            row["expected"]
        );
    }
}

#[test]
fn independent_inverse_vectors_preserve_fragments_and_explicit_century_ambiguity() {
    for row in corpus()["decodeCases"].as_array().unwrap() {
        let options: DecodeOptions = serde_json::from_value(row["options"].clone()).unwrap();
        let result = decode(row["code"].as_str().unwrap(), &options);
        if let Some(error) = row["error"].as_str() {
            assert_eq!(result.unwrap_err().code, error, "{}", row["code"]);
        } else {
            let decoded = serde_json::to_value(result.unwrap()).unwrap();
            for (field, expected) in row["expected"].as_object().unwrap() {
                assert_eq!(&decoded[field], expected, "{} {field}", row["code"]);
            }
            assert!(decoded.get("name").is_none() && decoded.get("surname").is_none());
        }
    }
}

#[test]
fn entire_gregorian_400_year_cycle_and_byte_boundaries() {
    let mut total = 0;
    let mut leap_days = 0;
    for year in 2000..2400 {
        for month in 1..=12 {
            for day in 0..=35 {
                if let Ok(date) = CivilDate::new(year, month, day) {
                    assert_eq!(CivilDate::parse(&date.to_string()).unwrap(), date);
                    assert!((1..=31).contains(&day));
                    total += 1;
                    if month == 2 && day == 29 {
                        leap_days += 1;
                    }
                }
            }
        }
    }
    assert_eq!((total, leap_days), (146_097, 97));
    for year in [0, 1, 1900, 2000, 9999, 10000, u16::MAX] {
        for month in 0..=u8::MAX {
            for day in 0..=u8::MAX {
                let expected = (1..=9999).contains(&year)
                    && (1..=12).contains(&month)
                    && day > 0
                    && day
                        <= match month {
                            2 if year % 400 == 0 || year % 4 == 0 && year % 100 != 0 => 29,
                            2 => 28,
                            4 | 6 | 9 | 11 => 30,
                            1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
                            _ => 0,
                        };
                assert_eq!(
                    CivilDate::new(year, month, day).is_ok(),
                    expected,
                    "{year}-{month}-{day}"
                );
            }
        }
    }
}

#[test]
fn generation_and_inverse_for_every_day_of_a_400_year_cycle_and_both_sexes() {
    let mut generated = 0;
    for year in 2000..2400 {
        for month in 1..=12 {
            for day in 1..=31 {
                let Ok(date) = CivilDate::new(year, month, day) else {
                    continue;
                };
                for sex in ["M", "F"] {
                    let date = date.to_string();
                    let code = encode_with_belfiore("Io", "Li", sex, &date, "Z404", 0).unwrap();
                    let expected_body = format!(
                        "LIXIOX{:02}{}{:02}Z404",
                        year % 100,
                        b"ABCDEHLMPRST"[(month - 1) as usize] as char,
                        day + if sex == "F" { 40 } else { 0 }
                    );
                    assert_eq!(&code[..15], expected_body);
                    let decoded = decode(
                        &code,
                        &DecodeOptions {
                            year_range: Some([year, year]),
                        },
                    )
                    .unwrap();
                    assert_eq!(decoded.candidate_dates, [date]);
                    assert_eq!((decoded.month, decoded.day), (month, day));
                    assert_eq!(decoded.sex, sex);
                    assert_eq!(decoded.name_code, "IOX");
                    assert_eq!(decoded.surname_code, "LIX");
                    assert_eq!(decoded.belfiore_code, "Z404");
                    generated += 1;
                }
            }
        }
    }
    assert_eq!(generated, 292_194);
}

#[test]
fn every_encoded_day_month_and_century_boundary() {
    for year in [1, 99, 100, 400, 1900, 1999, 2000, 2004, 2100, 2400, 9999] {
        for month in 1..=12 {
            for encoded in 0..100 {
                let body = format!(
                    "RSSMRA{:02}{}{:02}H501",
                    year % 100,
                    b"ABCDEHLMPRST"[(month - 1) as usize] as char,
                    encoded
                );
                let code = format!("{body}{}", checksum(&body).unwrap());
                let day = if (41..=71).contains(&encoded) {
                    encoded - 40
                } else {
                    encoded
                };
                let expected = ((1..=31).contains(&encoded) || (41..=71).contains(&encoded))
                    && CivilDate::new(year, month, day).is_ok();
                let decoded = decode(
                    &code,
                    &DecodeOptions {
                        year_range: Some([year, year]),
                    },
                );
                assert_eq!(decoded.is_ok(), expected, "{year}-{month}-{encoded}");
                if let Ok(result) = decoded {
                    assert_eq!(result.day, day);
                    assert_eq!(result.sex, if encoded > 40 { "F" } else { "M" });
                    assert!(!result.century_ambiguous);
                }
            }
        }
    }
    for range in [[0, 1], [1, 10000], [2000, 1900], [9999, 0]] {
        assert_eq!(
            decode(
                "RSSMRA85C15H501R",
                &DecodeOptions {
                    year_range: Some(range)
                }
            )
            .unwrap_err()
            .code,
            "INVALID_YEAR_RANGE"
        );
    }
    let leap = encode_with_belfiore("Mario", "Rossi", "F", "2000-02-29", "Z404", 0).unwrap();
    assert_eq!(
        decode(
            &leap,
            &DecodeOptions {
                year_range: Some([1800, 2400])
            }
        )
        .unwrap()
        .candidate_dates,
        ["2000-02-29", "2400-02-29"]
    );
}

#[test]
fn every_omocodia_mask_for_128_independent_people_and_all_mask_transitions() {
    let data = corpus();
    for row in data["vectors"].as_array().unwrap().iter().take(128) {
        let base = row["baseCode"].as_str().unwrap();
        let variants = omocodes(base, true).unwrap();
        assert_eq!(variants.iter().collect::<HashSet<_>>().len(), 128);
        for (mask, variant) in variants.iter().enumerate() {
            assert_eq!(to_base(variant).unwrap(), base);
            assert_eq!(omocodia_mask(variant).unwrap(), mask as u8);
            assert_eq!(checked_code(variant).unwrap(), *variant);
        }
    }
    let variants = omocodes("RSSMRA85C15H501R", true).unwrap();
    for source in &variants {
        for (mask, target) in variants.iter().enumerate() {
            assert_eq!(to_omocode(source, mask as u8).unwrap(), *target);
        }
    }
}

#[test]
fn all_ascii_characters_in_every_position_and_all_check_letter_mutations() {
    let base = b"RSSMRA85C15H501R";
    for position in 0..16 {
        for char in 0..=127u8 {
            let mut bytes = *base;
            bytes[position] = char;
            let input = String::from_utf8(bytes.to_vec()).unwrap();
            // Outer whitespace is deliberately trimmed by the public code API.
            let allowed = if matches!(position, 0..=5 | 11 | 15) {
                char.is_ascii_alphabetic()
            } else if position == 8 {
                b"ABCDEHLMPRST".contains(&char.to_ascii_uppercase())
            } else {
                char.is_ascii_digit() || b"LMNPQRSTUV".contains(&char.to_ascii_uppercase())
            };
            assert_eq!(
                structural_code(&input).is_ok(),
                allowed,
                "position {position}, byte {char}"
            );
        }
    }
    for letter in b'A'..=b'Z' {
        let input = format!("RSSMRA85C15H501{}", letter as char);
        assert_eq!(checked_code(&input).is_ok(), letter == b'R');
    }
}

#[test]
fn name_lengths_expansion_empty_unsupported_and_error_fields() {
    for input in ["", " ", "'-.,", "\u{301}"] {
        assert_eq!(name_code(input).unwrap_err().code, "INVALID_NAME");
    }
    for input in ["123", "A1", "Иван", "李", "🙂", "Anna_", "A\0B", "A/B"] {
        assert_eq!(
            name_code(input).unwrap_err().code,
            "UNSUPPORTED_NAME_CHARACTER",
            "{input:?}"
        );
        assert_eq!(
            surname_code(input).unwrap_err().field.as_deref(),
            Some("surname")
        );
    }
    assert!(normalize_name(&"A".repeat(512)).is_ok());
    assert!(normalize_name(&"ß".repeat(256)).is_ok());
    assert_eq!(
        normalize_name(&"A".repeat(513)).unwrap_err().code,
        "INVALID_NAME"
    );
    assert_eq!(
        normalize_name(&"ß".repeat(257)).unwrap_err().code,
        "INVALID_NAME"
    );
    for date in [
        "2000-1-01",
        "2000/01/01",
        "2000-01-01Z",
        " 2000-01-01",
        "２０００-01-01",
        "\0",
        "99999-12-31",
    ] {
        assert!(CivilDate::parse(date).is_err());
    }
    for sex in ["", "X", " M", "Female", "0", "🙂"] {
        assert_eq!(
            encode_with_belfiore("A", "B", sex, "2000-01-01", "H501", 0)
                .unwrap_err()
                .code,
            "INVALID_SEX"
        );
    }
    for code in ["", "H50", "H5010", "0501", "H50A", "H５01", " H501"] {
        assert_eq!(
            encode_with_belfiore("A", "B", "M", "2000-01-01", code, 0)
                .unwrap_err()
                .code,
            "INVALID_BELFIORE"
        );
    }
}

#[test]
fn validation_levels_have_stable_short_circuit_and_tristate_semantics() {
    let cf = Engine::new(catalog()).unwrap();
    let valid = encode_with_belfiore("Mario", "Rossi", "M", "2000-01-01", "A001", 0).unwrap();
    let unknown = encode_with_belfiore("Mario", "Rossi", "M", "2000-01-01", "A999", 0).unwrap();
    let body = "RSSMRA00B31A001";
    let bad_date = format!("{body}{}", checksum(body).unwrap());
    let mut bad_checksum = valid.clone();
    bad_checksum.replace_range(15.., "0");
    // A digit check character is a structure failure, not a checksum failure.
    assert_eq!(
        cf.validate(&bad_checksum, &Default::default())
            .unwrap()
            .checks[0]
            .status,
        "fail"
    );
    let replacement = if &valid[15..] == "A" { "B" } else { "A" };
    bad_checksum.replace_range(15.., replacement);
    for (input, first_failure) in [("invalid", 0), (&bad_checksum, 1), (&bad_date, 2)] {
        let report = cf.validate(input, &Default::default()).unwrap();
        for (index, check) in report.checks.iter().enumerate() {
            assert_eq!(
                check.status,
                if index < first_failure {
                    "pass"
                } else if index == first_failure {
                    "fail"
                } else {
                    "not_run"
                }
            );
        }
        assert_eq!(report.valid, Some(false));
    }
    for (level, run) in [
        (ValidationLevel::Structural, 1),
        (ValidationLevel::Checksum, 2),
        (ValidationLevel::Calendar, 3),
        (ValidationLevel::Territorial, 4),
    ] {
        let report = cf
            .validate(
                &valid,
                &ValidationOptions {
                    level,
                    ..Default::default()
                },
            )
            .unwrap();
        assert_eq!(
            report.checks.iter().filter(|c| c.status == "pass").count(),
            run
        );
        assert_eq!(report.valid, Some(true));
        assert_eq!(
            cf.validate(
                &unknown,
                &ValidationOptions {
                    level,
                    ..Default::default()
                }
            )
            .unwrap()
            .valid,
            if run == 4 { None } else { Some(true) }
        );
    }
    let foreign = encode_with_belfiore("A", "B", "M", "2000-01-01", "Z001", 0).unwrap();
    assert_eq!(
        cf.validate(
            &foreign,
            &ValidationOptions {
                on_date: Some("2000-01-01".into()),
                ..Default::default()
            }
        )
        .unwrap()
        .valid,
        None
    );
    assert_eq!(
        cf.validate(
            &valid,
            &ValidationOptions {
                on_date: Some("1800-01-01".into()),
                ..Default::default()
            }
        )
        .unwrap()
        .valid,
        Some(false)
    );
}

#[test]
fn catalog_resolution_intervals_aliases_ambiguity_missing_and_birth_eligibility() {
    let cf = Engine::new(catalog()).unwrap();
    for (date, province, istat) in [
        ("1900-01-01", "AA", "001001"),
        ("1999-12-31", "AA", "001001"),
        ("2000-01-01", "BB", "002001"),
        ("9999-12-31", "BB", "002001"),
    ] {
        let result = cf
            .resolve_place(&PlaceQuery {
                belfiore_code: Some("a001".into()),
                on_date: Some(date.into()),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(result.status, "unique");
        assert_eq!(result.candidates.len(), 1);
        assert_eq!(result.candidates[0].province.as_deref(), Some(province));
        assert_eq!(result.candidates[0].istat_code.as_deref(), Some(istat));
    }
    for (name, status) in [
        ("NEW NAME", "ambiguous"),
        ("NO CODE", "missing_code"),
        ("Shared name", "missing_code"),
        ("missing", "missing"),
    ] {
        assert_eq!(
            cf.resolve_place(&PlaceQuery {
                name: Some(name.into()),
                ..Default::default()
            })
            .unwrap()
            .status,
            status
        );
    }
    for query in [
        PlaceQuery::default(),
        PlaceQuery {
            name: Some("NEW NAME".into()),
            belfiore_code: Some("A001".into()),
            ..Default::default()
        },
    ] {
        assert_eq!(
            cf.resolve_place(&query).unwrap_err().code,
            "INVALID_PLACE_QUERY"
        );
    }
    for (name, error) in [
        ("NEW NAME", "AMBIGUOUS_PLACE"),
        ("NO CODE", "MISSING_BELFIORE"),
        ("missing", "UNKNOWN_PLACE"),
        ("CITIZENSHIP ONLY", "PLACE_NOT_ALLOWED_FOR_BIRTH"),
        ("FUTURE PLACE", "UNKNOWN_PLACE"),
    ] {
        assert_eq!(
            cf.encode(&person(PlaceQuery {
                name: Some(name.into()),
                ..Default::default()
            }))
            .unwrap_err()
            .code,
            error
        );
    }
    let code = cf
        .encode(&person(PlaceQuery {
            name: Some("NEW NAME".into()),
            province: Some("bb".into()),
            ..Default::default()
        }))
        .unwrap();
    assert_eq!(to_base(&code).unwrap()[11..15], *"A001");
    assert!(
        cf.encode(&person(PlaceQuery {
            belfiore_code: Some("A003".into()),
            ..Default::default()
        }))
        .is_ok()
    );
    assert_eq!(
        cf.search_places(
            "new",
            &SearchOptions {
                limit: Some(0),
                ..Default::default()
            }
        )
        .unwrap()
        .len(),
        0
    );
    assert_eq!(
        cf.search_places(
            "old",
            &SearchOptions {
                active_only: Some(true),
                ..Default::default()
            }
        )
        .unwrap()
        .len(),
        0
    );
    assert_eq!(
        cf.search_places(
            " NEW--name ",
            &SearchOptions {
                province: Some("bb".into()),
                ..Default::default()
            }
        )
        .unwrap()
        .len(),
        1
    );
    assert!(
        cf.list_provinces(&ProvinceOptions {
            on_date: Some("2026-01-01".into()),
            query: Some("Legacy label".into()),
            ..Default::default()
        })
        .unwrap()
        .is_empty()
    );
    assert_eq!(
        cf.list_provinces(&ProvinceOptions {
            kind: Some("foreign_territory".into()),
            ..Default::default()
        })
        .unwrap()
        .len(),
        0
    );
}

#[test]
fn malformed_datasets_are_rejected_without_panics() {
    let base = serde_json::to_value(catalog()).unwrap();
    let mut mutations = Vec::new();
    for (path, value) in [
        ("id", json!("")),
        ("name", json!(" \t")),
        ("kind", json!("city")),
        ("status", json!("bad")),
        ("belfioreCode", json!("H50X")),
        ("validFrom", json!("2000-02-31")),
        ("validTo", json!("1800-01-01")),
    ] {
        let mut data = base.clone();
        data["places"][0][path] = value;
        mutations.push(data);
    }
    let mut data = base.clone();
    data["schemaVersion"] = json!(2);
    mutations.push(data);
    let mut data = base.clone();
    data["places"][1]["id"] = data["places"][0]["id"].clone();
    mutations.push(data);
    for (field, value) in [
        ("code", json!("bbb")),
        ("name", json!("")),
        ("validFrom", json!("2026-02-31")),
        ("validTo", json!("2026-01-01")),
    ] {
        let mut data = base.clone();
        data["provinces"][0][field] = value;
        mutations.push(data);
    }
    for data in mutations {
        assert!(Engine::new(serde_json::from_value(data).unwrap()).is_err());
    }
}

#[test]
fn deterministic_unicode_and_ascii_noise_never_panics() {
    let cf = Engine::new(catalog()).unwrap();
    let tokens = [
        "A", "0", "-", " ", "\0", "é", "🙂", "Ж", "𐀀", "\u{301}", "\n", "’",
    ];
    let mut state = 0x6cf20261002u64;
    for index in 0..10_000 {
        let mut input = String::new();
        for _ in 0..index % 40 {
            state ^= state << 13;
            state ^= state >> 7;
            state ^= state << 17;
            input.push_str(tokens[state as usize % tokens.len()]);
        }
        let _ = normalize_name(&input);
        let _ = CivilDate::parse(&input);
        let _ = checksum(&input);
        let _ = numeric_checksum(&input);
        let _ = structural_code(&input);
        let _ = checked_code(&input);
        let _ = decode(&input, &Default::default());
        let _ = to_base(&input);
        let _ = omocodia_mask(&input);
        let _ = cf.validate(&input, &Default::default());
        assert!(
            cf.search_places(
                &input,
                &SearchOptions {
                    limit: Some(200),
                    ..Default::default()
                }
            )
            .is_ok()
        );
    }
}
