//! A small JSON ABI shared by WASM and native clients.
//! Ordinary invoke inputs and all outputs remain caller-owned. WASM owned
//! dataset creation consumes its input; free other buffers with valicore_dealloc.
#[cfg(any(feature = "fiscal", feature = "geo"))]
use serde::de::DeserializeOwned;
use serde_json::{Value, json};
use std::{cell::RefCell, collections::HashMap};
use valicore::*;
include!(concat!(env!("OUT_DIR"), "/components.rs"));

thread_local! {
    static ENGINES: RefCell<(u32, HashMap<u32, Engine>)> = RefCell::new((0, HashMap::new()));
}

#[cfg(any(feature = "fiscal", feature = "geo"))]
fn parse<T: DeserializeOwned>(value: Value) -> Result<T> {
    if !value.is_object() {
        return Err(ValiCoreError::new(
            "INVALID_ARGUMENT",
            "Expected a JSON object",
            None,
        ));
    }
    serde_json::from_value(value)
        .map_err(|e| ValiCoreError::new("INVALID_ARGUMENT", &e.to_string(), None))
}
fn string<'a>(value: &'a Value, field: &str) -> Result<&'a str> {
    value.get(field).and_then(Value::as_str).ok_or_else(|| {
        ValiCoreError::new(
            "INVALID_ARGUMENT",
            &format!("{field} must be a string"),
            Some(field),
        )
    })
}
fn serialize<T: serde::Serialize>(value: T) -> Result<Value> {
    serde_json::to_value(value)
        .map_err(|e| ValiCoreError::new("SERIALIZATION_ERROR", &e.to_string(), None))
}
#[cfg(any(feature = "fiscal", feature = "geo"))]
fn options<T: DeserializeOwned + Default>(request: &Value) -> Result<T> {
    match request.get("options") {
        None | Some(Value::Null) => Ok(T::default()),
        Some(v) => parse(v.clone()),
    }
}

fn reject_unknown_fields(request: &Value, allowed: &[&str]) -> Result<()> {
    let fields = request
        .as_object()
        .ok_or_else(|| ValiCoreError::new("INVALID_ARGUMENT", "Expected a JSON object", None))?;
    for field in fields.keys() {
        if !allowed.contains(&field.as_str()) {
            return Err(ValiCoreError::new(
                "INVALID_ARGUMENT",
                "Unexpected field in engine initialization",
                Some(field),
            ));
        }
    }
    Ok(())
}
fn component_unavailable(field: &str) -> ValiCoreError {
    ValiCoreError::new(
        "COMPONENT_UNAVAILABLE",
        "The requested component is excluded from this runtime composition",
        Some(field),
    )
}

fn create_engine(engine: Engine) -> Result<Value> {
    ENGINES.with(|store| {
        let mut store = store.borrow_mut();
        let id = store.0.checked_add(1).ok_or_else(|| {
            ValiCoreError::new("HANDLE_LIMIT", "Engine handle range exhausted", None)
        })?;
        store.0 = id;
        store.1.insert(id, engine);
        Ok(json!(id))
    })
}

