use serde_json::{Value, json};
use valicore_abi::dispatch;

#[test]
fn rea_corpus_needs_no_handle_or_catalog() {
    let corpus: Value = serde_json::from_str(include_str!(
        "../../../tests/fixtures/italian-rea-vectors.json"
    ))
    .unwrap();
    for (category, expected) in [("valid", true), ("invalid", false)] {
        for row in corpus[category].as_array().unwrap() {
            let report =
                dispatch(json!({"protocol":1,"op":"validateItalianRea","rea":row["input"]}))
                    .unwrap();
            assert_eq!(report["valid"], expected);
            assert_eq!(report["checks"][1]["status"], "not_run");
            if expected {
                for key in ["rea", "provinceCode", "serialNumber"] {
                    assert_eq!(report[key], row[key]);
                }
            } else {
                assert_eq!(report["checks"][0]["error"]["code"], row["error"]);
            }
        }
    }
}

#[test]
fn invalid_payload_types_do_not_remove_or_coerce_the_constraint() {
    let missing = dispatch(json!({"protocol":1,"op":"validateItalianRea"})).unwrap_err();
    assert_eq!(missing.code, "INVALID_ARGUMENT");
    assert_eq!(missing.field.as_deref(), Some("rea"));
    for value in [
        Value::Null,
        json!(true),
        json!(1),
        json!(1.5),
        json!([]),
        json!({}),
    ] {
        let error =
            dispatch(json!({"protocol":1,"op":"validateItalianRea","rea":value})).unwrap_err();
        assert_eq!(error.code, "INVALID_ARGUMENT");
        assert_eq!(error.field.as_deref(), Some("rea"));
    }
}
