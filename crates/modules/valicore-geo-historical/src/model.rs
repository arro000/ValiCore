//! Canonical dataset records and query/result types.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use valicore_foundation::{CivilDate, Result, ValiCoreError};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Place {
    pub id: String,
    pub source_id: Arc<str>,
    pub source_record_id: String,
    pub name: Arc<str>,
    #[serde(default)]
    pub aliases: Vec<Arc<str>>,
    pub kind: Arc<str>,
    pub status: Arc<str>,
    pub belfiore_code: Option<Arc<str>>,
    pub istat_code: Option<Arc<str>>,
    pub province: Option<Arc<str>>,
    pub valid_from: Option<Arc<str>>,
    /// Inclusive administrative end date. None represents an open interval.
    pub valid_to: Option<String>,
    #[serde(default)]
    pub birth_allowed: Option<bool>,
    #[serde(default)]
    pub source_updated_at: Option<Arc<str>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Dataset {
    pub schema_version: u32,
    pub version: String,
    pub sources: Value,
    pub coverage: Value,
    #[serde(deserialize_with = "crate::storage::deserialize_places")]
    pub places: Vec<Place>,
    #[serde(default)]
    pub provinces: Vec<ProvinceName>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProvinceName {
    pub code: String,
    pub name: String,
    #[serde(default)]
    pub aliases: Vec<String>,
    #[serde(default)]
    pub valid_from: Option<String>,
    #[serde(default)]
    pub valid_to: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SearchOptions {
    pub province: Option<String>,
    pub kind: Option<String>,
    pub active_only: Option<bool>,
    pub on_date: Option<String>,
    pub limit: Option<usize>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProvinceOptions {
    pub query: Option<String>,
    pub on_date: Option<String>,
    pub active_only: Option<bool>,
    pub kind: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProvinceOption {
    pub code: String,
    pub name: Option<String>,
    pub aliases: Vec<String>,
    /// Distinct usable Belfiore codes in the requested administrative interval.
    pub place_count: usize,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlaceQuery {
    pub name: Option<String>,
    pub province: Option<String>,
    pub belfiore_code: Option<String>,
    pub istat_code: Option<String>,
    pub on_date: Option<String>,
}

impl PlaceQuery {
    /// Validate selectors and dates independently of a loaded catalog.
    pub fn validate(&self) -> Result<()> {
        let selectors = [
            self.name.is_some(),
            self.belfiore_code.is_some(),
            self.istat_code.is_some(),
        ]
        .into_iter()
        .filter(|present| *present)
        .count();
        if selectors != 1 {
            return Err(ValiCoreError::new(
                "INVALID_PLACE_QUERY",
                "Provide exactly one of name, belfioreCode, or istatCode",
                Some("birthplace"),
            ));
        }
        if let Some(date) = &self.on_date {
            CivilDate::parse(date)?;
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Resolution {
    pub status: String,
    pub belfiore_code: Option<String>,
    pub candidates: Vec<Place>,
}
