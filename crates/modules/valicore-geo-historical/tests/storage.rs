use serde::de::DeserializeSeed;
use serde_json::{Value, json};
use std::sync::Arc;
use valicore_geo_historical::{Catalog, Dataset, DatasetSeed, PlaceQuery, SearchOptions};

fn snapshot(version: &str) -> Value {
    json!({
        "schemaVersion": 1, "version": version,
        "sources": {"new-source": {"referenceDate": "2026-01-01"}},
        "coverage": {"note": "Keep source evidence"}, "provinces": [],
        "places": [
            {"id":"old","sourceId":"new-source","sourceRecordId":"record-1",
             "name":"OLD NAME","aliases":["Shared Alias", "Shared Alias", "Å village"],
             "kind":"municipality","status":"ceased","belfioreCode":"A001",
             "istatCode":"001001","province":"AA","validFrom":"1900-01-01",
             "validTo":"2025-12-31","birthAllowed":null,"sourceUpdatedAt":"2026-01-01"},
            {"id":"current","sourceId":"new-source","sourceRecordId":"record-2",
             "name":"CURRENT NAME","aliases":["Shared Alias", "Å village"],
             "kind":"municipality","status":"active","belfioreCode":"A001",
             "istatCode":"002001","province":"BB","validFrom":"2026-01-01",
             "validTo":null,"birthAllowed":true,"sourceUpdatedAt":"2026-01-01"}
        ]
    })
}

#[test]
fn pooled_rows_preserve_json_provenance_nulls_aliases_and_escaped_unicode() {
    let input = snapshot("first-snapshot");
    let dataset: Dataset = serde_json::from_str(&input.to_string()).unwrap();
    assert_eq!(serde_json::to_value(&dataset).unwrap(), input);
    assert!(Arc::ptr_eq(
        &dataset.places[0].source_id,
        &dataset.places[1].source_id
    ));
    assert!(Arc::ptr_eq(
        dataset.places[0].belfiore_code.as_ref().unwrap(),
        dataset.places[1].belfiore_code.as_ref().unwrap()
    ));
    assert!(Arc::ptr_eq(
        &dataset.places[0].aliases[0],
        &dataset.places[1].aliases[0]
    ));
    assert!(Arc::ptr_eq(
        dataset.places[0].source_updated_at.as_ref().unwrap(),
        dataset.places[1].source_updated_at.as_ref().unwrap()
    ));
    // Text pooling must also work through the native/custom JSON Value path.
    let from_value: Dataset = serde_json::from_value(input.clone()).unwrap();
    assert_eq!(serde_json::to_value(&from_value).unwrap(), input);
    assert!(!Arc::ptr_eq(
        &dataset.places[0].name,
        &from_value.places[0].name
    ));
    let escaped = input.to_string().replace('Å', "\\u00c5");
    let escaped_dataset: Dataset = serde_json::from_str(&escaped).unwrap();
    assert_eq!(serde_json::to_value(escaped_dataset).unwrap(), input);
}

#[test]
fn row_count_hints_preserve_schema_and_only_affect_allocation() {
    let mut input = snapshot("hinted-snapshot");
    input["ignoredExtension"] = json!({"arbitraryFutureMetadata": [1, 2, 3]});
    let expected: Dataset = serde_json::from_value(input.clone()).unwrap();
    let bytes = input.to_string();
    for count in [0, 1, 2, 20] {
        let mut parser = serde_json::Deserializer::from_str(&bytes);
        let dataset = DatasetSeed { place_count: count }
            .deserialize(&mut parser)
            .unwrap();
        parser.end().unwrap();
        assert_eq!(
            serde_json::to_value(&dataset).unwrap(),
            serde_json::to_value(&expected).unwrap()
        );
        assert_eq!(dataset.places.len(), 2);
        assert!(Arc::ptr_eq(
            &dataset.places[0].source_id,
            &dataset.places[1].source_id
        ));
    }
    for field in ["schemaVersion", "version", "sources", "coverage", "places"] {
        let mut malformed = input.clone();
        malformed.as_object_mut().unwrap().remove(field);
        let bytes = malformed.to_string();
        let mut parser = serde_json::Deserializer::from_str(&bytes);
        assert!(
            DatasetSeed { place_count: 2 }
                .deserialize(&mut parser)
                .is_err()
        );
    }
    let bytes = bytes.replace(
        "\"version\":\"hinted-snapshot\"",
        "\"version\":\"first\",\"version\":\"second\"",
    );
    let mut parser = serde_json::Deserializer::from_str(&bytes);
    assert!(
        DatasetSeed { place_count: 2 }
            .deserialize(&mut parser)
            .is_err()
    );
    let mut returned = expected.places[1].clone();
    Arc::make_mut(&mut returned.name).make_ascii_lowercase();
    assert_eq!(expected.places[1].name.as_ref(), "CURRENT NAME");
}

