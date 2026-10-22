use serde_json::{Value, json};
use valicore_abi::dispatch;

#[test]
fn vat_corpus_is_exposed_without_a_handle_or_dataset() {
    let corpus: Value = serde_json::from_str(include_str!(
        "../../../tests/fixtures/italian-vat-vectors.json"
    ))
    .unwrap();
    for row in corpus["valid"].as_array().unwrap() {
        let report =
            dispatch(json!({"protocol":1,"op":"validateItalianVat","vat":row["input"]})).unwrap();
        assert_eq!(report["valid"], true);
        assert_eq!(report["vat"], row["vat"]);
        assert_eq!(report["scope"], "format_checksum");
        assert_eq!(report["checks"][2]["name"], "registry");
        assert_eq!(report["checks"][2]["status"], "not_run");
    }
    for row in corpus["invalid"].as_array().unwrap() {
        let report =
            dispatch(json!({"protocol":1,"op":"validateItalianVat","vat":row["input"]})).unwrap();
        assert_eq!(report["valid"], false);
        assert!(
            report["checks"]
                .as_array()
                .unwrap()
                .iter()
                .any(|check| check["error"]["code"] == row["error"])
        );
    }
}

#[test]
fn vat_rejects_missing_and_non_string_payloads_without_coercion() {
    let mut requests = vec![json!({"protocol":1,"op":"validateItalianVat"})];
    for value in [
        Value::Null,
        json!(true),
        json!(42),
        json!(1.5),
        json!([]),
        json!({}),
    ] {
        requests.push(json!({"protocol":1,"op":"validateItalianVat","vat":value}));
    }
    for request in requests {
        let error = dispatch(request).unwrap_err();
        assert_eq!(error.code, "INVALID_ARGUMENT");
        assert_eq!(error.field.as_deref(), Some("vat"));
    }
}
