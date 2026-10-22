use serde_json::Value;
use valicore_fiscal_identity::validate_italian_vat;

fn corpus() -> Value {
    serde_json::from_str(include_str!(
        "../../../../tests/fixtures/italian-vat-vectors.json"
    ))
    .unwrap()
}

#[test]
fn independent_decimal_oracle_and_single_digit_mutations() {
    let corpus = corpus();
    for row in corpus["valid"].as_array().unwrap() {
        let input = row["input"].as_str().unwrap();
        for prefix in ["", "IT", "it", "iT", "It"] {
            let report = validate_italian_vat(&format!("{prefix}{input}"));
            assert!(report.valid, "{prefix}{input}");
            assert_eq!(report.vat.as_deref(), row["vat"].as_str());
            assert_eq!(report.country_code, "IT");
            assert_eq!(report.scope, "format_checksum");
            assert!(report.rule_edition.contains("1976-12-23"));
            assert_eq!(
                report
                    .checks
                    .iter()
                    .map(|c| c.status.as_str())
                    .collect::<Vec<_>>(),
                ["pass", "pass", "not_run"]
            );
        }
    }
    for row in corpus["invalid"].as_array().unwrap() {
        let input = row["input"].as_str().unwrap();
        let report = validate_italian_vat(input);
        assert!(!report.valid, "{input}");
        let failed = report.checks.iter().find(|c| c.status == "fail").unwrap();
        assert_eq!(
            failed.error.as_ref().unwrap().code,
            row["error"].as_str().unwrap()
        );
        assert_eq!(failed.error.as_ref().unwrap().field.as_deref(), Some("vat"));
        if failed.name == "structure" {
            assert!(report.vat.is_none());
            assert_eq!(report.checks[1].status, "not_run");
        } else {
            assert_eq!(report.vat.as_deref(), Some(input));
        }
        assert_eq!(report.checks[2].name, "registry");
        assert_eq!(report.checks[2].status, "not_run");
    }
}

#[test]
fn formal_pass_does_not_claim_attribution_or_enforce_an_unsourced_office_list() {
    for code in ["00000000000", "06363391001"] {
        let report = validate_italian_vat(code);
        assert!(report.valid);
        assert_eq!(report.checks[2].status, "not_run");
    }
    // These are artificial format/checksum vectors, not known allocated IDs.
    let corpus = corpus();
    for office in ["000", "120", "121", "888", "999"] {
        let rows: Vec<_> = corpus["valid"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|row| &row["vat"].as_str().unwrap()[7..10] == office)
            .collect();
        assert!(!rows.is_empty());
        assert!(
            rows.iter()
                .all(|row| validate_italian_vat(row["input"].as_str().unwrap()).valid)
        );
    }
}

#[test]
fn unicode_byte_boundaries_never_panic_or_normalize_lookalike_digits() {
    for codepoint in 0..=0x10ffff {
        if let Some(character) = char::from_u32(codepoint)
            && !character.is_ascii_digit()
        {
            let input = format!("0636339100{character}");
            assert!(!validate_italian_vat(&input).valid);
        }
    }
}
