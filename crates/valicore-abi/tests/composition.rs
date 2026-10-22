//! Availability must be proved by invoking operations, not crate names alone.
use serde_json::{Value, json};
use valicore_abi::{COMPONENTS, OPERATIONS, dispatch};

fn call(op: &str, args: Value) -> valicore::Result<Value> {
    let mut request = args;
    request["protocol"] = json!(1);
    request["op"] = json!(op);
    dispatch(request)
}
fn arguments(op: &str, handle: Value) -> Value {
    let person = json!({"name":"Mario","surname":"Rossi","sex":"M","birthDate":"1985-03-15","birthplace":{"belfioreCode":"H501"}});
    match op {
        "checksum" => json!({"body":"RSSMRA85C15H501"}),
        "numericChecksum" => json!({"body":"0636339100"}),
        "nameCode" => json!({"name":"Mario"}),
        "surnameCode" => json!({"surname":"Rossi"}),
        "toBase" | "omocodiaMask" | "omocodes" => json!({"code":"RSSMRA85C15H501R"}),
        "toOmocode" => json!({"code":"RSSMRA85C15H501R","mask":127}),
        "sameBase" => json!({"left":"RSSMRA85C15H501R","right":"RSSMRA85C15H501R"}),
        "encode" => json!({"handle":handle,"person":person}),
        "matchesPerson" => json!({"handle":handle,"person":person,"code":"RSSMRA85C15H501R"}),
        "validate" | "decode" | "birthplaceHistory" => {
            json!({"handle":handle,"code":"RSSMRA85C15H501R","options":{"yearRange":[1900,2099]}})
        }
        "validateItalianVat" => json!({"vat":"IT06363391001"}),
        "validateItalianRea" => json!({"rea":"RM-000123"}),
        "searchPlaces" => json!({"handle":handle,"query":"Roma"}),
        "resolvePlace" => json!({"handle":handle,"query":{"belfioreCode":"H501"}}),
        _ => json!({"handle":handle}),
    }
}
#[test]
fn every_known_operation_has_truthful_availability_and_required_data_errors() {
    let registry: Value =
        serde_json::from_str(include_str!("../../../config/components.json")).unwrap();
    let info = call("info", json!({})).unwrap();
    assert_eq!(info["components"], json!(COMPONENTS));
    assert_eq!(info["operations"], json!(OPERATIONS));
    assert_eq!(info["runtimeApiMajor"], 8);
    assert_eq!(info["loaderProtocol"], 2);
    #[cfg(feature = "geo")]
    assert_eq!(info["schemas"]["geo"], valicore::DATA_SCHEMA);
    let handle = call("create", json!({})).unwrap();
    for component in registry["components"].as_array().unwrap() {
        let id = component["id"].as_str().unwrap();
        for name in component["operations"].as_array().unwrap() {
            let op = name.as_str().unwrap();
            let requirements = component["operationRequires"]
                .get(op)
                .and_then(Value::as_array);
            let available = COMPONENTS.contains(&id)
                && requirements
                    .is_none_or(|r| r.iter().all(|v| COMPONENTS.contains(&v.as_str().unwrap())));
            assert_eq!(OPERATIONS.contains(&op), available, "{op} metadata");
            let result = call(op, arguments(op, handle.clone()));
            if !available {
                assert_eq!(result.unwrap_err().code, "COMPONENT_UNAVAILABLE", "{op}");
            } else if let Err(error) = result {
                assert_eq!(
                    error.code, "CAPABILITY_UNAVAILABLE",
                    "Compiled operation {op} is missing its data, not its code"
                );
            }
        }
    }
    for (resource, descriptor) in registry["datasets"].as_object().unwrap() {
        let component = descriptor["component"].as_str().unwrap();
        assert_eq!(
            info["schemas"].get(resource).is_some(),
            COMPONENTS.contains(&component)
        );
        let field = descriptor["requestField"].as_str().unwrap();
        if !COMPONENTS.contains(&component) {
            for payload in [Value::Null, json!([]), json!({}), json!(1)] {
                let mut request = json!({});
                request[field] = payload;
                let error = call("create", request).unwrap_err();
                assert_eq!(error.code, "COMPONENT_UNAVAILABLE");
                assert_eq!(error.field.as_deref(), Some(field));
            }
        }
    }
    call("dispose", json!({"handle":handle})).unwrap();
}

#[cfg(feature = "fiscal")]
#[test]
fn fiscal_semantics_and_map_only_birthplace_survive_geography_exclusion() {
    let handle = call("create", json!({})).unwrap();
    assert_eq!(
        call("encode", arguments("encode", handle.clone())).unwrap(),
        "RSSMRA85C15H501R"
    );
    let validation = call("validate", arguments("validate", handle.clone())).unwrap();
    assert!(validation["valid"].is_null());
    assert_eq!(validation["checks"][3]["status"], "unknown");
    assert_eq!(
        validation["checks"][3]["error"]["code"],
        if cfg!(feature = "geo") {
            "CAPABILITY_UNAVAILABLE"
        } else {
            "COMPONENT_UNAVAILABLE"
        }
    );
    let decoded = call("decode", arguments("decode", handle.clone())).unwrap();
    assert_eq!(
        decoded["candidateDates"],
        json!(["1985-03-15", "2085-03-15"])
    );
    assert_eq!(decoded["places"], json!([]));
    assert!(decoded["dataVersion"].is_null());
    let mut request = arguments("encode", handle.clone());
    request["person"]["birthplace"] = json!([null, null, "H501", null, null]);
    assert_eq!(
        call("encode", request).unwrap_err().code,
        "INVALID_ARGUMENT"
    );
    for query in [
        json!({"name":"Roma"}),
        json!({"istatCode":"058091"}),
        json!({"belfioreCode":"H501","province":"RM"}),
        json!({"belfioreCode":"H501","onDate":"1985-03-15"}),
    ] {
        let mut request = arguments("encode", handle.clone());
        request["person"]["birthplace"] = query;
        assert_eq!(
            call("encode", request).unwrap_err().code,
            if cfg!(feature = "geo") {
                "CAPABILITY_UNAVAILABLE"
            } else {
                "COMPONENT_UNAVAILABLE"
            }
        );
    }
    call("dispose", json!({"handle":handle})).unwrap();
}
