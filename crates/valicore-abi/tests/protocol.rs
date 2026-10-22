use serde_json::{Value, json};
use valicore_abi::{dispatch, valicore_alloc, valicore_dealloc, valicore_invoke};

fn dataset(version: &str) -> Value {
    json!({"schemaVersion":1,"version":version,"sources":{},"coverage":{},"places":[]})
}

fn create(version: &str) -> u64 {
    dispatch(json!({"protocol":1,"op":"create","dataset":dataset(version)}))
        .unwrap()
        .as_u64()
        .unwrap()
}

#[test]
fn runtime_reports_valicore_product_identity() {
    assert_eq!(
        dispatch(json!({"protocol":1,"op":"info"})).unwrap(),
        json!({"runtimeName":"ValiCore","engineVersion":valicore::VERSION,
            "runtimeApiMajor":8,"schemas":{"geo":1},"loaderProtocol":2,
            "modules":["fiscal_identity","geo_historical"],
            "components":["fiscal","geo"],
            "operations":["birthplaceHistory","capabilities","checksum","create","datasetInfo","decode","dispose","encode","info","listProvinces","matchesPerson","nameCode","numericChecksum","omocodes","omocodiaMask","resolvePlace","sameBase","searchPlaces","surnameCode","toBase","toOmocode","validate","validateItalianRea","validateItalianVat"]})
    );
}

#[test]
fn protocol_operation_handle_and_option_type_matrices() {
    for protocol in [
        Value::Null,
        json!(0),
        json!(2),
        json!(-1),
        json!(1.5),
        json!("1"),
        json!(true),
    ] {
        assert_eq!(
            dispatch(json!({"protocol":protocol,"op":"info"}))
                .unwrap_err()
                .code,
            "INCOMPATIBLE_PROTOCOL"
        );
    }
    for op in [Value::Null, json!(1), json!({}), json!([])] {
        assert_eq!(
            dispatch(json!({"protocol":1,"op":op})).unwrap_err().code,
            "INVALID_ARGUMENT"
        );
    }
    for handle in [
        Value::Null,
        json!(0),
        json!(-1),
        json!(1.5),
        json!(4294967296u64),
        json!("1"),
        json!(true),
    ] {
        assert_eq!(
            dispatch(json!({"protocol":1,"op":"datasetInfo","handle":handle}))
                .unwrap_err()
                .code,
            "INVALID_HANDLE"
        );
    }
    let handle = create("protocol");
    assert_eq!(
        dispatch(json!({"protocol":1,"op":"doesNotExist","handle":handle}))
            .unwrap_err()
            .code,
        "UNKNOWN_OPERATION"
    );
    for (op, field) in [("encode", "person"), ("resolvePlace", "query")] {
        for value in [Value::Null, json!(1), json!([]), json!({"unexpected":true})] {
            assert_eq!(
                dispatch(json!({"protocol":1,"op":op,"handle":handle,field:value}))
                    .unwrap_err()
                    .code,
                "INVALID_ARGUMENT"
            );
        }
    }
    for op in ["validate", "decode", "searchPlaces", "listProvinces"] {
        for options in [
            json!([]),
            json!(42),
            json!(false),
            json!({"unexpected":true}),
        ] {
            assert_eq!(dispatch(json!({"protocol":1,"op":op,"handle":handle,"options":options,"code":"RSSMRA85C15H501R","query":"Roma"})).unwrap_err().code,"INVALID_ARGUMENT");
        }
    }
    for mask in [
        Value::Null,
        json!(-1),
        json!(128),
        json!(1.5),
        json!("1"),
        json!(true),
    ] {
        assert_eq!(
            dispatch(json!({"protocol":1,"op":"toOmocode","code":"RSSMRA85C15H501R","mask":mask}))
                .unwrap_err()
                .code,
            "INVALID_MASK"
        );
    }
    dispatch(json!({"protocol":1,"op":"dispose","handle":handle})).unwrap();
    assert_eq!(
        dispatch(json!({"protocol":1,"op":"dispose","handle":handle}))
            .unwrap_err()
            .code,
        "INVALID_HANDLE"
    );
}

