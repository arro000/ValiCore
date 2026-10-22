//! Cross-module composition with no dependencies on excluded domains.
#[cfg(any(feature = "fiscal", feature = "geo"))]
use crate::PlaceQuery;
use serde::{Deserialize, Serialize};
#[cfg(feature = "fiscal")]
use valicore_fiscal_identity::{DecodeOptions, Decoded, decode, encode_with_belfiore};
#[cfg(feature = "fiscal")]
use valicore_foundation::CivilDate;
#[cfg(any(feature = "fiscal", feature = "geo"))]
use valicore_foundation::{Result, ValiCoreError};
#[cfg(all(feature = "fiscal", feature = "geo"))]
use valicore_geo_historical::resolution_identity;
#[cfg(feature = "geo")]
use valicore_geo_historical::{
    Catalog, Dataset, Place, ProvinceOption, ProvinceOptions, Resolution, SearchOptions,
};

#[cfg(feature = "fiscal")]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Person {
    pub name: String,
    pub surname: String,
    pub sex: String,
    pub birth_date: String,
    pub birthplace: PlaceQuery,
    #[serde(default)]
    pub omocodia_mask: u8,
}

/// Loaded capabilities, distinct from compiled component/operation metadata.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Capabilities {
    pub fiscal_identity: bool,
    pub geo_historical: bool,
}

#[cfg(feature = "fiscal")]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecodedResult {
    #[serde(flatten)]
    pub decoded: Decoded,
    #[cfg(feature = "geo")]
    pub places: Vec<Place>,
    /// The wire value is always [] when geographic code is not compiled.
    #[cfg(not(feature = "geo"))]
    pub places: [(); 0],
    pub data_version: Option<String>,
}

/// Only selected providers have fields; no disabled-domain handle/storage exists.
pub struct Engine {
    #[cfg(feature = "geo")]
    catalog: Option<Catalog>,
}
impl Engine {
    #[cfg(feature = "geo")]
    pub fn new(dataset: Dataset) -> Result<Self> {
        let mut engine = Self::without_catalog();
        engine.catalog = Some(Catalog::new(dataset)?);
        Ok(engine)
    }
    pub fn without_catalog() -> Self {
        Self {
            #[cfg(feature = "geo")]
            catalog: None,
        }
    }
    pub fn has_catalog(&self) -> bool {
        #[cfg(feature = "geo")]
        {
            self.catalog.is_some()
        }
        #[cfg(not(feature = "geo"))]
        {
            false
        }
    }
    pub fn data_version(&self) -> Option<&str> {
        #[cfg(feature = "geo")]
        {
            self.catalog.as_ref().map(|c| c.dataset().version.as_str())
        }
        #[cfg(not(feature = "geo"))]
        {
            None
        }
    }
    pub fn capabilities(&self) -> Capabilities {
        Capabilities {
            fiscal_identity: cfg!(feature = "fiscal"),
            geo_historical: self.has_catalog(),
        }
    }
    #[cfg(any(feature = "fiscal", feature = "geo"))]
    pub(crate) fn missing_geography_error(&self) -> ValiCoreError {
        ValiCoreError::new(
            if cfg!(feature = "geo") {
                "CAPABILITY_UNAVAILABLE"
            } else {
                "COMPONENT_UNAVAILABLE"
            },
            "This operation requires compiled geography and a loaded geographic catalog",
            Some("catalog"),
        )
    }
    #[cfg(feature = "geo")]
    pub fn require_catalog(&self) -> Result<&Catalog> {
        self.catalog
            .as_ref()
            .ok_or_else(|| self.missing_geography_error())
    }
    #[cfg(feature = "geo")]
    pub fn dataset(&self) -> Option<&Dataset> {
        self.catalog.as_ref().map(Catalog::dataset)
    }
    #[cfg(feature = "geo")]
    pub fn places_by_code(&self, code: &str) -> Result<Vec<Place>> {
        Ok(self.require_catalog()?.places_by_code(code))
    }
    #[cfg(feature = "geo")]
    pub fn list_provinces(&self, options: &ProvinceOptions) -> Result<Vec<ProvinceOption>> {
        self.require_catalog()?.list_provinces(options)
    }
    #[cfg(feature = "geo")]
    pub fn search_places(&self, query: &str, options: &SearchOptions) -> Result<Vec<Place>> {
        self.require_catalog()?.search_places(query, options)
    }
    #[cfg(feature = "geo")]
    pub fn resolve_place(&self, query: &PlaceQuery) -> Result<Resolution> {
        self.require_catalog()?.resolve_place(&query.geographic())
    }

    #[cfg(feature = "fiscal")]
    pub fn decode(&self, input: &str, options: &DecodeOptions) -> Result<DecodedResult> {
        let decoded = decode(input, options)?;
        #[cfg(feature = "geo")]
        let places = self
            .catalog
            .as_ref()
            .map(|c| c.places_by_code(&decoded.belfiore_code))
            .unwrap_or_default();
        Ok(DecodedResult {
            decoded,
            #[cfg(feature = "geo")]
            places,
            #[cfg(not(feature = "geo"))]
            places: [],
            data_version: self.data_version().map(str::to_owned),
        })
    }
    #[cfg(feature = "fiscal")]
    pub fn encode(&self, person: &Person) -> Result<String> {
        CivilDate::parse(&person.birth_date)?;
        person.birthplace.validate()?;
        if !self.has_catalog() {
            let query = &person.birthplace;
            if let Some(code) = &query.belfiore_code
                && query.province.is_none()
                && query.on_date.is_none()
            {
                return encode_with_belfiore(
                    &person.name,
                    &person.surname,
                    &person.sex,
                    &person.birth_date,
                    code,
                    person.omocodia_mask,
                );
            }
            return Err(self.missing_geography_error());
        }
        #[cfg(feature = "geo")]
        {
            self.encode_with_catalog(person)
        }
        #[cfg(not(feature = "geo"))]
        {
            Err(self.missing_geography_error())
        }
    }
    #[cfg(all(feature = "fiscal", feature = "geo"))]
    fn encode_with_catalog(&self, person: &Person) -> Result<String> {
        let mut query = person.birthplace.geographic();
        if query.on_date.is_none() && query.belfiore_code.is_none() {
            query.on_date = Some(person.birth_date.clone());
        }
        let candidates = self.require_catalog()?.select_places(&query)?;
        let (status, code) = resolution_identity(&candidates);
        let code = code.ok_or_else(|| {
            ValiCoreError::new(
                match status {
                    "ambiguous" => "AMBIGUOUS_PLACE",
                    "missing_code" => "MISSING_BELFIORE",
                    _ => "UNKNOWN_PLACE",
                },
                "Birthplace must resolve to one known Belfiore code",
                Some("birthplace"),
            )
        })?;
        if candidates.iter().all(|p| p.birth_allowed == Some(false)) {
            return Err(ValiCoreError::new(
                "PLACE_NOT_ALLOWED_FOR_BIRTH",
                "This territory is not enabled as a birthplace by the source",
                Some("birthplace"),
            ));
        }
        encode_with_belfiore(
            &person.name,
            &person.surname,
            &person.sex,
            &person.birth_date,
            code,
            person.omocodia_mask,
        )
    }
}
