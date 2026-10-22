//! Fiscal module is testable without the catalog or the ABI.

use valicore_fiscal_identity::*;

const CODE: &str = "RSSMRA85C15H501R";

#[test]
fn generates_a_known_person() {
    let code = encode_with_belfiore("Mario", "Rossi", "M", "1985-03-15", "H501", 0).unwrap();
    assert_eq!(code, CODE);
}

#[test]
fn every_omocodia_mask_round_trips() {
    assert_eq!(to_base(CODE).unwrap(), CODE);
    for mask in 0..=127u8 {
        let omocode = to_omocode(CODE, mask).unwrap();
        assert_eq!(omocodia_mask(&omocode).unwrap(), mask);
        assert_eq!(to_base(&omocode).unwrap(), CODE);
    }
    assert_eq!(omocodes(CODE, true).unwrap().len(), 128);
    assert_eq!(omocodes(CODE, false).unwrap().len(), 127);
}

#[test]
fn decode_exposes_candidate_dates() {
    let decoded = decode(
        CODE,
        &DecodeOptions {
            year_range: Some([1900, 2099]),
        },
    )
    .unwrap();
    assert_eq!(decoded.sex, "M");
    assert_eq!(decoded.month, 3);
    assert_eq!(decoded.day, 15);
    assert_eq!(decoded.belfiore_code, "H501");
    assert!(decoded.candidate_dates.iter().any(|d| d == "1985-03-15"));
}

#[test]
fn rejects_bad_checksum_and_unsupported_names() {
    assert_eq!(
        checked_code("RSSMRA85C15H501X").unwrap_err().code,
        "INVALID_CHECKSUM"
    );
    assert_eq!(
        normalize_name("\u{4e2d}").unwrap_err().code,
        "UNSUPPORTED_NAME_CHARACTER"
    );
}
