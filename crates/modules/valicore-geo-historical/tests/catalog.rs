//! Geo module is testable without fiscal rules or the ABI.

use serde_json::Value;
use std::sync::Arc;
use valicore_geo_historical::*;

fn place(id: &str, name: &str, belfiore: &str, valid_from: Option<&str>) -> Place {
    Place {
        id: id.into(),
        source_id: Arc::from("test"),
        source_record_id: id.into(),
        name: Arc::from(name),
        aliases: Vec::new(),
        kind: Arc::from("municipality"),
        status: Arc::from("active"),
        belfiore_code: Some(Arc::from(belfiore)),
        istat_code: Some(Arc::from("058091")),
        province: Some(Arc::from("RM")),
        valid_from: valid_from.map(Arc::from),
        valid_to: None,
        birth_allowed: Some(true),
        source_updated_at: None,
    }
}

fn dataset() -> Dataset {
    Dataset {
        schema_version: 1,
        version: "test".into(),
        sources: Value::Null,
        coverage: Value::Null,
        places: vec![
            place("rome-old", "Roma", "H501", None),
            place("rome-new", "Roma", "H501", Some("2000-01-01")),
            place("fiumicino", "Fiumicino", "M297", Some("1992-01-01")),
        ],
        provinces: vec![ProvinceName {
            code: "RM".into(),
            name: "Roma".into(),
            aliases: vec![],
            valid_from: None,
            valid_to: None,
        }],
    }
}

#[test]
fn resolves_by_code_and_name() {
    let catalog = Catalog::new(dataset()).unwrap();
    assert_eq!(catalog.places_by_code("h501").len(), 2);

    let by_name = catalog
        .resolve_place(&PlaceQuery {
            name: Some("Fiumicino".into()),
            ..Default::default()
        })
        .unwrap();
    assert_eq!(by_name.status, "unique");
    assert_eq!(by_name.belfiore_code.as_deref(), Some("M297"));
}

#[test]
fn date_filter_respects_intervals() {
    let catalog = Catalog::new(dataset()).unwrap();
    let dated = |date: &str, name: &str| {
        catalog
            .resolve_place(&PlaceQuery {
                name: Some(name.into()),
                on_date: Some(date.into()),
                ..Default::default()
            })
            .unwrap()
            .status
    };
    assert_eq!(dated("1991-12-31", "Fiumicino"), "missing");
    assert_eq!(dated("1992-01-01", "Fiumicino"), "unique");
}

#[test]
fn search_ranks_prefix_and_lists_provinces() {
    let catalog = Catalog::new(dataset()).unwrap();
    let results = catalog
        .search_places("rom", &SearchOptions::default())
        .unwrap();
    assert!(!results.is_empty());
    assert!(results.iter().all(|p| p.name.as_ref() == "Roma"));

    let provinces = catalog.list_provinces(&ProvinceOptions::default()).unwrap();
    assert_eq!(provinces.len(), 1);
    assert_eq!(provinces[0].code, "RM");
    assert_eq!(provinces[0].place_count, 2);
}

#[test]
fn rejects_an_unsupported_schema() {
    let mut broken = dataset();
    broken.schema_version = 99;
    let error = Catalog::new(broken).err().unwrap();
    assert_eq!(error.code, "INCOMPATIBLE_DATASET");
}
