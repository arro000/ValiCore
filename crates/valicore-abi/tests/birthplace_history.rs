use serde_json::{Value, json};
use valicore_abi::dispatch;

#[test]
fn history_reports_each_candidate_without_catalog_and_preserves_strict_payloads() {
    let handle = dispatch(json!({"protocol":1,"op":"create"})).unwrap();
    let response = dispatch(
        json!({"protocol":1,"op":"birthplaceHistory","handle":handle,
        "code":"RSSMRA85C15H501R"}),
    )
    .unwrap();
    assert_eq!(response["scope"], "administrative_birthplace_history");
    assert_eq!(response["candidates"].as_array().unwrap().len(), 100);
    assert_eq!(
        response["decoded"]["candidateDates"]
            .as_array()
            .unwrap()
            .len(),
        100
    );
    assert_eq!(response["candidates"][0]["status"], "unknown");
    assert_eq!(
        response["candidates"][0]["error"]["code"],
        "CAPABILITY_UNAVAILABLE"
    );
    assert_eq!(response["allocationCheck"]["status"], "not_run");
    for value in [Value::Null, json!(1), json!(true), json!([]), json!({})] {
        let error =
            dispatch(json!({"protocol":1,"op":"birthplaceHistory","handle":handle,"code":value}))
                .unwrap_err();
        assert_eq!(error.code, "INVALID_ARGUMENT");
        assert_eq!(error.field.as_deref(), Some("code"));
    }
    for options in [
        json!([]),
        json!(true),
        json!({"onDate":"1985-03-15"}),
        json!({"yearRange":[1985.5,1986]}),
        json!({"yearRange":[1985]}),
        json!({"yearRange":false}),
    ] {
        assert_eq!(
            dispatch(
                json!({"protocol":1,"op":"birthplaceHistory","handle":handle,
            "code":"RSSMRA85C15H501R","options":options})
            )
            .unwrap_err()
            .code,
            "INVALID_ARGUMENT"
        );
    }
    for range in [[0, 1985], [1985, 1984], [1985, 10000]] {
        assert_eq!(
            dispatch(
                json!({"protocol":1,"op":"birthplaceHistory","handle":handle,
            "code":"RSSMRA85C15H501R","options":{"yearRange":range}})
            )
            .unwrap_err()
            .code,
            "INVALID_YEAR_RANGE"
        );
    }
    dispatch(json!({"protocol":1,"op":"dispose","handle":handle})).unwrap();
    assert_eq!(
        dispatch(
            json!({"protocol":1,"op":"birthplaceHistory","handle":handle,
        "code":"RSSMRA85C15H501R"})
        )
        .unwrap_err()
        .code,
        "INVALID_HANDLE"
    );
}
