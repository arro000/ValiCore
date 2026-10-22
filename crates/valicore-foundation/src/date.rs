use crate::{Result, ValiCoreError};
use serde::{Deserialize, Serialize};

/// A validated Gregorian calendar date within years 1..9999.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct CivilDate {
    pub year: u16,
    pub month: u8,
    pub day: u8,
}

impl CivilDate {
    pub fn new(year: u16, month: u8, day: u8) -> Result<Self> {
        let leap =
            year.is_multiple_of(4) && (!year.is_multiple_of(100) || year.is_multiple_of(400));
        let days = match month {
            2 => {
                if leap {
                    29
                } else {
                    28
                }
            }
            4 | 6 | 9 | 11 => 30,
            1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
            _ => 0,
        };
        if year == 0 || year > 9999 || day == 0 || day > days {
            return Err(ValiCoreError::new(
                "INVALID_DATE",
                "Expected a real Gregorian calendar date",
                Some("birthDate"),
            ));
        }
        Ok(Self { year, month, day })
    }

    pub fn parse(input: &str) -> Result<Self> {
        let b = input.as_bytes();
        if b.len() != 10
            || b[4] != b'-'
            || b[7] != b'-'
            || b.iter()
                .enumerate()
                .any(|(i, c)| i != 4 && i != 7 && !c.is_ascii_digit())
        {
            return Err(ValiCoreError::new(
                "INVALID_DATE",
                "Dates must use YYYY-MM-DD",
                Some("birthDate"),
            ));
        }
        Self::new(
            input[..4].parse().unwrap(),
            input[5..7].parse().unwrap(),
            input[8..].parse().unwrap(),
        )
    }
}

impl std::fmt::Display for CivilDate {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:04}-{:02}-{:02}", self.year, self.month, self.day)
    }
}
