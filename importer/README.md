# photolibre importer

Apple Photos/iPhotoからエクスポートしたデータ（Source A: `osxphotos export`、Source B: iPhoto `AlbumData.xml`）を、
`archive.db`（SQLite）+ 日付フォルダ構造のオープンなアーカイブに変換するインポーター。

## セットアップ

```bash
cd importer
python -m venv .venv
./.venv/Scripts/pip install -e ".[dev]"   # Windows
# source .venv/bin/activate && pip install -e ".[dev]"  # macOS/Linux
```

## テスト実行

```bash
./.venv/Scripts/python -m pytest --cov=photolibre_importer --cov-report=term-missing
```

## モジュール構成

| モジュール | 役割 |
|---|---|
| `hashing.py` | SHA-256ハッシュ計算 |
| `schema.py` | archive.db（SQLite）スキーマ定義 |
| `layout.py` | `archive/photos/YYYY/MM/`への配置ロジック |
| `dedup.py` | ハッシュベース重複検出・`_duplicates/`への退避（非破壊） |
| `source_a.py` | Source A（`.osxphotos_export.db`のphotoinfo）読み込み |
| `source_b.py` | Source B（iPhoto `AlbumData.xml`）読み込み |
| `albums.py` | Source A/Bのアルバム名突合（完全一致のみ自動統合） |
| `integrate.py` | 統合結果をarchive.dbへ書き込み |
| `guard.py` | 原本データへの読み取り専用を保証するスナップショット比較 |

## 設計方針

- Source A/B原本（`apple_photos_raw/`）には**一切書き込み・削除を行わない**（読み取り専用）
- 重複ファイルは削除せず`archive/_duplicates/`へ退避し、正本との対応関係をDBに記録する
- アルバムは名称完全一致（正規化後）の場合のみ自動統合し、あいまいな場合は要確認リストに残す
