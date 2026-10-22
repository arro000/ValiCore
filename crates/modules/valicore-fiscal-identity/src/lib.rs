//! Pure Italian fiscal identity algorithms; no geographic catalog or transport.

mod checksum;
mod names;
mod personal;
mod rea;
mod vat;

pub use checksum::{checksum, numeric_checksum};
pub use names::{name_code, normalize_name, surname_code};
pub use personal::{
    DecodeOptions, Decoded, MONTHS, OMOCODIA, OMOCODIA_POSITIONS, checked_code, decode,
    encode_with_belfiore, omocodes, omocodia_mask, structural_code, to_base, to_omocode,
    year_range,
};
pub use rea::{ItalianReaCheck, ItalianReaReport, validate_italian_rea};
pub use vat::{ItalianVatCheck, ItalianVatReport, validate_italian_vat};
