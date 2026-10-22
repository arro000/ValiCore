use valicore_foundation::CivilDate;

#[test]
fn leap_years_and_bounds() {
    assert!(CivilDate::new(2000, 2, 29).is_ok());
    assert!(CivilDate::new(1900, 2, 29).is_err());
    assert!(CivilDate::new(2024, 2, 29).is_ok());
    assert!(CivilDate::new(0, 1, 1).is_err());
    assert!(CivilDate::new(10000, 1, 1).is_err());
    assert!(CivilDate::new(2024, 13, 1).is_err());
    assert!(CivilDate::new(2024, 4, 31).is_err());
}

#[test]
fn parse_and_display_round_trip() {
    let date = CivilDate::parse("1985-03-15").unwrap();
    assert_eq!((date.year, date.month, date.day), (1985, 3, 15));
    assert_eq!(date.to_string(), "1985-03-15");
    assert!(CivilDate::parse("1985/03/15").is_err());
    assert!(CivilDate::parse("85-03-15").is_err());
    assert!(CivilDate::parse("1985-02-30").is_err());
}