#[test]
fn malformed_datasets_and_people_have_structured_failures() {
    for value in [
        Value::Null,
        json!({}),
        json!([]),
        json!({"schemaVersion":"1"}),
    ] {
        assert_eq!(
            dispatch(json!({"protocol":1,"op":"create","dataset":value}))
                .unwrap_err()
                .code,
            "INVALID_ARGUMENT"
        );
    }
    let handle = create("people");
    let person = json!({"name":"Mario","surname":"Rossi","sex":"M","birthDate":"1985-03-15","birthplace":{"belfioreCode":"H501"}});
    for field in ["name", "surname", "sex", "birthDate", "birthplace"] {
        for value in [Value::Null, json!(123), json!([])] {
            let mut invalid = person.clone();
            invalid[field] = value;
            assert_eq!(
                dispatch(json!({"protocol":1,"op":"encode","handle":handle,"person":invalid}))
                    .unwrap_err()
                    .code,
                "INVALID_ARGUMENT"
            );
        }
        let mut invalid = person.clone();
        invalid.as_object_mut().unwrap().remove(field);
        assert_eq!(
            dispatch(json!({"protocol":1,"op":"encode","handle":handle,"person":invalid}))
                .unwrap_err()
                .code,
            "INVALID_ARGUMENT"
        );
    }
    dispatch(json!({"protocol":1,"op":"dispose","handle":handle})).unwrap();
}

#[test]
fn thread_affine_engines_are_isolated_and_handles_are_not_reused_after_disposal() {
    let handles: Vec<_> = (0..32).map(|i| create(&format!("engine-{i}"))).collect();
    for (i, handle) in handles.iter().enumerate() {
        assert_eq!(
            dispatch(json!({"protocol":1,"op":"datasetInfo","handle":handle})).unwrap()["version"],
            format!("engine-{i}")
        );
        dispatch(json!({"protocol":1,"op":"dispose","handle":handle})).unwrap();
    }
    let next = create("next");
    assert!(next > *handles.last().unwrap());
    for handle in handles {
        assert_eq!(
            dispatch(json!({"protocol":1,"op":"datasetInfo","handle":handle}))
                .unwrap_err()
                .code,
            "INVALID_HANDLE"
        );
    }
    let threads: Vec<_> =
        (0..8)
            .map(|i| {
                std::thread::spawn(move || {
                    let version = format!("thread-{i}");
                    let handle = create(&version);
                    assert_eq!(
                        dispatch(json!({"protocol":1,"op":"datasetInfo","handle":handle})).unwrap()
                            ["version"],
                        version
                    );
                    dispatch(json!({"protocol":1,"op":"dispose","handle":handle})).unwrap();
                })
            })
            .collect();
    for thread in threads {
        thread.join().unwrap();
    }
    dispatch(json!({"protocol":1,"op":"dispose","handle":next})).unwrap();
}

#[cfg(not(target_arch = "wasm32"))]
fn native_envelope(bytes: &[u8]) -> Value {
    // Only live ABI buffers and documented zero-length inputs are used.
    // Invalid pointers would be C undefined behaviour, not input-validation tests.
    unsafe {
        let input = valicore_alloc(bytes.len() as u32);
        if !bytes.is_empty() {
            std::ptr::copy_nonoverlapping(bytes.as_ptr(), input, bytes.len());
        }
        let mut length = 0;
        let output = valicore_invoke(input, bytes.len() as u32, &mut length);
        assert!(!output.is_null());
        assert!(length > 0);
        let envelope =
            serde_json::from_slice(std::slice::from_raw_parts(output, length as usize)).unwrap();
        valicore_dealloc(output, length);
        valicore_dealloc(input, bytes.len() as u32);
        envelope
    }
}

#[test]
#[cfg(not(target_arch = "wasm32"))]
fn native_buffer_contract_and_invalid_json_do_not_panic_or_leak_handles() {
    assert!(valicore_alloc(0).is_null());
    unsafe {
        valicore_dealloc(std::ptr::null_mut(), 0);
    }
    for bytes in [
        &b""[..],
        b"{",
        b"[",
        b"not JSON",
        b"\xff\xfe",
        b"{\"protocol\":1,}",
    ] {
        let response = native_envelope(bytes);
        assert_eq!(response["ok"], false);
        assert_eq!(response["error"]["code"], "INVALID_JSON");
    }
    for request in [b"null".as_slice(), b"[]", b"42", b"{}"] {
        assert_eq!(
            native_envelope(request)["error"]["code"],
            "INCOMPATIBLE_PROTOCOL"
        );
    }
    for _ in 0..1000 {
        let response =
            native_envelope(br#"{"protocol":1,"op":"checksum","body":"RSSMRA85C15H501"}"#);
        assert_eq!(response["value"], "R");
    }
    unsafe {
        assert!(valicore_invoke(std::ptr::null(), 0, std::ptr::null_mut()).is_null());
    }
}
