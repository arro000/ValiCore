use serde_json::Value;
use valicore_fiscal_identity::validate_italian_rea;

#[test]
fn independent_regex_corpus_preserves_components_and_never_queries_registration() {
    let corpus: Value = serde_json::from_str(include_str!(
        "../../../../tests/fixtures/italian-rea-vectors.json"
    ))
    .unwrap();
    for row in corpus["valid"].as_array().unwrap() {
        let report = validate_italian_rea(row["input"].as_str().unwrap());
        assert!(report.valid, "{}", row["input"]);
        assert_eq!(report.rea.as_deref(), row["rea"].as_str());
        assert_eq!(
            report.province_code.as_deref(),
            row["provinceCode"].as_str()
        );
        assert_eq!(
            report.serial_number.as_deref(),
            row["serialNumber"].as_str()
        );
        assert_eq!(report.scope, "presentation_format");
        assert_eq!(report.country_code, "IT");
        assert_eq!(report.checks[0].status, "pass");
        assert_eq!(report.checks[1].name, "registry");
        assert_eq!(report.checks[1].status, "not_run");
    }
    for row in corpus["invalid"].as_array().unwrap() {
        let report = validate_italian_rea(row["input"].as_str().unwrap());
        assert!(!report.valid, "{}", row["input"]);
        assert!(report.rea.is_none());
        assert!(report.province_code.is_none());
        assert!(report.serial_number.is_none());
        assert_eq!(report.checks[0].error.as_ref().unwrap().code, row["error"]);
        assert_eq!(report.checks[1].status, "not_run");
    }
}

#[test]
fn every_unicode_scalar_is_checked_without_byte_boundary_panics() {
    for point in 0..=0x10ffff {
        if let Some(character) = char::from_u32(point) {
            assert_eq!(
                validate_italian_rea(&format!("RM-{character}")).valid,
                character.is_ascii_digit()
            );
            assert_eq!(
                validate_italian_rea(&format!("{character}M-1")).valid,
                character.is_ascii_alphabetic()
            );
        }
    }
}
