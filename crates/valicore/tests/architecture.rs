//! Enforce module boundaries for normal, build and development dependencies.

use serde_json::Value;
use std::collections::HashMap;
use std::path::Path;
use std::process::Command;

#[test]
fn workspace_dependencies_follow_the_module_contract() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap();
    let output = Command::new(env!("CARGO"))
        .args(["metadata", "--no-deps", "--format-version", "1", "--locked"])
        .current_dir(root)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let metadata: Value = serde_json::from_slice(&output.stdout).unwrap();
    let packages = metadata["packages"].as_array().unwrap();
    let workspace: HashMap<&str, &Value> = packages
        .iter()
        .map(|p| (p["name"].as_str().unwrap(), p))
        .collect();

    for package in packages {
        let name = package["name"].as_str().unwrap();
        let manifest = Path::new(package["manifest_path"].as_str().unwrap());
        let directory = manifest.parent().unwrap();
        let domain = directory.starts_with(root.join("crates/modules"));
        assert!(
            directory.join("README.md").is_file(),
            "{name} needs a README"
        );
        assert!(directory.join("tests").is_dir(), "{name} needs local tests");
        for dependency in package["dependencies"].as_array().unwrap() {
            let target = dependency["name"].as_str().unwrap();
            if !workspace.contains_key(target) {
                continue;
            }
            let allowed = match name {
                "valicore-foundation" => false,
                "valicore-abi" => target == "valicore",
                "valicore" => {
                    target == "valicore-foundation"
                        || Path::new(workspace[target]["manifest_path"].as_str().unwrap())
                            .starts_with(root.join("crates/modules"))
                }
                _ if domain => target == "valicore-foundation",
                _ => panic!("Unclassified workspace crate: {name}"),
            };
            assert!(
                allowed,
                "Forbidden dependency: {name} -> {target} ({})",
                dependency["kind"]
            );
        }
    }
}