pub fn dispatch(mut request: Value) -> Result<Value> {
    if request.get("protocol").and_then(Value::as_u64) != Some(1) {
        return Err(ValiCoreError::new(
            "INCOMPATIBLE_PROTOCOL",
            "Expected JSON protocol version 1",
            None,
        ));
    }
    let op = string(&request, "op")?;
    if !OPERATIONS.contains(&op) {
        return Err(if OPERATION_OWNERS.iter().any(|(name, _)| *name == op) {
            component_unavailable("op")
        } else {
            ValiCoreError::new("UNKNOWN_OPERATION", "Unknown ABI operation", Some("op"))
        });
    }
    match op {
        "info" => {
            assert_eq!(API_MAJOR, REGISTRY_API_MAJOR);
            return Ok(
                json!({ "runtimeName": RUNTIME_NAME, "engineVersion": VERSION, "runtimeApiMajor": API_MAJOR,
                "schemas": serde_json::from_str::<Value>(SCHEMAS_JSON).unwrap(), "loaderProtocol": LOADER_PROTOCOL,
                "modules": MODULES, "components": COMPONENTS, "operations": OPERATIONS }),
            );
        }
        "create" => {
            reject_unknown_fields(&request, &["protocol", "op", "dataset"])?;
            // Consume the large dataset instead of retaining a second Value tree.
            #[cfg(feature = "geo")]
            let engine = match request.get_mut("dataset") {
                None => Engine::without_catalog(),
                Some(value) => Engine::new(parse(Value::take(value))?)?,
            };
            #[cfg(not(feature = "geo"))]
            let engine = {
                if request.get("dataset").is_some() {
                    return Err(component_unavailable("dataset"));
                }
                Engine::without_catalog()
            };
            return create_engine(engine);
        }
        #[cfg(feature = "fiscal")]
        "validateItalianVat" => return serialize(validate_italian_vat(string(&request, "vat")?)),
        #[cfg(feature = "fiscal")]
        "validateItalianRea" => return serialize(validate_italian_rea(string(&request, "rea")?)),
        #[cfg(feature = "fiscal")]
        "checksum" => return serialize(checksum(string(&request, "body")?)?),
        #[cfg(feature = "fiscal")]
        "numericChecksum" => return serialize(numeric_checksum(string(&request, "body")?)?),
        #[cfg(feature = "fiscal")]
        "nameCode" => return serialize(name_code(string(&request, "name")?)?),
        #[cfg(feature = "fiscal")]
        "surnameCode" => return serialize(surname_code(string(&request, "surname")?)?),
        #[cfg(feature = "fiscal")]
        "toBase" => return serialize(to_base(string(&request, "code")?)?),
        #[cfg(feature = "fiscal")]
        "omocodiaMask" => return serialize(omocodia_mask(string(&request, "code")?)?),
        #[cfg(feature = "fiscal")]
        "toOmocode" => {
            let mask = request
                .get("mask")
                .and_then(Value::as_u64)
                .filter(|v| *v <= 127)
                .ok_or_else(|| {
                    ValiCoreError::new(
                        "INVALID_MASK",
                        "Omocodia mask must be an integer in 0..127",
                        Some("mask"),
                    )
                })?;
            return serialize(to_omocode(string(&request, "code")?, mask as u8)?);
        }
        #[cfg(feature = "fiscal")]
        "omocodes" => {
            let include_base = match request.get("includeBase") {
                None => true,
                Some(Value::Bool(value)) => *value,
                Some(_) => {
                    return Err(ValiCoreError::new(
                        "INVALID_ARGUMENT",
                        "includeBase must be a boolean",
                        Some("includeBase"),
                    ));
                }
            };
            return serialize(omocodes(string(&request, "code")?, include_base)?);
        }
        #[cfg(feature = "fiscal")]
        "sameBase" => {
            return serialize(
                to_base(string(&request, "left")?)? == to_base(string(&request, "right")?)?,
            );
        }
        _ => {}
    }
    let handle = request
        .get("handle")
        .and_then(Value::as_u64)
        .and_then(|n| u32::try_from(n).ok())
        .ok_or_else(|| ValiCoreError::new("INVALID_HANDLE", "Expected an engine handle", None))?;
    ENGINES.with(|store| {
        let mut store = store.borrow_mut();
        if op == "dispose" {
            return if store.1.remove(&handle).is_some() { Ok(Value::Null) }
                else { Err(ValiCoreError::new("INVALID_HANDLE", "Engine was disposed or does not exist", None)) };
        }
        let engine = store.1.get(&handle).ok_or_else(|| ValiCoreError::new("INVALID_HANDLE", "Engine was disposed or does not exist", None))?;
        match op {
            #[cfg(feature = "fiscal")]
            "encode" => serialize(engine.encode(&parse::<Person>(request.get("person").cloned().unwrap_or(Value::Null))?)?),
            #[cfg(feature = "fiscal")]
            "validate" => serialize(engine.validate(string(&request, "code")?, &options::<ValidationOptions>(&request)?)?),
            #[cfg(feature = "fiscal")]
            "decode" => serialize(engine.decode(string(&request, "code")?, &options::<DecodeOptions>(&request)?)?),
            #[cfg(all(feature = "fiscal", feature = "geo"))]
            "birthplaceHistory" => serialize(engine.birthplace_history(string(&request, "code")?, &options::<DecodeOptions>(&request)?)?),
            "capabilities" => serialize(engine.capabilities()),
            #[cfg(feature = "fiscal")]
            "matchesPerson" => serialize(engine.matches_person(string(&request, "code")?, &parse::<Person>(request.get("person").cloned().unwrap_or(Value::Null))?)?),
            #[cfg(feature = "geo")]
            "searchPlaces" => serialize(engine.search_places(string(&request, "query")?, &options::<SearchOptions>(&request)?)?),
            #[cfg(feature = "geo")]
            "listProvinces" => serialize(engine.list_provinces(&options::<ProvinceOptions>(&request)?)?),
            #[cfg(feature = "geo")]
            "resolvePlace" => serialize(engine.resolve_place(&parse::<PlaceQuery>(request.get("query").cloned().unwrap_or(Value::Null))?)?),
            #[cfg(feature = "geo")]
            "datasetInfo" => {
                let dataset = engine.require_catalog()?.dataset();
                Ok(json!({ "version": dataset.version, "schemaVersion": dataset.schema_version,
                    "placeCount": dataset.places.len(), "sources": dataset.sources, "coverage": dataset.coverage }))
            },
            _ => Err(ValiCoreError::new("UNKNOWN_OPERATION", "Unknown ABI operation", Some("op"))),
        }
    })
}

