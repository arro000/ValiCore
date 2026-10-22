//! Personal and numeric fiscal-code checksums.

use valicore_foundation::{Result, ValiCoreError};

const ODD: [u32; 26] = [
    1, 0, 5, 7, 9, 13, 15, 17, 19, 21, 2, 4, 18, 20, 11, 3, 6, 8, 12, 14, 16, 10, 22, 25, 24, 23,
];

pub fn checksum(body: &str) -> Result<String> {
    let code = body.to_ascii_uppercase();
    if code.len() != 15 || !code.bytes().all(|c| c.is_ascii_alphanumeric()) {
        return Err(ValiCoreError::new(
            "INVALID_BODY",
            "Checksum requires 15 ASCII letters or digits",
            Some("code"),
        ));
    }
    let sum: u32 = code
        .bytes()
        .enumerate()
        .map(|(i, c)| {
            let index = if c.is_ascii_digit() {
                (c - b'0') as usize
            } else {
                (c - b'A') as usize
            };
            if i % 2 == 0 { ODD[index] } else { index as u32 }
        })
        .sum();
    Ok(char::from(b'A' + (sum % 26) as u8).to_string())
}

pub fn numeric_checksum(body: &str) -> Result<String> {
    if body.len() != 10 || !body.bytes().all(|b| b.is_ascii_digit()) {
        return Err(ValiCoreError::new(
            "INVALID_NUMERIC_BODY",
            "Numeric checksum requires 10 digits",
            Some("code"),
        ));
    }
    let sum: u32 = body
        .bytes()
        .enumerate()
        .map(|(i, b)| {
            let n = (b - b'0') as u32;
            if i % 2 == 0 {
                n
            } else {
                let n = n * 2;
                n / 10 + n % 10
            }
        })
        .sum();
    Ok(((10 - sum % 10) % 10).to_string())
}
