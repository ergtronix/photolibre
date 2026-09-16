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
    /// この写真が属するアルバム名。検索結果でのみ設定し、一覧表示では
    /// 常にNone（N+1クエリを避け、大量件数の一覧表示を遅くしないため）。
    pub album_names: Option<Vec<String>>,
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

/// ローカルフォルダ取り込み（`import`モジュール、TASK-053/TASK-381）専用の
/// 書き込み用DTO。読み取り専用の`Photo`とは意図的に分離する: `Photo`は
/// 一覧・検索表示のために`album_names`等の派生情報を持つが、`NewPhoto`は
/// insert時に呼び出し側が実際に埋める値のみを持つ。`id`・`date_added`・
/// `imported_at`・`source`はinsert関数（`insert_local_import_photos`）側で
/// 生成するため、ここには含めない。
///
/// `width`/`height`は現段階（C-2）では計算しない
/// （`import::metadata`が画像サイズを読み取らないため）。将来`image`クレートで
/// デコードして埋める改善はスコープ外として先送りする。
// TASK-381（C-2）: C-3（Tauriコマンド層）まで本番コードから構築されないため、
// 一時的にdead_code警告を抑制する（テスト内では既に構築・使用している）。
#[allow(dead_code)]
#[derive(Debug, Clone, PartialEq)]
pub struct NewPhoto {
    pub filename: String,
    pub filepath: String,
    pub media_type: String,
    pub date_taken: Option<String>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub camera_make: Option<String>,
    pub camera_model: Option<String>,
    pub focal_length: Option<f64>,
    pub aperture: Option<f64>,
    pub shutter_speed: Option<String>,
    pub iso: Option<i64>,
    pub filesize: Option<i64>,
    pub sha256: String,
}

/// `commit_new_import_items`の結果サマリ。C-3（Tauriコマンド層）が
/// `commit_import_command`のレスポンスを組み立てる際にそのまま利用する想定。
#[allow(dead_code)]
#[derive(Debug, Clone, PartialEq, Default)]
pub struct ImportCommitSummary {
    /// 実際にコピー・insertされた写真のID一覧（insert順）。
    /// `list_photos_by_ids`と組み合わせて「取り込んだ写真だけを見る」ビューに使う。
    pub inserted_photo_ids: Vec<String>,
    /// スキップした重複件数（archive.db内の既存写真との重複／同一バッチ内
    /// 重複の合計）。`_duplicates/`への退避は行わないため、カウントのみ。
    pub duplicate_count: usize,
}
