//! Immutable, validated catalog and historical queries.

use crate::storage::{CatalogIndex, StringPool};
use crate::{
    DATA_SCHEMA, Dataset, Place, PlaceQuery, ProvinceName, ProvinceOption, ProvinceOptions,
    Resolution, SearchOptions, search_key,
};
use std::collections::{BTreeMap, BinaryHeap, HashMap, HashSet};
use std::ops::Range;
use std::sync::Arc;
use valicore_foundation::{CivilDate, Result, ValiCoreError};

/// A validated snapshot with immutable indices.
///
/// Modify an input dataset before construction, or consume this catalog with
/// [`Catalog::into_dataset`] and rebuild it. In-place mutation would invalidate
/// row indices and normalized search keys.
pub struct Catalog {
    dataset: Dataset,
    by_code: CatalogIndex,
    by_name: CatalogIndex,
    by_istat: CatalogIndex,
    by_province: CatalogIndex,
    keys: Vec<Range<usize>>,
    key_text: Vec<Arc<str>>,
}

impl Catalog {
    pub fn new(dataset: Dataset) -> Result<Self> {
        if dataset.schema_version != DATA_SCHEMA {
            return Err(ValiCoreError::new(
                "INCOMPATIBLE_DATASET",
                "Unsupported dataset schema version",
                Some("dataset"),
            ));
        }
        let place_count = dataset.places.len();
        let key_count = place_count
            + dataset
                .places
                .iter()
                .map(|p| p.aliases.len())
                .sum::<usize>();
        let mut by_code = Vec::with_capacity(place_count);
        let mut by_name = Vec::with_capacity(key_count);
        let mut by_istat = Vec::with_capacity(place_count);
        let mut by_province = Vec::with_capacity(place_count);
        let mut key_pool = StringPool::default();
        let mut engine = Self {
            dataset,
            by_code: CatalogIndex::new(Vec::new()),
            by_name: CatalogIndex::new(Vec::new()),
            by_istat: CatalogIndex::new(Vec::new()),
            by_province: CatalogIndex::new(Vec::new()),
            keys: Vec::with_capacity(place_count),
            key_text: Vec::with_capacity(key_count),
        };
        let mut ids = std::collections::HashSet::new();
        let mut province_intervals: HashMap<&str, Vec<&ProvinceName>> = HashMap::new();
        for province in &engine.dataset.provinces {
            if province.code.len() != 2
                || !province.code.bytes().all(|c| c.is_ascii_uppercase())
                || province.name.trim().is_empty()
            {
                return Err(ValiCoreError::new(
                    "INVALID_DATASET",
                    "Province names require two-letter codes and nonempty names",
                    Some("dataset"),
                ));
            }
            for date in [&province.valid_from, &province.valid_to]
                .into_iter()
                .flatten()
            {
                CivilDate::parse(date)?;
            }
            if province
                .valid_from
                .as_ref()
                .zip(province.valid_to.as_ref())
                .is_some_and(|(start, end)| start > end)
            {
                return Err(ValiCoreError::new(
                    "INVALID_DATASET",
                    "Province name date interval is reversed",
                    Some("dataset"),
                ));
            }
            let entries = province_intervals.entry(&province.code).or_default();
            if entries.iter().any(|previous| {
                previous
                    .valid_from
                    .as_ref()
                    .zip(province.valid_to.as_ref())
                    .is_none_or(|(start, end)| start <= end)
                    && province
                        .valid_from
                        .as_ref()
                        .zip(previous.valid_to.as_ref())
                        .is_none_or(|(start, end)| start <= end)
            }) {
                return Err(ValiCoreError::new(
                    "INVALID_DATASET",
                    "Province name intervals must not overlap for the same code",
                    Some("dataset"),
                ));
            }
            entries.push(province);
        }
        for (index, place) in engine.dataset.places.iter().enumerate() {
            if place.id.is_empty() || place.name.trim().is_empty() || !ids.insert(&place.id) {
                return Err(ValiCoreError::new(
                    "INVALID_DATASET",
                    "Place IDs must be unique and names must be nonempty",
                    Some("dataset"),
                ));
            }
            if !matches!(
                place.kind.as_ref(),
                "municipality" | "foreign_country" | "foreign_territory"
            ) || !matches!(
                place.status.as_ref(),
                "active" | "ceased" | "planned" | "unknown"
            ) {
                return Err(ValiCoreError::new(
                    "INVALID_DATASET",
                    "Unsupported place kind or status",
                    Some("dataset"),
                ));
            }
            for date in [place.valid_from.as_deref(), place.valid_to.as_deref()]
                .into_iter()
                .flatten()
            {
                CivilDate::parse(date)?;
            }
            if let (Some(start), Some(end)) = (&place.valid_from, &place.valid_to)
                && start.as_ref() > end.as_str()
            {
                return Err(ValiCoreError::new(
                    "INVALID_DATASET",
                    "Place date interval is reversed",
                    Some("dataset"),
                ));
            }
            if let Some(code) = &place.belfiore_code {
                let b = code.as_bytes();
                if b.len() != 4
                    || !b[0].is_ascii_uppercase()
                    || !b[1..].iter().all(u8::is_ascii_digit)
                {
                    return Err(ValiCoreError::new(
                        "INVALID_DATASET",
                        "Place Belfiore code has an invalid format",
                        Some("dataset"),
                    ));
                }
                by_code.push((code.clone(), index));
            }
            if let Some(code) = &place.istat_code {
                by_istat.push((code.clone(), index));
            }
            if let Some(province) = &place.province {
                by_province.push((province.clone(), index));
            }
            let mut keys: Vec<Arc<str>> = std::iter::once(&place.name)
                .chain(place.aliases.iter())
                .map(|n| {
                    let key = search_key(n);
                    if key == n.as_ref() {
                        key_pool.share(n.clone())
                    } else {
                        key_pool.intern(key)
                    }
                })
                .collect();
            keys.sort();
            keys.dedup();
            for key in &keys {
                by_name.push((key.clone(), index));
            }
            let start = engine.key_text.len();
            engine.key_text.extend(keys);
            engine.keys.push(start..engine.key_text.len());
        }
        engine.by_code = CatalogIndex::new(by_code);
        engine.by_name = CatalogIndex::new(by_name);
        engine.by_istat = CatalogIndex::new(by_istat);
        engine.by_province = CatalogIndex::new(by_province);
        Ok(engine)
    }

