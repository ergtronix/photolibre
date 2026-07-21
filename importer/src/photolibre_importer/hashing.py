import hashlib
from pathlib import Path

_CHUNK_SIZE = 1024 * 1024


def hash_file(path: Path | str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(_CHUNK_SIZE):
            digest.update(chunk)
    return digest.hexdigest()