/// Allocate a zero-filled buffer. Release with exactly the same pointer/length.
#[unsafe(no_mangle)]
pub extern "C" fn valicore_alloc(length: u32) -> *mut u8 {
    if length == 0 {
        return std::ptr::null_mut();
    }
    Box::into_raw(vec![0u8; length as usize].into_boxed_slice()) as *mut u8
}

/// # Safety
/// Pointer and length must describe a live buffer returned by this ABI.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn valicore_dealloc(pointer: *mut u8, length: u32) {
    if length > 0 && !pointer.is_null() {
        unsafe {
            drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(
                pointer,
                length as usize,
            )));
        }
    }
}

fn response(bytes: &[u8]) -> Vec<u8> {
    let result = serde_json::from_slice(bytes)
        .map_err(|e| ValiCoreError::new("INVALID_JSON", &e.to_string(), None))
        .and_then(dispatch);
    envelope(result)
}

fn envelope(result: Result<Value>) -> Vec<u8> {
    let envelope = match result {
        Ok(value) => json!({ "ok": true, "value": value }),
        Err(error) => json!({ "ok": false, "error": error }),
    };
    serde_json::to_vec(&envelope).unwrap()
}

/// Parse the verified dataset directly into typed Rust data for WASM clients.
/// The JSON dispatcher serves native clients and custom in-memory datasets.
#[cfg(all(target_arch = "wasm32", feature = "geo"))]
fn create_json(bytes: Box<[u8]>, context: &[u8]) -> Result<Value> {
    use serde::de::DeserializeSeed;
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Identity {
        #[serde(default)]
        schema_version: Value,
        #[serde(default)]
        version: Value,
        #[serde(default, deserialize_with = "count_places")]
        places: usize,
    }
    let expected: Value = serde_json::from_slice(context)
        .map_err(|e| ValiCoreError::new("INVALID_JSON", &e.to_string(), None))?;
    reject_unknown_fields(&expected, &["dataVersion"])?;
    // Validate identity before typed place parsing, as the JS loader does.
    // Ignored fields are scanned but never materialized into a JSON Value tree.
    let identity: Identity = serde_json::from_slice(&bytes)
        .map_err(|e| ValiCoreError::new("INVALID_JSON", &e.to_string(), None))?;
    if identity.schema_version.as_u64() != Some(DATA_SCHEMA as u64)
        || identity.version.as_str().is_none()
        || identity.version.as_str() != expected.get("dataVersion").and_then(Value::as_str)
    {
        return Err(ValiCoreError::new(
            "INCOMPATIBLE_DATASET",
            "Dataset version or schema does not match the release manifest",
            None,
        ));
    }
    let mut parser = serde_json::Deserializer::from_slice(&bytes);
    let dataset = DatasetSeed {
        place_count: identity.places,
    }
    .deserialize(&mut parser)
    .map_err(|e| ValiCoreError::new("INVALID_ARGUMENT", &e.to_string(), None))?;
    parser
        .end()
        .map_err(|e| ValiCoreError::new("INVALID_JSON", &e.to_string(), None))?;
    // Return the large ABI input allocation to the allocator before building
    // search indices, so those allocations can reuse it without growing memory.
    drop(bytes);
    let version = dataset.version.clone();
    let sources = dataset.sources.clone();
    let engine = Engine::new(dataset)?;
    let handle = create_engine(engine)?;
    Ok(json!({ "handle": handle, "dataVersion": version, "sources": sources }))
}

