use serde_json::{Value, json};
use valicore::*;

fn person() -> Person {
    serde_json::from_value(json!({"name":"Mario","surname":"Rossi","sex":"M",
        "birthDate":"1985-03-15","birthplace":{"belfioreCode":"H501"}}))
    .unwrap()
}

#[test]
fn no_catalog_runs_the_independent_generation_and_inverse_corpus() {
    let engine = Engine::without_catalog();
    assert!(engine.dataset().is_none());
    assert_eq!(
        engine.capabilities(),
        Capabilities {
            fiscal_identity: true,
            geo_historical: false,
        }
    );
    let corpus: Value =
        serde_json::from_str(include_str!("../../../tests/fixtures/fiscal-vectors.json")).unwrap();
    for row in corpus["vectors"].as_array().unwrap() {
        let person: Person = serde_json::from_value(row["person"].clone()).unwrap();
        let code = engine.encode(&person).unwrap();
        assert_eq!(code, row["code"].as_str().unwrap());
        let year = person.birth_date[..4].parse().unwrap();
        let decoded = engine
            .decode(
                &code,
                &DecodeOptions {
                    year_range: Some([year, year]),
                },
            )
            .unwrap();
        assert_eq!(
            decoded.decoded.candidate_dates.as_slice(),
            std::slice::from_ref(&person.birth_date)
        );
        assert!(decoded.places.is_empty());
        assert!(decoded.data_version.is_none());
        assert_eq!(
            engine
                .validate(
                    &code,
                    &ValidationOptions {
                        level: ValidationLevel::Calendar,
                        year_range: Some([year, year]),
                        ..Default::default()
                    }
                )
                .unwrap()
                .valid,
            Some(true)
        );
        assert!(engine.matches_person(&code, &person).unwrap().matches);
    }
}

#[test]
fn absent_catalog_is_not_an_empty_dataset_or_implicit_valid_territory() {
    let engine = Engine::without_catalog();
    let report = engine
        .validate("RSSMRA85C15H501R", &ValidationOptions::default())
        .unwrap();
    assert_eq!(report.valid, None);
    assert!(report.data_version.is_none());
    assert_eq!(report.checks[3].status, "unknown");
    assert_eq!(
        report.checks[3].error.as_ref().unwrap().code,
        "CAPABILITY_UNAVAILABLE"
    );
    assert_eq!(
        engine
            .validate("06363391001", &ValidationOptions::default())
            .unwrap()
            .valid,
        Some(true)
    );
    assert_eq!(
        engine
            .validate("invalid", &ValidationOptions::default())
            .unwrap()
            .valid,
        Some(false)
    );
    assert_eq!(
        engine.resolve_place(&person().birthplace).unwrap_err().code,
        "CAPABILITY_UNAVAILABLE"
    );
    assert_eq!(
        engine
            .search_places("Roma", &SearchOptions::default())
            .unwrap_err()
            .code,
        "CAPABILITY_UNAVAILABLE"
    );
    assert_eq!(
        engine
            .list_provinces(&ProvinceOptions::default())
            .unwrap_err()
            .code,
        "CAPABILITY_UNAVAILABLE"
    );
    assert_eq!(
        engine.places_by_code("H501").unwrap_err().code,
        "CAPABILITY_UNAVAILABLE"
    );
}

#[test]
fn generation_never_discards_selectors_dates_or_province_constraints() {
    let engine = Engine::without_catalog();
    for query in [
        json!({"name":"Roma"}),
        json!({"istatCode":"058091"}),
        json!({"belfioreCode":"H501","province":"RM"}),
        json!({"belfioreCode":"H501","onDate":"1985-03-15"}),
    ] {
        let mut person = person();
        person.birthplace = serde_json::from_value(query).unwrap();
        assert_eq!(
            engine.encode(&person).unwrap_err().code,
            "CAPABILITY_UNAVAILABLE"
        );
    }
    for query in [json!({}), json!({"name":"Roma","belfioreCode":"H501"})] {
        let mut person = person();
        person.birthplace = serde_json::from_value(query).unwrap();
        assert_eq!(
            engine.encode(&person).unwrap_err().code,
            "INVALID_PLACE_QUERY"
        );
    }
    let mut malformed = person();
    malformed.birthplace.on_date = Some("1900-02-29".into());
    assert_eq!(engine.encode(&malformed).unwrap_err().code, "INVALID_DATE");
    malformed.birthplace.on_date = None;
    malformed.birthplace.belfiore_code = Some("not-a-code".into());
    assert_eq!(
        engine.encode(&malformed).unwrap_err().code,
        "INVALID_BELFIORE"
    );
}
