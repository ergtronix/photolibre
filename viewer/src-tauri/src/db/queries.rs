use rusqlite::{params_from_iter, Connection, Row};

use super::models::{Album, Photo, PhotoFilter};
use super::DbError;

fn row_to_photo(row: &Row) -> rusqlite::Result<Photo> {
    Ok(Photo {
        id: row.get("id")?,
        filename: row.get("filename")?,
        filepath: row.get("filepath")?,
        media_type: row.get("media_type")?,
        date_taken: row.get("date_taken")?,
        date_added: row.get("date_added")?,
        latitude: row.get("latitude")?,
        longitude: row.get("longitude")?,
        favorite: row.get::<_, i64>("favorite")? != 0,
        hidden: row.get::<_, i64>("hidden")? != 0,
        title: row.get("title")?,
        description: row.get("description")?,
        width: row.get("width")?,
        height: row.get("height")?,
        source: row.get("source")?,
    })
}

pub fn list_photos(conn: &Connection, filter: &PhotoFilter) -> Result<Vec<Photo>, DbError> {
    let mut sql = String::from(
        "SELECT DISTINCT p.id, p.filename, p.filepath, p.media_type, p.date_taken, \
         p.date_added, p.latitude, p.longitude, p.favorite, p.hidden, p.title, \
         p.description, p.width, p.height, p.source \
         FROM photos p",
    );
    let mut conditions: Vec<String> = Vec::new();
    let mut args: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if filter.keyword.is_some() {
        sql.push_str(
            " JOIN photo_keywords pk ON pk.photo_id = p.id \
              JOIN keywords k ON k.id = pk.keyword_id",
        );
    }

    if filter.favorite_only {
        conditions.push("p.favorite = 1".to_string());
    }
    if let Some(year) = filter.year {
        conditions.push("strftime('%Y', p.date_taken) = ?".to_string());
        args.push(Box::new(format!("{year:04}")));
    }
    if let Some(month) = filter.month {
        conditions.push("strftime('%m', p.date_taken) = ?".to_string());
        args.push(Box::new(format!("{month:02}")));
    }
    if let Some(keyword) = &filter.keyword {
        conditions.push("k.name = ?".to_string());
        args.push(Box::new(keyword.clone()));
    }

    if !conditions.is_empty() {
        sql.push_str(" WHERE ");
        sql.push_str(&conditions.join(" AND "));
    }
    sql.push_str(" ORDER BY p.date_taken ASC");

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(
        params_from_iter(args.iter().map(|a| a.as_ref())),
        row_to_photo,
    )?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(DbError::from)
}

pub fn list_albums(conn: &Connection) -> Result<Vec<Album>, DbError> {
    let mut stmt = conn.prepare(
        "SELECT a.id, a.name, a.album_type, a.source, COUNT(ap.photo_id) AS photo_count \
         FROM albums a \
         LEFT JOIN album_photos ap ON ap.album_id = a.id \
         GROUP BY a.id, a.name, a.album_type, a.source \
         ORDER BY a.name ASC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(Album {
            id: row.get("id")?,
            name: row.get("name")?,
            album_type: row.get("album_type")?,
            source: row.get("source")?,
            photo_count: row.get("photo_count")?,
        })
    })?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(DbError::from)
}

pub fn list_album_photos(conn: &Connection, album_id: &str) -> Result<Vec<Photo>, DbError> {
    let mut stmt = conn.prepare(
        "SELECT p.id, p.filename, p.filepath, p.media_type, p.date_taken, p.date_added, \
         p.latitude, p.longitude, p.favorite, p.hidden, p.title, p.description, \
         p.width, p.height, p.source \
         FROM photos p \
         JOIN album_photos ap ON ap.photo_id = p.id \
         WHERE ap.album_id = ? \
         ORDER BY ap.sort_order ASC, p.date_taken ASC",
    )?;
    let rows = stmt.query_map([album_id], row_to_photo)?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(DbError::from)
}

