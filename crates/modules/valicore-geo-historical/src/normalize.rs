//! Catalog search normalization; distinct from registered-name encoding.

use unicode_normalization::{UnicodeNormalization, char::is_combining_mark};

pub fn search_key(value: &str) -> String {
    if value.is_ascii() {
        return value
            .bytes()
            .filter(u8::is_ascii_alphanumeric)
            .map(|byte| byte.to_ascii_uppercase() as char)
            .collect();
    }
    value
        .replace(['ß', 'ẞ'], "SS")
        .replace(['æ', 'Æ'], "AE")
        .replace(['œ', 'Œ'], "OE")
        .replace(['ø', 'Ø'], "O")
        .replace(['ł', 'Ł'], "L")
        .nfkd()
        .filter(|c| !is_combining_mark(*c) && c.is_alphanumeric())
        .flat_map(char::to_uppercase)
        .collect()
}
