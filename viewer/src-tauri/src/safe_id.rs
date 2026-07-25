/// 外部データ由来のID文字列（photo_id等）をファイルパスの一部として使う前に、
/// パス区切り文字や`..`を含まない安全な形式かどうかを検証する。
///
/// photo_idはインポーターがエクスポート元（.osxphotos_export.dbのuuid等）から
/// そのまま取り込む値であり、形式の保証がない。検証なしにファイルパスへ
/// 結合すると、細工されたuuidによるパストラバーサル（archive_root外への
/// 任意ファイル読み書き・削除）に悪用されうるため、キャッシュパスを組み立てる
/// 前に必ずこの検証を通す。
pub fn is_safe_id(id: &str) -> bool {
    !id.is_empty()
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_typical_uuid() {
        assert!(is_safe_id("e813a7e8-fd06-4728-b005-6343575c8ae2"));
    }

    #[test]
    fn rejects_empty_string() {
        assert!(!is_safe_id(""));
    }

    #[test]
    fn rejects_path_traversal_sequence() {
        assert!(!is_safe_id("../../../etc/passwd"));
    }

    #[test]
    fn rejects_forward_slash() {
        assert!(!is_safe_id("a/b"));
    }

    #[test]
    fn rejects_backslash() {
        assert!(!is_safe_id("a\\b"));
    }

    #[test]
    fn rejects_absolute_path() {
        assert!(!is_safe_id("/etc/passwd"));
    }

    #[test]
    fn rejects_dot_segment() {
        assert!(!is_safe_id("."));
        assert!(!is_safe_id(".."));
    }
}