    /// Inspect the loaded snapshot without invalidating its indices.
    ///
    /// ```compile_fail
    /// use valicore_geo_historical::Catalog;
    /// fn mutate(catalog: &mut Catalog) {
    ///     catalog.dataset().places.clear();
    /// }
    /// ```
    pub fn dataset(&self) -> &Dataset {
        &self.dataset
    }

    /// Recover the owned input, dropping all indices. Rebuild after editing it.
    pub fn into_dataset(self) -> Dataset {
        self.dataset
    }

    /// Return all documented versions in original source-row order.
    pub fn places_by_code(&self, code: &str) -> Vec<Place> {
        self.by_code
            .get(&code.to_ascii_uppercase())
            .iter()
            .map(|(_, i)| self.dataset.places[*i].clone())
            .collect()
    }

    pub fn list_provinces(&self, options: &ProvinceOptions) -> Result<Vec<ProvinceOption>> {
        if let Some(date) = &options.on_date {
            CivilDate::parse(date)?;
        }
        // Borrow catalog strings during counting; allocate only the final output.
        let mut provinces: BTreeMap<&str, HashSet<&str>> = BTreeMap::new();
        for place in &self.dataset.places {
            if !within_date(place, options.on_date.as_deref())
                || options.active_only.unwrap_or(false) && place.status.as_ref() != "active"
                || options
                    .kind
                    .as_ref()
                    .is_some_and(|kind| kind.as_str() != place.kind.as_ref())
                || place.birth_allowed == Some(false)
            {
                continue;
            }
            if let (Some(province), Some(code)) = (&place.province, &place.belfiore_code) {
                provinces
                    .entry(province.as_ref())
                    .or_default()
                    .insert(code.as_ref());
            }
        }
        let key = options.query.as_deref().map(search_key).unwrap_or_default();
        let mut result: Vec<ProvinceOption> = provinces
            .into_iter()
            .filter_map(|(code, places)| {
                let entry = self
                    .dataset
                    .provinces
                    .iter()
                    .filter(|province| {
                        province.code == code
                            && options.on_date.as_deref().is_none_or(|date| {
                                province
                                    .valid_from
                                    .as_deref()
                                    .is_none_or(|start| start <= date)
                                    && province.valid_to.as_deref().is_none_or(|end| date <= end)
                            })
                    })
                    .max_by_key(|province| &province.valid_from);
                let matches = key.is_empty()
                    || search_key(code).contains(&key)
                    || entry.is_some_and(|province| {
                        std::iter::once(&province.name)
                            .chain(province.aliases.iter())
                            .any(|name| search_key(name).contains(&key))
                    });
                matches.then(|| ProvinceOption {
                    code: code.to_owned(),
                    name: entry.map(|province| province.name.clone()),
                    aliases: entry
                        .map(|province| province.aliases.clone())
                        .unwrap_or_default(),
                    place_count: places.len(),
                })
            })
            .collect();
        result.sort_by(|left, right| {
            left.name
                .as_ref()
                .unwrap_or(&left.code)
                .cmp(right.name.as_ref().unwrap_or(&right.code))
                .then(left.code.cmp(&right.code))
        });
        Ok(result)
    }

