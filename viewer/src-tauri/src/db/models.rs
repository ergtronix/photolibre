use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Photo {
    pub id: String,
    pub filename: String,
    pub filepath: String,
    pub media_type: String,
    pub date_taken: Option<String>,
    pub date_added: Option<String>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub favorite: bool,
    pub hidden: bool,
    pub title: Option<String>,
    pub description: Option<String>,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Album {
    pub id: String,
    pub name: String,
    pub album_type: String,
    pub source: String,
    pub photo_count: i64,
}

#[derive(Debug, Clone, Default)]
pub struct PhotoFilter {
    pub favorite_only: bool,
    pub year: Option<i32>,
    pub month: Option<u32>,
    pub keyword: Option<String>,
}
