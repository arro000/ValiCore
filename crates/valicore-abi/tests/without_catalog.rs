use serde_json::{Value, json};
use valicore_abi::dispatch;

#[test]
fn native_json_can_create_dispose_and_query_an_algorithm_only_engine() {
    let handle = dispatch(json!({"protocol":1,"op":"create"})).unwrap();
    let call = |op: &str, args: Value| {
        let mut request = args;
        request["protocol"] = json!(1);
        request["op"] = json!(op);
        request["handle"] = handle.clone();
        dispatch(request)
    };
    assert_eq!(
        call("capabilities", json!({})).unwrap(),
        json!({"fiscalIdentity":true,"geoHistorical":false})
    );
    let person = json!({"name":"Mario","surname":"Rossi","sex":"M","birthDate":"1985-03-15","birthplace":{"belfioreCode":"H501"}});
    assert_eq!(
        call("encode", json!({"person":person})).unwrap(),
        "RSSMRA85C15H501R"
    );
    let decoded = call(
        "decode",
        json!({"code":"RSSMRA85C15H501R","options":{"yearRange":[1985,1985]}}),
    )
    .unwrap();
    assert_eq!(decoded["candidateDates"], json!(["1985-03-15"]));
    assert_eq!(decoded["places"], json!([]));
    assert_eq!(decoded["dataVersion"], Value::Null);
    for op in [
        "datasetInfo",
        "searchPlaces",
        "listProvinces",
        "resolvePlace",
    ] {
        assert_eq!(
            call(op, json!({"query":{"belfioreCode":"H501"}}))
                .unwrap_err()
                .code,
            if op == "searchPlaces" {
                "INVALID_ARGUMENT"
            } else {
                "CAPABILITY_UNAVAILABLE"
            }
        );
    }
    assert_eq!(
        call("searchPlaces", json!({"query":"Roma"}))
            .unwrap_err()
            .code,
        "CAPABILITY_UNAVAILABLE"
    );
    assert_eq!(
        call("validate", json!({"code":"RSSMRA85C15H501R"})).unwrap()["checks"][3]["error"]["code"],
        "CAPABILITY_UNAVAILABLE"
    );
    call("dispose", json!({})).unwrap();
    assert_eq!(
        call("capabilities", json!({})).unwrap_err().code,
        "INVALID_HANDLE"
    );
    // Explicit null/malformed dataset inputs must not be silently treated as absent.
    for dataset in [Value::Null, json!(false), json!(42), json!([])] {
        assert_eq!(
            dispatch(json!({"protocol":1,"op":"create","dataset":dataset}))
                .unwrap_err()
                .code,
            "INVALID_ARGUMENT"
        );
    }
}