    pub fn search_places(&self, query: &str, options: &SearchOptions) -> Result<Vec<Place>> {
        if let Some(date) = &options.on_date {
            CivilDate::parse(date)?;
        }
        let key = search_key(query);
        if key.is_empty() {
            return Ok(Vec::new());
        }
        let province = options.province.as_ref().map(|p| p.to_ascii_uppercase());
        let limit = options.limit.unwrap_or(20).min(200);
        if limit == 0 {
            return Ok(Vec::new());
        }
        // Keep only the best bounded set rather than sorting thousands of hits.
        let mut matches = BinaryHeap::with_capacity(limit);
        let indices: Box<dyn Iterator<Item = usize> + '_> = if let Some(province) = &province {
            Box::new(self.by_province.get(province).iter().map(|(_, i)| *i))
        } else {
            Box::new(0..self.dataset.places.len())
        };
        for i in indices {
            let p = &self.dataset.places[i];
            if province
                .as_ref()
                .is_some_and(|q| p.province.as_deref() != Some(q.as_str()))
                || options
                    .kind
                    .as_ref()
                    .is_some_and(|k| k.as_str() != p.kind.as_ref())
                || options.active_only.unwrap_or(false) && p.status.as_ref() != "active"
                || !within_date(p, options.on_date.as_deref())
            {
                continue;
            }
            let keys = &self.key_text[self.keys[i].clone()];
            let rank = if p.belfiore_code.as_deref() == Some(key.as_str())
                || p.istat_code.as_deref() == Some(query.trim())
                || keys.iter().any(|n| n.as_ref() == key)
            {
                Some(0)
            } else if keys.iter().any(|n| n.starts_with(&key)) {
                Some(1)
            } else if keys.iter().any(|n| n.contains(&key)) {
                Some(2)
            } else {
                None
            };
            if let Some(rank) = rank {
                let candidate = (
                    rank,
                    p.status.as_ref() != "active",
                    p.name.as_ref(),
                    p.id.as_str(),
                    i,
                );
                if matches.len() < limit {
                    matches.push(candidate);
                } else if matches.peek().is_some_and(|worst| candidate < *worst) {
                    *matches.peek_mut().unwrap() = candidate;
                }
            }
        }
        Ok(matches
            .into_sorted_vec()
            .into_iter()
            .map(|(_, _, _, _, i)| self.dataset.places[i].clone())
            .collect())
    }

    /// Select exact, borrowed candidates; never choose a fuzzy suggestion.
    pub fn select_places(&self, query: &PlaceQuery) -> Result<Vec<&Place>> {
        query.validate()?;
        let indices = if let Some(code) = &query.belfiore_code {
            self.by_code.get(&code.to_ascii_uppercase())
        } else if let Some(code) = &query.istat_code {
            self.by_istat.get(code)
        } else {
            self.by_name
                .get(&search_key(query.name.as_deref().unwrap()))
        };
        let province = query.province.as_ref().map(|p| p.to_ascii_uppercase());
        Ok(indices
            .iter()
            .map(|(_, i)| &self.dataset.places[*i])
            .filter(|p| {
                province
                    .as_ref()
                    .is_none_or(|q| p.province.as_deref() == Some(q.as_str()))
                    && within_date(p, query.on_date.as_deref())
            })
            .collect())
    }

    pub fn resolve_place(&self, query: &PlaceQuery) -> Result<Resolution> {
        let candidates = self.select_places(query)?;
        let (status, code) = resolution_identity(&candidates);
        Ok(Resolution {
            status: status.into(),
            belfiore_code: code.map(str::to_owned),
            candidates: candidates.into_iter().cloned().collect(),
        })
    }
}

/// Classify exact candidates without copying their records or selecting a code.
pub fn resolution_identity<'a>(places: &[&'a Place]) -> (&'static str, Option<&'a str>) {
    let Some(first) = places.first() else {
        return ("missing", None);
    };
    if places.iter().any(|p| p.belfiore_code.is_none()) {
        return ("missing_code", None);
    }
    let code = first.belfiore_code.as_deref();
    if places.iter().all(|p| p.belfiore_code.as_deref() == code) {
        ("unique", code)
    } else {
        ("ambiguous", None)
    }
}

/// Compare administrative intervals with inclusive ends.
/// The optional date must already be a validated `YYYY-MM-DD` date.
pub fn within_date(place: &Place, date: Option<&str>) -> bool {
    date.is_none_or(|d| {
        place.valid_from.as_deref().is_none_or(|s| s <= d)
            && place.valid_to.as_deref().is_none_or(|e| d <= e)
    })
}
