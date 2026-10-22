//! Italian province/CCIAA-coded REA presentation; not registration or allocation.

use serde::{Deserialize, Serialize};
use valicore_foundation::ValiCoreError;

const EDITION: &str = "Registro Imprese CF/PIVA/REA description; FatturaPA 1.4 province syntax; presentation policy 1";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItalianReaCheck {
    pub name: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ValiCoreError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItalianReaReport {
    pub rea: Option<String>,
    pub province_code: Option<String>,
    /// Decimal presentation, not an integer conversion. Leading zeros survive.
    pub serial_number: Option<String>,
    pub country_code: String,
    /// Only the declared presentation grammar was checked.
    pub valid: bool,
    pub scope: String,
    pub rule_edition: String,
    pub checks: Vec<ItalianReaCheck>,
}

/// Two ASCII letters, a hyphen and one or more ASCII decimal digits.
/// Lowercase ASCII province letters normalize to uppercase. No whitespace,
/// Unicode lookalikes or separators are removed. There is no inferred province
/// allowlist, numeric size limit, check digit, registration or allocation check.
/// The FatturaPA 20-character field limit is an invoice transport constraint,
/// not imposed as an intrinsic REA serial-length rule here.
pub fn validate_italian_rea(input: &str) -> ItalianReaReport {
    let bytes = input.as_bytes();
    let valid = bytes.len() >= 4
        && bytes[..2].iter().all(u8::is_ascii_alphabetic)
        && bytes[2] == b'-'
        && bytes[3..].iter().all(u8::is_ascii_digit);
    ItalianReaReport {
        rea: valid.then(|| input.to_ascii_uppercase()),
        province_code: valid.then(|| input[..2].to_ascii_uppercase()),
        serial_number: valid.then(|| input[3..].into()),
        country_code: "IT".into(),
        valid,
        scope: "presentation_format".into(),
        rule_edition: EDITION.into(),
        checks: vec![
            ItalianReaCheck {
                name: "structure".into(),
                status: if valid { "pass" } else { "fail" }.into(),
                error: (!valid).then(|| {
                    ValiCoreError::new(
                        "INVALID_ITALIAN_REA_STRUCTURE",
                        "Italian REA presentation requires two ASCII province letters, a hyphen and ASCII decimal digits",
                        Some("rea"),
                    )
                }),
            },
            ItalianReaCheck {
                name: "registry".into(),
                status: "not_run".into(),
                error: None,
            },
        ],
    }
}