#[cfg(all(target_arch = "wasm32", feature = "geo"))]
fn count_places<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> std::result::Result<usize, D::Error> {
    struct Counter;
    impl<'de> serde::de::Visitor<'de> for Counter {
        type Value = usize;
        fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
            f.write_str("an array of place records")
        }
        fn visit_seq<A: serde::de::SeqAccess<'de>>(
            self,
            mut seq: A,
        ) -> std::result::Result<usize, A::Error> {
            let mut count = 0;
            while seq.next_element::<serde::de::IgnoredAny>()?.is_some() {
                count += 1;
            }
            Ok(count)
        }
        // Identity must be checked before rejecting place-field types. Count
        // arrays, but scan other JSON values without giving them a row hint.
        fn visit_map<A: serde::de::MapAccess<'de>>(
            self,
            mut map: A,
        ) -> std::result::Result<usize, A::Error> {
            while map
                .next_entry::<serde::de::IgnoredAny, serde::de::IgnoredAny>()?
                .is_some()
            {}
            Ok(0)
        }
        fn visit_unit<E: serde::de::Error>(self) -> std::result::Result<usize, E> {
            Ok(0)
        }
        fn visit_bool<E: serde::de::Error>(self, _: bool) -> std::result::Result<usize, E> {
            Ok(0)
        }
        fn visit_i64<E: serde::de::Error>(self, _: i64) -> std::result::Result<usize, E> {
            Ok(0)
        }
        fn visit_u64<E: serde::de::Error>(self, _: u64) -> std::result::Result<usize, E> {
            Ok(0)
        }
        fn visit_f64<E: serde::de::Error>(self, _: f64) -> std::result::Result<usize, E> {
            Ok(0)
        }
        fn visit_str<E: serde::de::Error>(self, _: &str) -> std::result::Result<usize, E> {
            Ok(0)
        }
    }
    deserializer.deserialize_any(Counter)
}

/// # Safety
/// Dataset must be a buffer returned by valicore_alloc with this exact length; its
/// ownership transfers to this call on both success and error. Do not free it
/// again. Context must be a separate live ABI buffer and remains caller-owned.
/// Returns an independently allocated packed JSON response, like valicore_invoke.
#[cfg(target_arch = "wasm32")]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn valicore_create_json_owned(
    pointer: *mut u8,
    length: u32,
    context_pointer: *const u8,
    context_length: u32,
) -> u64 {
    let bytes = if length == 0 {
        Box::<[u8]>::default()
    } else {
        unsafe { Box::from_raw(std::ptr::slice_from_raw_parts_mut(pointer, length as usize)) }
    };
    #[cfg(feature = "geo")]
    let context = if context_length == 0 {
        &[]
    } else {
        unsafe { std::slice::from_raw_parts(context_pointer, context_length as usize) }
    };
    #[cfg(feature = "geo")]
    let result = create_json(bytes, context);
    #[cfg(not(feature = "geo"))]
    let result = {
        let _ = (context_pointer, context_length);
        drop(bytes); // Owned input is consumed even when the provider is excluded.
        Err(component_unavailable("dataset"))
    };
    let output = envelope(result).into_boxed_slice();
    let len = output.len() as u32;
    let ptr = Box::into_raw(output) as *mut u8 as u32;
    ((ptr as u64) << 32) | len as u64
}

/// WASM-specific packed result: high 32 bits = pointer, low 32 bits = length.
/// # Safety
/// Input must reference a live input buffer with the specified length.
#[cfg(target_arch = "wasm32")]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn valicore_invoke(pointer: *const u8, length: u32) -> u64 {
    let bytes = if length == 0 {
        &[]
    } else {
        unsafe { std::slice::from_raw_parts(pointer, length as usize) }
    };
    let output = response(bytes).into_boxed_slice();
    let len = output.len() as u32;
    let ptr = Box::into_raw(output) as *mut u8 as u32;
    ((ptr as u64) << 32) | len as u64
}

/// Native C result uses an out-length, avoiding pointer truncation on 64-bit hosts.
/// # Safety
/// Input must be live, and output_length must point to writable u32 storage.
#[cfg(not(target_arch = "wasm32"))]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn valicore_invoke(
    pointer: *const u8,
    length: u32,
    output_length: *mut u32,
) -> *mut u8 {
    if output_length.is_null() {
        return std::ptr::null_mut();
    }
    let output = std::panic::catch_unwind(|| {
        let bytes = if length == 0 {
            &[]
        } else {
            unsafe { std::slice::from_raw_parts(pointer, length as usize) }
        };
        response(bytes)
    })
    .unwrap_or_else(|_| {
        br#"{"ok":false,"error":{"code":"INTERNAL_ERROR","message":"Runtime panic"}}"#.to_vec()
    })
    .into_boxed_slice();
    unsafe {
        *output_length = output.len() as u32;
    }
    Box::into_raw(output) as *mut u8
}