/// ファイル名・タイトル・説明に加えて、写真が属するアルバム名（左ペインの
/// イベント名）でも検索できるようにする。デジカメ取り込みの写真はファイル名に
/// 意味のある文字列を含まないことが多く、アルバム名検索がないと実質検索できない。
pub fn search_photos(conn: &Connection, query: &str) -> Result<Vec<Photo>, DbError> {
    let pattern = format!("%{query}%");
    let mut stmt = conn.prepare(
        "SELECT DISTINCT p.id, p.filename, p.filepath, p.media_type, p.date_taken, p.date_added, \
         p.latitude, p.longitude, p.favorite, p.hidden, p.title, p.description, \
         p.width, p.height, p.source \
         FROM photos p \
         LEFT JOIN album_photos ap ON ap.photo_id = p.id \
         LEFT JOIN albums a ON a.id = ap.album_id \
         WHERE p.filename LIKE ?1 OR p.title LIKE ?1 OR p.description LIKE ?1 OR a.name LIKE ?1 \
         ORDER BY p.date_taken ASC",
    )?;
    let rows = stmt.query_map([&pattern], row_to_photo)?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(DbError::from)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::create_test_schema;
    use rusqlite::Connection;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        create_test_schema(&conn);
        conn
    }

    fn insert_photo(
        conn: &Connection,
        id: &str,
        filename: &str,
        date_taken: &str,
        favorite: bool,
        source: &str,
    ) {
        conn.execute(
            "INSERT INTO photos (id, filename, filepath, media_type, date_taken, favorite, hidden, source) \
             VALUES (?1, ?2, ?2, 'photo', ?3, ?4, 0, ?5)",
            rusqlite::params![id, filename, date_taken, favorite as i64, source],
        )
        .unwrap();
    }

    #[test]
    fn list_photos_returns_all_photos_ordered_by_date() {
        let conn = setup();
        insert_photo(
            &conn,
            "1",
            "b.jpg",
            "2020-02-01T00:00:00",
            false,
            "source_a",
        );
        insert_photo(
            &conn,
            "2",
            "a.jpg",
            "2020-01-01T00:00:00",
            false,
            "source_a",
        );

        let photos = list_photos(&conn, &PhotoFilter::default()).unwrap();

        assert_eq!(photos.len(), 2);
        assert_eq!(photos[0].id, "2");
        assert_eq!(photos[1].id, "1");
    }

    #[test]
    fn list_photos_filters_favorite_only() {
        let conn = setup();
        insert_photo(&conn, "1", "a.jpg", "2020-01-01T00:00:00", true, "source_a");
        insert_photo(
            &conn,
            "2",
            "b.jpg",
            "2020-01-02T00:00:00",
            false,
            "source_a",
        );

        let filter = PhotoFilter {
            favorite_only: true,
            ..Default::default()
        };
        let photos = list_photos(&conn, &filter).unwrap();

        assert_eq!(photos.len(), 1);
        assert_eq!(photos[0].id, "1");
    }

    #[test]
    fn list_photos_filters_by_year_and_month() {
        let conn = setup();
        insert_photo(
            &conn,
            "1",
            "a.jpg",
            "2020-01-15T00:00:00",
            false,
            "source_a",
        );
        insert_photo(
            &conn,
            "2",
            "b.jpg",
            "2020-02-15T00:00:00",
            false,
            "source_a",
        );
        insert_photo(
            &conn,
            "3",
            "c.jpg",
            "2021-01-15T00:00:00",
            false,
            "source_a",
        );

        let filter = PhotoFilter {
            year: Some(2020),
            month: Some(1),
            ..Default::default()
        };
        let photos = list_photos(&conn, &filter).unwrap();

        assert_eq!(photos.len(), 1);
        assert_eq!(photos[0].id, "1");
    }

    #[test]
    fn list_photos_filters_by_keyword() {
        let conn = setup();
        insert_photo(
            &conn,
            "1",
            "a.jpg",
            "2020-01-01T00:00:00",
            false,
            "source_a",
        );
        insert_photo(
            &conn,
            "2",
            "b.jpg",
            "2020-01-02T00:00:00",
            false,
            "source_a",
        );
        conn.execute("INSERT INTO keywords (id, name) VALUES (1, 'family')", [])
            .unwrap();
        conn.execute(
            "INSERT INTO photo_keywords (photo_id, keyword_id) VALUES ('1', 1)",
            [],
        )
        .unwrap();

        let filter = PhotoFilter {
            keyword: Some("family".to_string()),
            ..Default::default()
        };
        let photos = list_photos(&conn, &filter).unwrap();

        assert_eq!(photos.len(), 1);
        assert_eq!(photos[0].id, "1");
    }

    #[test]
    fn list_albums_returns_photo_count() {
        let conn = setup();
        insert_photo(
            &conn,
            "1",
            "a.jpg",
            "2020-01-01T00:00:00",
            false,
            "source_a",
        );
        insert_photo(
            &conn,
            "2",
            "b.jpg",
            "2020-01-02T00:00:00",
            false,
            "source_a",
        );
        conn.execute(
            "INSERT INTO albums (id, name, source) VALUES ('alb1', '旅行', 'source_a')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO album_photos (album_id, photo_id) VALUES ('alb1', '1'), ('alb1', '2')",
            [],
        )
        .unwrap();

        let albums = list_albums(&conn).unwrap();

        assert_eq!(albums.len(), 1);
        assert_eq!(albums[0].name, "旅行");
        assert_eq!(albums[0].photo_count, 2);
    }

    #[test]
    fn list_album_photos_returns_only_photos_in_that_album() {
        let conn = setup();
        insert_photo(
            &conn,
            "1",
            "a.jpg",
            "2020-01-01T00:00:00",
            false,
            "source_a",
        );
        insert_photo(
            &conn,
            "2",
            "b.jpg",
            "2020-01-02T00:00:00",
            false,
            "source_a",
        );
        conn.execute(
            "INSERT INTO albums (id, name, source) VALUES ('alb1', '旅行', 'source_a')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO album_photos (album_id, photo_id) VALUES ('alb1', '1')",
            [],
        )
        .unwrap();

        let photos = list_album_photos(&conn, "alb1").unwrap();

        assert_eq!(photos.len(), 1);
        assert_eq!(photos[0].id, "1");
    }

    #[test]
    fn search_photos_matches_filename_case_insensitively() {
        let conn = setup();
        insert_photo(
            &conn,
            "1",
            "Sunset.jpg",
            "2020-01-01T00:00:00",
            false,
            "source_a",
        );
        insert_photo(
            &conn,
            "2",
            "Mountain.jpg",
            "2020-01-02T00:00:00",
            false,
            "source_a",
        );

        let photos = search_photos(&conn, "sunset").unwrap();

        assert_eq!(photos.len(), 1);
        assert_eq!(photos[0].id, "1");
    }

    #[test]
    fn search_photos_returns_empty_when_no_match() {
        let conn = setup();
        insert_photo(
            &conn,
            "1",
            "a.jpg",
            "2020-01-01T00:00:00",
            false,
            "source_a",
        );

        let photos = search_photos(&conn, "nonexistent").unwrap();

        assert!(photos.is_empty());
    }

    #[test]
    fn search_photos_matches_album_name_for_photos_with_no_meaningful_filename() {
        let conn = setup();
        // デジカメ取り込みは"IMG_0001.jpg"のようなファイル名で、検索語を含まないことが多い
        insert_photo(
            &conn,
            "1",
            "IMG_0001.jpg",
            "2020-01-01T00:00:00",
            false,
            "source_a",
        );
        insert_photo(
            &conn,
            "2",
            "IMG_0002.jpg",
            "2020-01-02T00:00:00",
            false,
            "source_a",
        );
        conn.execute(
            "INSERT INTO albums (id, name, source) VALUES ('alb1', '七五三', 'source_a')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO album_photos (album_id, photo_id) VALUES ('alb1', '1')",
            [],
        )
        .unwrap();

        let photos = search_photos(&conn, "七五三").unwrap();

        assert_eq!(photos.len(), 1);
        assert_eq!(photos[0].id, "1");
    }

    #[test]
    fn search_photos_does_not_duplicate_a_photo_belonging_to_multiple_matching_albums() {
        let conn = setup();
        insert_photo(
            &conn,
            "1",
            "IMG_0001.jpg",
            "2020-01-01T00:00:00",
            false,
            "source_a",
        );
        conn.execute(
            "INSERT INTO albums (id, name, source) VALUES ('alb1', '運動会2020', 'source_a'), ('alb2', '運動会2020写真', 'source_b')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO album_photos (album_id, photo_id) VALUES ('alb1', '1'), ('alb2', '1')",
            [],
        )
        .unwrap();

        let photos = search_photos(&conn, "運動会").unwrap();

        assert_eq!(photos.len(), 1);
    }
}
