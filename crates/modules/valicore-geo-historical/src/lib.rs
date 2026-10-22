//! Geo-historical data (PRD Module 9): immutable catalogs, no fiscal rules.

mod catalog;
mod model;
mod normalize;
mod storage;

pub use catalog::{Catalog, resolution_identity, within_date};
pub use model::{
    Dataset, Place, PlaceQuery, ProvinceName, ProvinceOption, ProvinceOptions, Resolution,
    SearchOptions,
};
pub use normalize::search_key;
pub use storage::DatasetSeed;

/// Schema version of the canonical geographic dataset.
pub const DATA_SCHEMA: u32 = 1;
