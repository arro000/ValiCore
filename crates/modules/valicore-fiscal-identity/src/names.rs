//! Registered Latin name normalization and three-letter encoding.

use unicode_normalization::{UnicodeNormalization, char::is_combining_mark};
use valicore_foundation::{Result, ValiCoreError};

pub fn normalize_name(input: &str) -> Result<String> {
    let mut letters = String::new();
    for c in input.nfkd() {
        if is_combining_mark(c) {
            continue;
        }
        let mapped = match c {
            'ß' | 'ẞ' => Some("SS"),
            'Æ' | 'æ' => Some("AE"),
            'Œ' | 'œ' => Some("OE"),
            'Ø' | 'ø' => Some("O"),
            'Ł' | 'ł' => Some("L"),
            'Đ' | 'đ' | 'Ð' | 'ð' => Some("D"),
            'Þ' | 'þ' => Some("TH"),
            'ı' => Some("I"),
            _ => None,
        };
        if let Some(value) = mapped {
            letters.push_str(value);
        } else if c.is_ascii_alphabetic() {
            letters.push(c.to_ascii_uppercase());
        } else if c.is_whitespace() || matches!(c, '\'' | '’' | '-' | '.' | ',') {
            continue;
        } else {
            return Err(ValiCoreError::new(
                "UNSUPPORTED_NAME_CHARACTER",
                "Use the registered Latin spelling for unsupported characters",
                Some("name"),
            ));
        }
    }
    if letters.is_empty() || letters.len() > 512 {
        return Err(ValiCoreError::new(
            "INVALID_NAME",
            "A name must contain between 1 and 512 Latin letters",
            Some("name"),
        ));
    }
    Ok(letters)
}

fn letters_code(input: &str, given_name: bool) -> Result<String> {
    let letters = normalize_name(input)?;
    let consonants: Vec<char> = letters.chars().filter(|c| !"AEIOU".contains(*c)).collect();
    if given_name && consonants.len() >= 4 {
        return Ok([consonants[0], consonants[2], consonants[3]]
            .iter()
            .collect());
    }
    Ok(consonants
        .into_iter()
        .chain(letters.chars().filter(|c| "AEIOU".contains(*c)))
        .chain("XXX".chars())
        .take(3)
        .collect())
}
pub fn name_code(input: &str) -> Result<String> {
    letters_code(input, true)
}
pub fn surname_code(input: &str) -> Result<String> {
    letters_code(input, false).map_err(|mut e| {
        e.field = Some("surname".into());
        e
    })
}
