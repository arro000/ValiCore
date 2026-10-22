//! Personal fiscal-code structure, generation, inversion and omocodia.

use crate::{checksum, name_code, surname_code};
use serde::{Deserialize, Serialize};
use valicore_foundation::{CivilDate, Result, ValiCoreError};

pub const MONTHS: &[u8; 12] = b"ABCDEHLMPRST";
pub const OMOCODIA: &[u8; 10] = b"LMNPQRSTUV";
/// API bit order, from the rightmost replaceable digit to the leftmost.
pub const OMOCODIA_POSITIONS: [usize; 7] = [14, 13, 12, 10, 9, 7, 6];
pub fn structural_code(input: &str) -> Result<String> {
    let code = input.trim().to_ascii_uppercase();
    let b = code.as_bytes();
    if b.len() != 16 || !b.iter().all(u8::is_ascii_alphanumeric) {
        return Err(ValiCoreError::new(
            "INVALID_FORMAT",
            "Expected a 16-character ASCII fiscal code",
            Some("code"),
        ));
    }
    if !b[..6].iter().all(u8::is_ascii_uppercase)
        || !MONTHS.contains(&b[8])
        || !b[11].is_ascii_uppercase()
        || !b[15].is_ascii_uppercase()
        || OMOCODIA_POSITIONS
            .iter()
            .any(|&i| !b[i].is_ascii_digit() && !OMOCODIA.contains(&b[i]))
    {
        return Err(ValiCoreError::new(
            "INVALID_FORMAT",
            "Fiscal code characters are not valid in their positions",
            Some("code"),
        ));
    }
    Ok(code)
}

pub fn checked_code(input: &str) -> Result<String> {
    let code = structural_code(input)?;
    if checksum(&code[..15])? != code[15..] {
        return Err(ValiCoreError::new(
            "INVALID_CHECKSUM",
            "The check character does not match",
            Some("code"),
        ));
    }
    Ok(code)
}

pub fn omocodia_mask(input: &str) -> Result<u8> {
    let code = checked_code(input)?;
    Ok(OMOCODIA_POSITIONS
        .iter()
        .enumerate()
        .fold(0, |mask, (bit, &pos)| {
            if code.as_bytes()[pos].is_ascii_uppercase() {
                mask | (1 << bit)
            } else {
                mask
            }
        }))
}

pub fn to_base(input: &str) -> Result<String> {
    let code = checked_code(input)?;
    let mut bytes = code.as_bytes()[..15].to_vec();
    for pos in OMOCODIA_POSITIONS {
        if let Some(digit) = OMOCODIA.iter().position(|c| *c == bytes[pos]) {
            bytes[pos] = b'0' + digit as u8;
        }
    }
    let mut base = String::from_utf8(bytes).unwrap();
    base.push_str(&checksum(&base)?);
    Ok(base)
}

pub fn to_omocode(input: &str, mask: u8) -> Result<String> {
    if mask > 127 {
        return Err(ValiCoreError::new(
            "INVALID_MASK",
            "Omocodia mask must be in 0..127",
            Some("mask"),
        ));
    }
    let base = to_base(input)?;
    let mut bytes = base.as_bytes()[..15].to_vec();
    for (bit, pos) in OMOCODIA_POSITIONS.iter().enumerate() {
        if mask & (1 << bit) != 0 {
            bytes[*pos] = OMOCODIA[(bytes[*pos] - b'0') as usize];
        }
    }
    let mut code = String::from_utf8(bytes).unwrap();
    code.push_str(&checksum(&code)?);
    Ok(code)
}

pub fn omocodes(input: &str, include_base: bool) -> Result<Vec<String>> {
    let base = to_base(input)?;
    ((if include_base { 0 } else { 1 })..=127)
        .map(|mask| to_omocode(&base, mask))
        .collect()
}

pub fn encode_with_belfiore(
    name: &str,
    surname: &str,
    sex: &str,
    date: &str,
    belfiore: &str,
    mask: u8,
) -> Result<String> {
    let date = CivilDate::parse(date)?;
    let sex = sex.to_ascii_uppercase();
    if !matches!(sex.as_str(), "M" | "F") {
        return Err(ValiCoreError::new(
            "INVALID_SEX",
            "Sex must be M or F for fiscal code encoding",
            Some("sex"),
        ));
    }
    let belfiore = belfiore.to_ascii_uppercase();
    let b = belfiore.as_bytes();
    if b.len() != 4 || !b[0].is_ascii_uppercase() || !b[1..].iter().all(u8::is_ascii_digit) {
        return Err(ValiCoreError::new(
            "INVALID_BELFIORE",
            "Expected a Belfiore code such as H501 or Z404",
            Some("birthplace"),
        ));
    }
    let body = format!(
        "{}{}{:02}{}{:02}{}",
        surname_code(surname)?,
        name_code(name)?,
        date.year % 100,
        MONTHS[(date.month - 1) as usize] as char,
        date.day + if sex == "F" { 40 } else { 0 },
        belfiore
    );
    let code = format!("{}{}", body, checksum(&body)?);
    to_omocode(&code, mask)
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DecodeOptions {
    pub year_range: Option<[u16; 2]>,
}

pub fn year_range(options: &DecodeOptions) -> Result<[u16; 2]> {
    let range = options.year_range.unwrap_or([1, 9999]);
    if range[0] == 0 || range[1] > 9999 || range[0] > range[1] {
        return Err(ValiCoreError::new(
            "INVALID_YEAR_RANGE",
            "Year range must be ordered within 1..9999",
            Some("yearRange"),
        ));
    }
    Ok(range)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Decoded {
    pub code: String,
    pub base_code: String,
    pub surname_code: String,
    pub name_code: String,
    pub year_two_digits: u8,
    pub month: u8,
    pub day: u8,
    pub sex: String,
    pub belfiore_code: String,
    pub omocodia_mask: u8,
    pub candidate_dates: Vec<String>,
    pub century_ambiguous: bool,
}

pub fn decode(input: &str, options: &DecodeOptions) -> Result<Decoded> {
    let code = checked_code(input)?;
    let base = to_base(&code)?;
    let yy: u8 = base[6..8].parse().unwrap();
    let month = (MONTHS
        .iter()
        .position(|c| *c == base.as_bytes()[8])
        .unwrap()
        + 1) as u8;
    let encoded_day: u8 = base[9..11].parse().unwrap();
    let (day, sex) = match encoded_day {
        1..=31 => (encoded_day, "M"),
        41..=71 => (encoded_day - 40, "F"),
        _ => {
            return Err(ValiCoreError::new(
                "INVALID_DAY_SEX",
                "Encoded day must be 01..31 or 41..71",
                Some("code"),
            ));
        }
    };
    let range = year_range(options)?;
    let dates: Vec<String> = (range[0]..=range[1])
        .filter(|y| y % 100 == yy as u16)
        .filter_map(|y| {
            CivilDate::new(y, month, day)
                .ok()
                .map(|date| date.to_string())
        })
        .collect();
    if dates.is_empty() {
        return Err(ValiCoreError::new(
            "INVALID_CALENDAR",
            "No real date matches the code within the requested year range",
            Some("code"),
        ));
    }
    Ok(Decoded {
        surname_code: base[..3].into(),
        name_code: base[3..6].into(),
        year_two_digits: yy,
        month,
        day,
        sex: sex.into(),
        belfiore_code: base[11..15].into(),
        omocodia_mask: omocodia_mask(&code)?,
        code,
        base_code: base,
        century_ambiguous: dates.len() > 1,
        candidate_dates: dates,
    })
}
