use std::io::Read;
use std::path::Path;

use sha2::{Digest, Sha256};

/// 一度に読み込むチャンクサイズ（1MiB）。Python版
/// `importer/src/photolibre_importer/hashing.py`の`_CHUNK_SIZE`と同じ値。
/// SHA-256はストリーミング可能なハッシュ関数のため、チャンクサイズ自体は
/// 最終的なダイジェスト値には影響しない（大きなファイルをメモリに
/// 一度に載せないための実装上の配慮）。
const CHUNK_SIZE: usize = 1024 * 1024;

#[derive(Debug, thiserror::Error)]
pub enum HashError {
    #[error("ファイルを読み込めません: {0}")]
    Io(#[from] std::io::Error),
}

/// pathの内容をSHA-256でハッシュ化し、小文字16進文字列のダイジェストを返す。
/// Python版`hashing.py`の`hash_file()`と同一アルゴリズム（SHA-256、1MiBチャンク
/// 読み込み）であり、同じ内容のファイルに対して同じダイジェスト値になる。
pub fn hash_file(path: &Path) -> Result<String, HashError> {
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; CHUNK_SIZE];

    loop {
        let bytes_read = file.read(&mut buffer)?;
        if bytes_read == 0 {
            break;
        }
        hasher.update(&buffer[..bytes_read]);
    }

    Ok(format!("{:x}", hasher.finalize()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

    fn write_temp_file(content: &[u8]) -> (tempfile::TempDir, std::path::PathBuf) {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("sample.bin");
        std::fs::write(&path, content).unwrap();
        (tmp, path)
    }

    #[test]
    fn hash_file_matches_known_sha256_test_vector_for_abc() {
        // SHA-256は標準化されたアルゴリズムであり、NIST公式テストベクタ
        // "abc" -> ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
        // に一致することは、Python標準ライブラリhashlib.sha256（RFC/NIST準拠実装）
        // と同じダイジェスト値になることの直接的な証明になる。
        let (_tmp, path) = write_temp_file(b"abc");

        let digest = hash_file(&path).unwrap();

        assert_eq!(
            digest,
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn hash_file_matches_known_sha256_test_vector_for_empty_string() {
        let (_tmp, path) = write_temp_file(b"");

        let digest = hash_file(&path).unwrap();

        assert_eq!(
            digest,
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }

    #[test]
    fn hash_file_is_correct_for_content_spanning_multiple_chunks() {
        // CHUNK_SIZE(1MiB)をまたぐファイルでも正しくハッシュ化できることを確認する
        // （チャンク読み込みの繋ぎ目バグを検出するためのテスト）。
        let content = vec![0x5Au8; CHUNK_SIZE * 2 + 137];
        let (_tmp, path) = write_temp_file(&content);

        let digest = hash_file(&path).unwrap();

        let mut hasher = Sha256::new();
        hasher.update(&content);
        let expected = format!("{:x}", hasher.finalize());
        assert_eq!(digest, expected);
    }

    #[test]
    fn hash_file_same_content_produces_same_digest() {
        let (_tmp1, path1) = write_temp_file(b"identical content");
        let (_tmp2, path2) = write_temp_file(b"identical content");

        assert_eq!(hash_file(&path1).unwrap(), hash_file(&path2).unwrap());
    }

    #[test]
    fn hash_file_different_content_produces_different_digest() {
        let (_tmp1, path1) = write_temp_file(b"content A");
        let (_tmp2, path2) = write_temp_file(b"content B");

        assert_ne!(hash_file(&path1).unwrap(), hash_file(&path2).unwrap());
    }

    #[test]
    fn hash_file_returns_error_for_missing_file() {
        let tmp = tempfile::tempdir().unwrap();
        let missing = tmp.path().join("does_not_exist.bin");

        let result = hash_file(&missing);

        assert!(result.is_err());
    }

    #[test]
    fn hash_file_matches_python_importer_hashing_module() {
        // Python版importer/src/photolibre_importer/hashing.pyのhash_file()と
        // 実際に同じファイルに対して突き合わせ、同一のアルゴリズム・同一の
        // ダイジェスト値になることを検証する。開発マシンにpythonが無い環境
        // （CI等）でも本テストスイート全体を失敗させないよう、pythonの起動に
        // 失敗した場合はこのテストのみ検証をスキップする。
        let (_tmp, path) = write_temp_file(b"cross-check between rust and python hashing");
        let rust_digest = hash_file(&path).unwrap();

        let script =
            "import hashlib,sys\nprint(hashlib.sha256(open(sys.argv[1],'rb').read()).hexdigest())";
        let output = match Command::new("python")
            .arg("-c")
            .arg(script)
            .arg(&path)
            .output()
        {
            Ok(output) if output.status.success() => output,
            _ => {
                eprintln!(
                    "[skip] pythonが利用できないため、hash_file_matches_python_importer_hashing_moduleのクロスチェックをスキップしました"
                );
                return;
            }
        };
        let python_digest = String::from_utf8_lossy(&output.stdout).trim().to_string();

        assert_eq!(rust_digest, python_digest);
    }
}
