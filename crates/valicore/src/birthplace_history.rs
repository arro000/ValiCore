//! Candidate-by-candidate administrative evidence, never fiscal allocation.

use serde::{Deserialize, Serialize};
use valicore_fiscal_identity::{DecodeOptions, Decoded, decode};
use valicore_foundation::{Result, ValiCoreError};
use valicore_geo_historical::{Place, within_date};

use crate::{Check, Engine};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CandidateBirthplaceHistory {
    pub birth_date: String,
    /// Administrative compatibility only, not validity of the fiscal code.
    pub compatible: Option<bool>,
    pub status: String,
    /// Source-row order is retained in each partition.
    pub matching_record_ids: Vec<String>,
    pub uncertain_record_ids: Vec<String>,
    pub excluded_record_ids: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ValiCoreError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BirthplaceHistoryReport {
    pub scope: String,
    /// Unfiltered calendar candidates and original fiscal fragments.
    pub decoded: Decoded,
    pub data_version: Option<String>,
    /// All documented versions, in original source-row order.
    pub records: Vec<Place>,
    pub candidates: Vec<CandidateBirthplaceHistory>,
    pub allocation_check: Check,
}

impl Engine {
    /// Compare every calendar candidate with documented administrative intervals.
    /// Neither candidate filtering, century selection nor allocation validation
    /// occurs. A missing start is unknown, not evidence of perpetual existence;
    /// a missing end follows the geographic schema's open-end convention.
    pub fn birthplace_history(
        &self,
        input: &str,
        options: &DecodeOptions,
    ) -> Result<BirthplaceHistoryReport> {
        let decoded = decode(input, options)?;
        let available = self.capabilities().geo_historical;
        let records = if available {
            self.places_by_code(&decoded.belfiore_code)?
        } else {
            Vec::new()
        };
        let candidates = decoded.candidate_dates.iter().map(|date| {
            let mut candidate = CandidateBirthplaceHistory {
                birth_date: date.clone(), compatible: None, status: "unknown".into(),
                matching_record_ids: Vec::new(), uncertain_record_ids: Vec::new(),
                excluded_record_ids: Vec::new(), error: None,
            };
            for record in &records {
                if !within_date(record, Some(date)) {
                    candidate.excluded_record_ids.push(record.id.clone());
                } else if record.valid_from.is_none() {
                    candidate.uncertain_record_ids.push(record.id.clone());
                } else {
                    candidate.matching_record_ids.push(record.id.clone());
                }
            }
            if !candidate.matching_record_ids.is_empty() {
                candidate.compatible = Some(true);
                candidate.status = "pass".into();
            } else if !available {
                candidate.error = Some(ValiCoreError::new("CAPABILITY_UNAVAILABLE",
                    "Administrative birthplace history requires a loaded geographic catalog", Some("catalog")));
            } else if records.is_empty() {
                candidate.error = Some(ValiCoreError::new("PLACE_NOT_IN_DATASET",
                    "Belfiore code is absent from the loaded administrative snapshot", Some("birthplace")));
            } else if !candidate.uncertain_record_ids.is_empty() {
                candidate.error = Some(ValiCoreError::new("UNKNOWN_PLACE_DATES",
                    "Matching administrative records have an undocumented start date", Some("birthplace")));
            } else {
                candidate.compatible = Some(false);
                candidate.status = "fail".into();
                candidate.error = Some(ValiCoreError::new("PLACE_DATE_MISMATCH",
                    "All documented administrative intervals exclude this candidate date; this is not a fiscal allocation verdict", Some("birthDate")));
            }
            candidate
        }).collect();
        Ok(BirthplaceHistoryReport {
            scope: "administrative_birthplace_history".into(),
            decoded,
            data_version: self.dataset().map(|dataset| dataset.version.clone()),
            records,
            candidates,
            allocation_check: Check {
                name: "fiscal_allocation".into(),
                status: "not_run".into(),
                error: None,
            },
        })
    }
}
