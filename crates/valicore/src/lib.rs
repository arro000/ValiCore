//! Composition facade with compile-time fiscal/geographic component selection.
//! Only this crate composes domains; excluded domains are optional dependencies.

#[cfg(feature = "fiscal")]
pub use valicore_fiscal_identity as fiscal_identity;
#[cfg(feature = "fiscal")]
pub use valicore_fiscal_identity::{
    DecodeOptions, Decoded, ItalianReaCheck, ItalianReaReport, ItalianVatCheck, ItalianVatReport,
    MONTHS, OMOCODIA, OMOCODIA_POSITIONS, checked_code, checksum, decode, encode_with_belfiore,
    name_code, normalize_name, numeric_checksum, omocodes, omocodia_mask, structural_code,
    surname_code, to_base, to_omocode, validate_italian_rea, validate_italian_vat, year_range,
};
pub use valicore_foundation::{CivilDate, Result, ValiCoreError};
#[cfg(feature = "geo")]
pub use valicore_geo_historical as geo_historical;
#[cfg(feature = "geo")]
pub use valicore_geo_historical::{
    Catalog, DATA_SCHEMA, Dataset, DatasetSeed, Place, ProvinceName, ProvinceOption,
    ProvinceOptions, Resolution, SearchOptions, search_key, within_date,
};

pub const RUNTIME_NAME: &str = "ValiCore";
pub const MODULES: &[&str] = &[
    #[cfg(feature = "fiscal")]
    "fiscal_identity",
    #[cfg(feature = "geo")]
    "geo_historical",
];
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
pub const API_MAJOR: u32 = 8;

#[cfg(all(feature = "fiscal", feature = "geo"))]
mod birthplace_history;
mod engine;
#[cfg(any(feature = "fiscal", feature = "geo"))]
mod place_query;
#[cfg(feature = "fiscal")]
mod validation;

#[cfg(all(feature = "fiscal", feature = "geo"))]
pub use birthplace_history::{BirthplaceHistoryReport, CandidateBirthplaceHistory};
pub use engine::{Capabilities, Engine};
#[cfg(feature = "fiscal")]
pub use engine::{DecodedResult, Person};
#[cfg(any(feature = "fiscal", feature = "geo"))]
pub use place_query::PlaceQuery;
#[cfg(feature = "fiscal")]
pub use validation::*;
