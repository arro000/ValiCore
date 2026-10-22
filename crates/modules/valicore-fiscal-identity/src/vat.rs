//! Italian VAT-number format/checksum only; no tax-registry allocation checks.

use serde::{Deserialize, Serialize};
use valicore_foundation::ValiCoreError;

use crate::numeric_checksum;

const EDITION: &str =
    "DM 1976-12-23 articles 8-9 (effective 1977-01-13); EC TIN study June 2026 vol.2 p.10";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItalianVatCheck {
    pub name: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ValiCoreError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItalianVatReport {
    /// Eleven ASCII digits, with the optional IT presentation prefix removed.
    /// None when structure fails. Leading zeros are retained.
    pub vat: Option<String>,
    pub country_code: String,
    /// True means only the implemented format and checksum checks passed.
    pub valid: bool,
    pub scope: String,
    pub rule_edition: String,
    pub checks: Vec<ItalianVatCheck>,
}

fn check(name: &str, status: &str, code: Option<&str>, message: &str) -> ItalianVatCheck {
    ItalianVatCheck {
        name: name.into(),
        status: status.into(),
        error: code.map(|code| ValiCoreError::new(code, message, Some("vat"))),
    }
}

/// Accept eleven ASCII digits or those digits with an ASCII IT/it prefix.
/// Whitespace, punctuation, Unicode lookalikes and non-Italian prefixes fail.
/// This does not inspect serial allocation or maintain an office-code registry;
/// even a checksum-correct placeholder has no implied registry attribution.
pub fn validate_italian_vat(input: &str) -> ItalianVatReport {
    let digits = if input
        .get(..2)
        .is_some_and(|prefix| prefix.eq_ignore_ascii_case("IT"))
    {
        &input[2..]
    } else {
        input
    };
    let mut report = ItalianVatReport {
        vat: None,
        country_code: "IT".into(),
        valid: false,
        scope: "format_checksum".into(),
        rule_edition: EDITION.into(),
        checks: Vec::with_capacity(3),
    };
    if digits.len() != 11 || !digits.bytes().all(|b| b.is_ascii_digit()) {
        report.checks.push(check(
            "structure",
            "fail",
            Some("INVALID_ITALIAN_VAT_STRUCTURE"),
            "Italian VAT requires eleven ASCII digits, optionally prefixed by IT, without separators",
        ));
        report.checks.push(check("checksum", "not_run", None, ""));
    } else {
        report.vat = Some(digits.into());
        report.checks.push(check("structure", "pass", None, ""));
        // Structure above guarantees a ten-digit body: reuse the fiscal numeric
        // check-digit implementation, never a second VAT checksum algorithm.
        let expected = numeric_checksum(&digits[..10]).expect("validated ten-digit numeric body");
        report.valid = digits[10..] == expected;
        report.checks.push(if report.valid {
            check("checksum", "pass", None, "")
        } else {
            check(
                "checksum",
                "fail",
                Some("INVALID_ITALIAN_VAT_CHECKSUM"),
                "Italian VAT check digit does not match the numeric mod-10 checksum",
            )
        });
    }
    report.checks.push(check("registry", "not_run", None, ""));
    report
}
