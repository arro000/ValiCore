//! Composition input. Its schema does not require linking the geo catalog.
use serde::{
    Deserialize, Serialize,
    de::{self, MapAccess, Visitor},
};
use valicore_foundation::{CivilDate, Result, ValiCoreError};

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaceQuery {
    pub name: Option<String>,
    pub province: Option<String>,
    pub belfiore_code: Option<String>,
    pub istat_code: Option<String>,
    pub on_date: Option<String>,
}
impl PlaceQuery {
    pub fn validate(&self) -> Result<()> {
        if [
            self.name.is_some(),
            self.belfiore_code.is_some(),
            self.istat_code.is_some(),
        ]
        .into_iter()
        .filter(|present| *present)
        .count()
            != 1
        {
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
    #[cfg(feature = "geo")]
    pub(crate) fn geographic(&self) -> valicore_geo_historical::PlaceQuery {
        valicore_geo_historical::PlaceQuery {
            name: self.name.clone(),
            province: self.province.clone(),
            belfiore_code: self.belfiore_code.clone(),
            istat_code: self.istat_code.clone(),
            on_date: self.on_date.clone(),
        }
    }
}
impl<'de> Deserialize<'de> for PlaceQuery {
    fn deserialize<D: serde::Deserializer<'de>>(
        deserializer: D,
    ) -> std::result::Result<Self, D::Error> {
        struct Object;
        impl<'de> Visitor<'de> for Object {
            type Value = PlaceQuery;
            fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
                f.write_str("a birthplace selector object")
            }
            fn visit_map<M: MapAccess<'de>>(
                self,
                mut map: M,
            ) -> std::result::Result<Self::Value, M::Error> {
                let mut value = PlaceQuery::default();
                let mut seen = [false; 5];
                while let Some(key) = map.next_key::<String>()? {
                    let (index, destination) = match key.as_str() {
                        "name" => (0, &mut value.name),
                        "province" => (1, &mut value.province),
                        "belfioreCode" => (2, &mut value.belfiore_code),
                        "istatCode" => (3, &mut value.istat_code),
                        "onDate" => (4, &mut value.on_date),
                        _ => {
                            return Err(de::Error::unknown_field(
                                &key,
                                &["name", "province", "belfioreCode", "istatCode", "onDate"],
                            ));
                        }
                    };
                    if seen[index] {
                        return Err(de::Error::custom(format!("Duplicate selector field {key}")));
                    }
                    seen[index] = true;
                    *destination = map.next_value()?;
                }
                Ok(value)
            }
        }
        deserializer.deserialize_map(Object)
    }
}
