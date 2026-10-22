use crate::{Engine, Person};
use serde::{Deserialize, Serialize};
use valicore_fiscal_identity::{
    DecodeOptions, Decoded, checked_code, decode, numeric_checksum, structural_code, to_base,
    year_range,
};
use valicore_foundation::{CivilDate, Result, ValiCoreError};
#[cfg(feature = "geo")]
use valicore_geo_historical::{Place, within_date};

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ValidationLevel {
    Structural,
    Checksum,
    Calendar,
    #[default]
    Territorial,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields, default)]
pub struct ValidationOptions {
    pub level: ValidationLevel,
    pub year_range: Option<[u16; 2]>,
    pub on_date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Check {
    pub name: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ValiCoreError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationReport {
    pub code: String,
    pub kind: String,
    /// None means a requested check is indeterminate.
    pub valid: Option<bool>,
    pub level: ValidationLevel,
    pub checks: Vec<Check>,
    pub decoded: Option<Decoded>,
    #[cfg(feature = "geo")]
    pub places: Vec<Place>,
    #[cfg(not(feature = "geo"))]
    pub places: [(); 0],
    pub data_version: Option<String>,
}

fn check(name: &str, status: &str, error: Option<ValiCoreError>) -> Check {
    Check {
        name: name.into(),
        status: status.into(),
        error,
    }
}

impl Engine {
    pub fn validate(&self, input: &str, options: &ValidationOptions) -> Result<ValidationReport> {
        year_range(&DecodeOptions {
            year_range: options.year_range,
        })?;
        if let Some(date) = &options.on_date {
            CivilDate::parse(date)?;
        }
        let code = input.trim().to_ascii_uppercase();
        let numeric = code.len() == 11 && code.bytes().all(|c| c.is_ascii_digit());
        let mut report = ValidationReport {
            code: code.clone(),
            kind: if numeric { "numeric" } else { "personal" }.into(),
            valid: Some(true),
            level: options.level,
            checks: Vec::new(),
            decoded: None,
            places: Default::default(),
            data_version: self.data_version().map(str::to_owned),
        };
        let level = match options.level {
            ValidationLevel::Structural => 0,
            ValidationLevel::Checksum => 1,
            ValidationLevel::Calendar => 2,
            ValidationLevel::Territorial => 3,
        };
        let structure = if numeric {
            Ok(code.clone())
        } else {
            structural_code(&code)
        };
        if let Err(error) = structure {
            report.checks.push(check("structure", "fail", Some(error)));
            report.valid = Some(false);
        } else {
            report.checks.push(check("structure", "pass", None));
        }
        if level < 1 || report.valid == Some(false) {
            report.checks.push(check("checksum", "not_run", None));
        } else {
            let result = if numeric {
                if numeric_checksum(&code[..10])? == code[10..] {
                    Ok(())
                } else {
                    Err(ValiCoreError::new(
                        "INVALID_CHECKSUM",
                        "Numeric check digit does not match",
                        Some("code"),
                    ))
                }
            } else {
                checked_code(&code).map(|_| ())
            };
            match result {
                Ok(()) => report.checks.push(check("checksum", "pass", None)),
                Err(error) => {
                    report.checks.push(check("checksum", "fail", Some(error)));
                    report.valid = Some(false);
                }
            }
        }
        if numeric || level < 2 || report.valid == Some(false) {
            report.checks.push(check("calendar", "not_run", None));
        } else {
            match decode(
                &code,
                &DecodeOptions {
                    year_range: options.year_range,
                },
            ) {
                Ok(decoded) => {
                    report.decoded = Some(decoded);
                    report.checks.push(check("calendar", "pass", None));
                }
                Err(error) => {
                    report.checks.push(check("calendar", "fail", Some(error)));
                    report.valid = Some(false);
                }
            }
        }
        if numeric || level < 3 || report.valid == Some(false) {
            report.checks.push(check("territory", "not_run", None));
        } else if !self.capabilities().geo_historical {
            report.valid = None;
            report.checks.push(check(
                "territory",
                "unknown",
                Some(self.missing_geography_error()),
            ));
        } else {
            #[cfg(feature = "geo")]
            if let Some(decoded) = &report.decoded {
                report.places = self.places_by_code(&decoded.belfiore_code)?;
                if report.places.is_empty() {
                    report.valid = None;
                    report.checks.push(check("territory", "unknown", Some(ValiCoreError::new("PLACE_NOT_IN_DATASET", "Belfiore code is absent from this dataset; allocation cannot be determined", Some("birthplace")))));
                } else if let Some(date) = &options.on_date {
                    let dated: Vec<Place> = report
                        .places
                        .iter()
                        .filter(|p| within_date(p, Some(date)))
                        .cloned()
                        .collect();
                    if dated.is_empty() {
                        report.valid = Some(false);
                        report.checks.push(check(
                            "territory",
                            "fail",
                            Some(ValiCoreError::new(
                                "PLACE_DATE_MISMATCH",
                                "No documented administrative record covers the requested date",
                                Some("onDate"),
                            )),
                        ));
                    } else if dated
                        .iter()
                        .all(|p| p.valid_from.is_none() && p.valid_to.is_none())
                    {
                        report.valid = None;
                        report.checks.push(check(
                            "territory",
                            "unknown",
                            Some(ValiCoreError::new(
                                "UNKNOWN_PLACE_DATES",
                                "Administrative dates are not documented for this place",
                                Some("onDate"),
                            )),
                        ));
                    } else {
                        report.places = dated;
                        report.checks.push(check("territory", "pass", None));
                    }
                } else {
                    report.checks.push(check("territory", "pass", None));
                }
            }
        }
        Ok(report)
    }

    pub fn matches_person(&self, input: &str, person: &Person) -> Result<MatchReport> {
        let date = CivilDate::parse(&person.birth_date)?;
        let validation = self.validate(
            input,
            &ValidationOptions {
                year_range: Some([date.year, date.year]),
                // This operation compares encoded components. Its report makes
                // the absence of territorial checking explicit when data is absent.
                level: if self.capabilities().geo_historical {
                    ValidationLevel::Territorial
                } else {
                    ValidationLevel::Calendar
                },
                ..Default::default()
            },
        )?;
        let expected = self.encode(person)?;
        let expected_base = to_base(&expected)?;
        let mut mismatches = Vec::new();
        if let Ok(actual) = to_base(input) {
            for (field, start, end) in [
                ("surname", 0, 3),
                ("name", 3, 6),
                ("birthDate", 6, 9),
                ("dayAndSex", 9, 11),
                ("birthplace", 11, 15),
            ] {
                if actual[start..end] != expected_base[start..end] {
                    mismatches.push(field.to_owned());
                }
            }
        } else {
            mismatches.push("code".into());
        }
        Ok(MatchReport {
            matches: validation.valid == Some(true) && mismatches.is_empty(),
            expected_base,
            mismatches,
            validation,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchReport {
    pub matches: bool,
    pub expected_base: String,
    pub mismatches: Vec<String>,
    pub validation: ValidationReport,
}
