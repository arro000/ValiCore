//! Generate availability from the same registry used by composition tooling.
use serde_json::{Value, json};
use std::{collections::BTreeSet, env, fs, path::PathBuf};

fn enabled(id: &str) -> bool {
    env::var_os(format!(
        "CARGO_FEATURE_{}",
        id.to_uppercase().replace('-', "_")
    ))
    .is_some()
}
fn main() {
    let path = PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").unwrap())
        .join("../../config/components.json");
    println!("cargo:rerun-if-changed={}", path.display());
    let registry: Value = serde_json::from_slice(&fs::read(path).unwrap()).unwrap();
    assert_eq!(registry["registryVersion"], 1);
    let definitions = registry["components"].as_array().unwrap();
    let mut components = Vec::new();
    let mut operations: Vec<String> = registry["commonOperations"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_str().unwrap().to_owned())
        .collect();
    let mut known = BTreeSet::new();
    let mut owners = Vec::new();
    for component in definitions {
        let id = component["id"].as_str().unwrap();
        assert!(known.insert(id.to_owned()), "Duplicate component");
        if enabled(id) {
            components.push(id);
            for requirement in component["requires"].as_array().unwrap() {
                assert!(
                    enabled(requirement.as_str().unwrap()),
                    "Required component is not compiled"
                );
            }
        }
        for operation in component["operations"].as_array().unwrap() {
            let op = operation.as_str().unwrap();
            owners.push((op, id));
            let requirements = component["operationRequires"]
                .get(op)
                .and_then(Value::as_array);
            if enabled(id)
                && requirements.is_none_or(|r| r.iter().all(|v| enabled(v.as_str().unwrap())))
            {
                operations.push(op.to_owned());
            }
        }
    }
    assert!(
        !components.is_empty(),
        "Select at least one ValiCore component with Cargo features"
    );
    let mut unique = BTreeSet::new();
    assert!(
        owners.iter().all(|(op, _)| unique.insert(*op)),
        "Duplicate operation ownership"
    );
    let mut schemas = json!({});
    for (id, descriptor) in registry["datasets"].as_object().unwrap() {
        if enabled(descriptor["component"].as_str().unwrap()) {
            schemas[id] = descriptor["schemaVersion"].clone();
        }
    }
    operations.sort();
    let source = format!(
        "pub const COMPONENTS: &[&str] = &{:?};\npub const OPERATIONS: &[&str] = &{:?};\npub const OPERATION_OWNERS: &[(&str, &str)] = &{:?};\npub const LOADER_PROTOCOL: u32 = {};\npub const REGISTRY_API_MAJOR: u32 = {};\npub const SCHEMAS_JSON: &str = {:?};\n",
        components,
        operations,
        owners,
        registry["loaderProtocol"],
        registry["runtimeApiMajor"],
        schemas.to_string()
    );
    fs::write(
        PathBuf::from(env::var_os("OUT_DIR").unwrap()).join("components.rs"),
        source,
    )
    .unwrap();
}
