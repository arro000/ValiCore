use serde_json::{Value, json};
use valicore::{Dataset, DecodeOptions, Engine, Person, ValidationOptions, to_omocode};

const CODE: &str = "RSSMRA85C15H501R";

fn engine(records: Value) -> Engine {
    let dataset: Dataset = serde_json::from_value(json!({"schemaVersion":1,
        "version":"independent-history", "sources":{}, "coverage":{}, "places":records}))
    .unwrap();
    Engine::new(dataset).unwrap()
}

fn row(start: Option<&str>, end: Option<&str>) -> Value {
    json!({"id":"record", "sourceId":"test", "sourceRecordId":"record", "name":"Test",
        "aliases":[], "kind":"municipality", "status":"ceased", "belfioreCode":"H501",
        "istatCode":null,"province":"AA","validFrom":start,"validTo":end,"birthAllowed":true})
}

#[test]
fn independent_datetime_oracle_preserves_all_candidate_centuries_and_partitions() {
    let corpus: Value = serde_json::from_str(include_str!(
        "../../../tests/fixtures/birthplace-history-vectors.json"
    ))
    .unwrap();
    for case in corpus["cases"].as_array().unwrap() {
        let engine = engine(case["records"].clone());
        let code = case["code"].as_str().unwrap();
        let report = engine
            .birthplace_history(code, &DecodeOptions::default())
            .unwrap();
        assert_eq!(report.scope, "administrative_birthplace_history");
        assert_eq!(report.allocation_check.status, "not_run");
        assert_eq!(
            report.candidates.len(),
            report.decoded.candidate_dates.len()
        );
        for (actual, expected) in report
            .candidates
            .iter()
            .zip(case["candidates"].as_array().unwrap())
        {
            let mut value = serde_json::to_value(actual).unwrap();
            value.as_object_mut().unwrap().remove("error");
            assert_eq!(&value, expected, "{code}");
        }
        assert_eq!(
            report.decoded.candidate_dates,
            engine
                .decode(code, &DecodeOptions::default())
                .unwrap()
                .decoded
                .candidate_dates
        );
    }
}

#[test]
fn missing_capability_and_missing_records_are_unknown_not_failed_dates() {
    for (engine, error) in [
        (Engine::without_catalog(), "CAPABILITY_UNAVAILABLE"),
        (engine(json!([])), "PLACE_NOT_IN_DATASET"),
    ] {
        let report = engine
            .birthplace_history(CODE, &DecodeOptions::default())
            .unwrap();
        assert_eq!(report.candidates.len(), 100);
        assert!(report.records.is_empty());
        for candidate in report.candidates {
            assert_eq!(candidate.compatible, None);
            assert_eq!(candidate.status, "unknown");
            assert_eq!(candidate.error.unwrap().code, error);
        }
    }
}

#[test]
fn inclusive_dates_open_ends_and_unknown_starts_have_explicit_meanings() {
    let options = DecodeOptions {
        year_range: Some([1985, 1985]),
    };
    for (start, end, compatible) in [
        (Some("1985-03-15"), Some("1985-03-15"), Some(true)),
        (Some("1985-03-15"), None, Some(true)),
        (Some("1985-03-16"), None, Some(false)),
        (None, Some("1985-03-14"), Some(false)),
        (None, Some("1985-03-15"), None),
        (None, None, None),
        (Some("1800-01-01"), Some("1985-03-14"), Some(false)),
    ] {
        let report = engine(json!([row(start, end)]))
            .birthplace_history(CODE, &options)
            .unwrap();
        assert_eq!(
            report.candidates[0].compatible, compatible,
            "{start:?} {end:?}"
        );
        assert_eq!(report.decoded.candidate_dates, ["1985-03-15"]);
    }
}

#[test]
fn history_never_filters_candidates_or_changes_encoding_and_cf_validity() {
    let engine = engine(json!([row(Some("1800-01-01"), Some("1900-01-01"))]));
    let options = DecodeOptions {
        year_range: Some([1985, 1985]),
    };
    let report = engine.birthplace_history(CODE, &options).unwrap();
    assert_eq!(report.candidates[0].compatible, Some(false));
    assert_eq!(
        engine
            .validate(CODE, &ValidationOptions::default())
            .unwrap()
            .valid,
        Some(true)
    );
    let person: Person = serde_json::from_value(json!({"name":"Mario","surname":"Rossi","sex":"M",
        "birthDate":"1985-03-15","birthplace":{"belfioreCode":"H501"}}))
    .unwrap();
    assert_eq!(engine.encode(&person).unwrap(), CODE);
    let reference = engine
        .birthplace_history(CODE, &DecodeOptions::default())
        .unwrap();
    for mask in 0..128 {
        let report = engine
            .birthplace_history(&to_omocode(CODE, mask).unwrap(), &DecodeOptions::default())
            .unwrap();
        assert_eq!(report.decoded.omocodia_mask, mask);
        assert_eq!(
            report.decoded.candidate_dates,
            reference.decoded.candidate_dates
        );
        assert_eq!(
            serde_json::to_value(report.candidates).unwrap(),
            serde_json::to_value(&reference.candidates).unwrap()
        );
    }
}

#[test]
fn records_and_partitions_are_returned_in_source_order_and_caller_owned() {
    let mut unknown = row(None, None);
    unknown["id"] = json!("unknown");
    let mut excluded = row(Some("2000-01-01"), None);
    excluded["id"] = json!("excluded");
    let engine = engine(json!([unknown, row(Some("1985-03-15"), None), excluded]));
    let mut report = engine
        .birthplace_history(
            CODE,
            &DecodeOptions {
                year_range: Some([1985, 1985]),
            },
        )
        .unwrap();
    assert_eq!(
        report
            .records
            .iter()
            .map(|p| p.id.as_str())
            .collect::<Vec<_>>(),
        ["unknown", "record", "excluded"]
    );
    assert_eq!(report.candidates[0].matching_record_ids, ["record"]);
    assert_eq!(report.candidates[0].uncertain_record_ids, ["unknown"]);
    assert_eq!(report.candidates[0].excluded_record_ids, ["excluded"]);
    report.records[0].id = "caller changed".into();
    assert_eq!(engine.places_by_code("H501").unwrap()[0].id, "unknown");
}
