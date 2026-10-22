//! Shared foundation for every domain module.
//!
//! Structured errors and strict Gregorian calendar arithmetic.
//! No domain schemas, transport versions, network, clock, timezone or DOM.

mod date;

use serde::{Deserialize, Serialize};

pub use date::CivilDate;

/// Structured error shared by every module and surfaced over the ABI.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ValiCoreError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub field: Option<String>,
}

impl ValiCoreError {
    pub fn new(code: &str, message: &str, field: Option<&str>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            field: field.map(str::to_owned),
        }
    }
}

impl std::fmt::Display for ValiCoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for ValiCoreError {}

pub type Result<T> = std::result::Result<T, ValiCoreError>;
