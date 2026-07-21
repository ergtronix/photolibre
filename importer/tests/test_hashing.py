import hashlib

from photolibre_importer.hashing import hash_file


def test_hash_file_matches_hashlib_sha256(tmp_path):
    target = tmp_path / "sample.txt"
    target.write_bytes(b"hello photolibre")

    expected = hashlib.sha256(b"hello photolibre").hexdigest()

    assert hash_file(target) == expected


def test_hash_file_is_stable_across_calls(tmp_path):
    target = tmp_path / "sample.bin"
    target.write_bytes(bytes(range(256)) * 100)

    assert hash_file(target) == hash_file(target)


def test_hash_file_differs_for_different_content(tmp_path):
    file_a = tmp_path / "a.txt"
    file_b = tmp_path / "b.txt"
    file_a.write_bytes(b"content A")
    file_b.write_bytes(b"content B")

    assert hash_file(file_a) != hash_file(file_b)


def test_hash_file_handles_large_file_in_chunks(tmp_path):
    target = tmp_path / "large.bin"
    # チャンク読み込みの境界（デフォルト実装は64KB単位を想定）を跨ぐサイズ
    target.write_bytes(b"x" * (1024 * 1024 + 123))

    expected = hashlib.sha256(target.read_bytes()).hexdigest()

    assert hash_file(target) == expected
