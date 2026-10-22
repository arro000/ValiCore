//! Pooled text and contiguous indices; canonical JSON remains unchanged.
use crate::{Dataset, Place};
use serde::de::{DeserializeSeed, Error, MapAccess, SeqAccess, Visitor};
use serde::{Deserialize, Deserializer};
use std::borrow::Cow;
use std::collections::HashSet;
use std::sync::Arc;

#[derive(Default)]
pub(crate) struct StringPool(HashSet<Arc<str>>);

impl StringPool {
    pub(crate) fn intern(&mut self, value: String) -> Arc<str> {
        if let Some(shared) = self.0.get(value.as_str()) {
            return shared.clone();
        }
        let value = Arc::from(value);
        self.0.insert(Arc::clone(&value));
        value
    }

    fn text(&mut self, value: Text<'_>) -> Arc<str> {
        if let Some(shared) = self.0.get(value.0.as_ref()) {
            return shared.clone();
        }
        let value: Arc<str> = match value.0 {
            Cow::Borrowed(text) => Arc::from(text),
            Cow::Owned(text) => Arc::from(text),
        };
        self.0.insert(value.clone());
        value
    }

    pub(crate) fn share(&mut self, value: Arc<str>) -> Arc<str> {
        if let Some(shared) = self.0.get(value.as_ref()) {
            return shared.clone();
        }
        self.0.insert(value.clone());
        value
    }
}

// Borrow unescaped slice-backed JSON text during parsing. The pool copies only
// previously unseen values; no temporary String/Arc is allocated per repeated
// field. Value-backed native/custom input and escaped JSON use owned text.
#[derive(Deserialize)]
#[serde(transparent)]
struct Text<'a>(#[serde(borrow)] Cow<'a, str>);

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct InputPlace<'a> {
    id: String,
    #[serde(borrow)]
    source_id: Text<'a>,
    source_record_id: String,
    #[serde(borrow)]
    name: Text<'a>,
    #[serde(borrow, default)]
    aliases: Vec<Text<'a>>,
    #[serde(borrow)]
    kind: Text<'a>,
    #[serde(borrow)]
    status: Text<'a>,
    #[serde(borrow)]
    belfiore_code: Option<Text<'a>>,
    #[serde(borrow)]
    istat_code: Option<Text<'a>>,
    #[serde(borrow)]
    province: Option<Text<'a>>,
    #[serde(borrow)]
    valid_from: Option<Text<'a>>,
    valid_to: Option<String>,
    #[serde(default)]
    birth_allowed: Option<bool>,
    #[serde(borrow, default)]
    source_updated_at: Option<Text<'a>>,
}

impl InputPlace<'_> {
    fn store(self, pool: &mut StringPool) -> Place {
        Place {
            id: self.id,
            source_id: pool.text(self.source_id),
            source_record_id: self.source_record_id,
            name: pool.text(self.name),
            aliases: self
                .aliases
                .into_iter()
                .map(|text| pool.text(text))
                .collect(),
            kind: pool.text(self.kind),
            status: pool.text(self.status),
            belfiore_code: self.belfiore_code.map(|text| pool.text(text)),
            istat_code: self.istat_code.map(|text| pool.text(text)),
            province: self.province.map(|text| pool.text(text)),
            valid_from: self.valid_from.map(|text| pool.text(text)),
            valid_to: self.valid_to,
            birth_allowed: self.birth_allowed,
            source_updated_at: self.source_updated_at.map(|text| pool.text(text)),
        }
    }
}

/// Decode and deduplicate each row immediately, not after materializing a full
/// dataset of unshared strings. Each load owns its pool and immutable text.
pub(crate) fn deserialize_places<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<Vec<Place>, D::Error> {
    PlacesSeed { capacity_hint: 0 }.deserialize(deserializer)
}

struct PlacesSeed {
    capacity_hint: usize,
}

impl<'de> DeserializeSeed<'de> for PlacesSeed {
    type Value = Vec<Place>;

    fn deserialize<D: Deserializer<'de>>(self, deserializer: D) -> Result<Self::Value, D::Error> {
        struct PlacesVisitor {
            capacity_hint: usize,
        }
        impl<'de> Visitor<'de> for PlacesVisitor {
            type Value = Vec<Place>;

            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str("an array of place records")
            }

            fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<Self::Value, A::Error> {
                let mut pool = StringPool::default();
                let mut places = Vec::with_capacity(seq.size_hint().unwrap_or(self.capacity_hint));
                while let Some(place) = seq.next_element::<InputPlace<'de>>()? {
                    places.push(place.store(&mut pool));
                }
                places.shrink_to_fit();
                Ok(places)
            }
        }
        deserializer.deserialize_seq(PlacesVisitor {
            capacity_hint: self.capacity_hint,
        })
    }
}

/// A caller-supplied row-count hint avoids geometric vector growth while loading
/// JSON. It is an allocation hint, not a catalog limit or a snapshot constant.
pub struct DatasetSeed {
    pub place_count: usize,
}

impl<'de> DeserializeSeed<'de> for DatasetSeed {
    type Value = Dataset;

    fn deserialize<D: Deserializer<'de>>(self, deserializer: D) -> Result<Dataset, D::Error> {
        #[derive(Deserialize)]
        #[serde(field_identifier, rename_all = "camelCase")]
        enum Field {
            SchemaVersion,
            Version,
            Sources,
            Coverage,
            Places,
            Provinces,
            #[serde(other)]
            Other,
        }
        struct DatasetVisitor {
            place_count: usize,
        }
        impl<'de> Visitor<'de> for DatasetVisitor {
            type Value = Dataset;
            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str("a dataset object")
            }
            fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Dataset, A::Error> {
                let (
                    mut schema_version,
                    mut version,
                    mut sources,
                    mut coverage,
                    mut places,
                    mut provinces,
                ) = (None, None, None, None, None, None);
                macro_rules! field {
                    ($slot:ident, $name:literal) => {{
                        if $slot.is_some() {
                            return Err(A::Error::duplicate_field($name));
                        }
                        $slot = Some(map.next_value()?);
                    }};
                }
                while let Some(key) = map.next_key::<Field>()? {
                    match key {
                        Field::SchemaVersion => field!(schema_version, "schemaVersion"),
                        Field::Version => field!(version, "version"),
                        Field::Sources => field!(sources, "sources"),
                        Field::Coverage => field!(coverage, "coverage"),
                        Field::Provinces => field!(provinces, "provinces"),
                        Field::Places => {
                            if places.is_some() {
                                return Err(A::Error::duplicate_field("places"));
                            }
                            places = Some(map.next_value_seed(PlacesSeed {
                                capacity_hint: self.place_count,
                            })?);
                        }
                        Field::Other => {
                            map.next_value::<serde::de::IgnoredAny>()?;
                        }
                    }
                }
                Ok(Dataset {
                    schema_version: schema_version
                        .ok_or_else(|| A::Error::missing_field("schemaVersion"))?,
                    version: version.ok_or_else(|| A::Error::missing_field("version"))?,
                    sources: sources.ok_or_else(|| A::Error::missing_field("sources"))?,
                    coverage: coverage.ok_or_else(|| A::Error::missing_field("coverage"))?,
                    places: places.ok_or_else(|| A::Error::missing_field("places"))?,
                    provinces: provinces.unwrap_or_default(),
                })
            }
        }
        deserializer.deserialize_struct(
            "Dataset",
            &[
                "schemaVersion",
                "version",
                "sources",
                "coverage",
                "places",
                "provinces",
            ],
            DatasetVisitor {
                place_count: self.place_count,
            },
        )
    }
}

/// Sorted entries avoid an allocated vector for each distinct key. Sorting by
/// source row index within a key preserves historical candidate order.
pub(crate) struct CatalogIndex(Box<[(Arc<str>, usize)]>);

impl CatalogIndex {
    pub(crate) fn new(mut entries: Vec<(Arc<str>, usize)>) -> Self {
        entries.sort_unstable();
        Self(entries.into_boxed_slice())
    }

    pub(crate) fn get(&self, key: &str) -> &[(Arc<str>, usize)] {
        let start = self.0.partition_point(|(text, _)| text.as_ref() < key);
        let end = start + self.0[start..].partition_point(|(text, _)| text.as_ref() == key);
        &self.0[start..end]
    }
}