#[test]
fn new_snapshot_rebuilds_indices_without_mutating_a_loaded_snapshot() {
    let old = Catalog::new(serde_json::from_value(snapshot("first-snapshot")).unwrap()).unwrap();
    let mut updated = snapshot("next-snapshot");
    updated["sources"]["new-source"]["referenceDate"] = json!("2026-02-01");
    updated["places"][1]["name"] = json!("RENAMED PLACE");
    updated["places"][1]["province"] = json!("XY");
    updated["places"][1]["aliases"] = json!(["New Alias", "Å village"]);
    let mut added = updated["places"][1].clone();
    added["id"] = json!("new-record");
    added["sourceRecordId"] = json!("record-3");
    added["name"] = json!("BRAND NEW PLACE");
    added["belfioreCode"] = json!("A002");
    added["istatCode"] = json!("003001");
    added["province"] = json!("ZZ");
    updated["places"].as_array_mut().unwrap().push(added);
    let new = Catalog::new(serde_json::from_value(updated.clone()).unwrap()).unwrap();
    assert_eq!(serde_json::to_value(new.dataset()).unwrap(), updated);
    assert_eq!(old.dataset().version, "first-snapshot");
    assert_eq!(new.dataset().version, "next-snapshot");
    let query = PlaceQuery {
        name: Some("Current Name".into()),
        ..Default::default()
    };
    assert_eq!(old.resolve_place(&query).unwrap().status, "unique");
    assert_eq!(new.resolve_place(&query).unwrap().status, "missing");
    let query = PlaceQuery {
        name: Some("New Alias".into()),
        province: Some("XY".into()),
        ..Default::default()
    };
    assert_eq!(
        new.resolve_place(&query).unwrap().belfiore_code.as_deref(),
        Some("A001")
    );
    assert_eq!(old.resolve_place(&query).unwrap().status, "missing");
    let results = new
        .search_places(
            "Brand",
            &SearchOptions {
                province: Some("ZZ".into()),
                ..Default::default()
            },
        )
        .unwrap();
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].name.as_ref(), "BRAND NEW PLACE");
    assert!(!Arc::ptr_eq(
        &old.dataset().places[0].name,
        &new.dataset().places[0].name
    ));
}

#[test]
fn sorted_indices_keep_source_order_and_inclusive_historical_boundaries() {
    let engine = Catalog::new(serde_json::from_value(snapshot("history")).unwrap()).unwrap();
    for (date, expected_id) in [("2025-12-31", "old"), ("2026-01-01", "current")] {
        let result = engine
            .resolve_place(&PlaceQuery {
                name: Some("a village".into()),
                on_date: Some(date.into()),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(result.status, "unique");
        assert_eq!(result.candidates[0].id.as_str(), expected_id);
    }
    let by_code = engine.places_by_code("a001");
    assert_eq!(
        by_code.iter().map(|p| p.id.as_str()).collect::<Vec<_>>(),
        ["old", "current"]
    );
    // Duplicate aliases do not duplicate a record in the name index.
    let by_alias = engine
        .resolve_place(&PlaceQuery {
            name: Some("Shared Alias".into()),
            ..Default::default()
        })
        .unwrap();
    assert_eq!(by_alias.candidates.len(), 2);
    assert_eq!(by_alias.candidates[0].id.as_str(), "old");
}

#[test]
fn consuming_a_catalog_requires_rebuilding_indices_after_edits() {
    let catalog = Catalog::new(serde_json::from_value(snapshot("editable")).unwrap()).unwrap();
    let mut returned = catalog.places_by_code("A001");
    Arc::make_mut(&mut returned[0].name).make_ascii_lowercase();
    assert_eq!(catalog.dataset().places[0].name.as_ref(), "OLD NAME");

    let mut input = catalog.into_dataset();
    input.places[0].belfiore_code = Some(Arc::from("A003"));
    let rebuilt = Catalog::new(input).unwrap();
    assert_eq!(rebuilt.places_by_code("A003")[0].id, "old");
    assert_eq!(rebuilt.places_by_code("A001").len(), 1);
}
