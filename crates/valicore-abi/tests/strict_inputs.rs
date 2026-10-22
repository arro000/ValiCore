//! Initialization and boolean constraints must not be silently discarded.
use serde_json::{Value, json};
use valicore_abi::dispatch;

#[test]
fn unknown_initialization_fields_fail_instead_of_dropping_constraints() {
    for field in ["unexpected", "providerDataset", "dataVersion", "handle"] {
        for value in [Value::Null, json!(false), json!([]), json!({})] {
            let mut request = json!({"protocol":1,"op":"create"});
            request[field] = value;
            let error = dispatch(request).unwrap_err();
            assert_eq!(error.code, "INVALID_ARGUMENT");
            assert_eq!(error.field.as_deref(), Some(field));
        }
    }
    let handle = dispatch(json!({"protocol":1,"op":"create"})).unwrap();
    dispatch(json!({"protocol":1,"op":"dispose","handle":handle})).unwrap();
}

#[cfg(feature = "fiscal")]
#[test]
fn include_base_is_a_boolean_not_a_truthy_or_ignored_value() {
    for value in [
        Value::Null,
        json!(0),
        json!(1),
        json!("false"),
        json!([]),
        json!({}),
    ] {
        let error = dispatch(
            json!({"protocol":1,"op":"omocodes","code":"RSSMRA85C15H501R","includeBase":value}),
        )
        .unwrap_err();
        assert_eq!(error.code, "INVALID_ARGUMENT");
        assert_eq!(error.field.as_deref(), Some("includeBase"));
    }
    for (include, expected) in [(false, 127), (true, 128)] {
        let result = dispatch(
            json!({"protocol":1,"op":"omocodes","code":"RSSMRA85C15H501R","includeBase":include}),
        )
        .unwrap();
        assert_eq!(result.as_array().unwrap().len(), expected);
    }
    let default =
        dispatch(json!({"protocol":1,"op":"omocodes","code":"RSSMRA85C15H501R"})).unwrap();
    assert_eq!(default.as_array().unwrap().len(), 128);
}

#[test]
fn unknown_operations_are_unknown_without_requiring_a_handle() {
    let error = dispatch(json!({"protocol":1,"op":"notAnOperation"})).unwrap_err();
    assert_eq!(error.code, "UNKNOWN_OPERATION");
    assert_eq!(error.field.as_deref(), Some("op"));
}
