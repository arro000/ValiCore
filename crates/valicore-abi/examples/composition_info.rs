//! Build-time host probe, not an application/runtime dependency.
use serde_json::json;
use std::{env, fs};
fn main() {
    let request = match env::args().nth(1) {
        Some(path) => serde_json::from_slice(&fs::read(path).expect("Read probe request"))
            .expect("Parse probe request"),
        None => json!({"protocol":1,"op":"info"}),
    };
    match valicore_abi::dispatch(request) {
        Ok(value) => println!("{}", json!({"ok":true,"value":value})),
        Err(error) => {
            println!("{}", json!({"ok":false,"error":error}));
            std::process::exit(1);
        }
    }
}
