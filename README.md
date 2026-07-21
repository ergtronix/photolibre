# photolibre

Apple Photos/iPhotoの独自仕様から写真を解放し、オープンな形式（SQLite + XMPサイドカー）で管理する、クロスプラットフォーム対応の写真アーカイブ・閲覧ツールです。

---

## 機能

- Apple Photos/iPhotoライブラリを、オープンなSQLite（`archive.db`）+ XMPサイドカー形式のアーカイブに変換するインポーター
- Windows/Linux/macOSで動くクロスプラットフォームの写真閲覧アプリ（Tauri + React）
- （予定）デジカメ等からの写真取り込みにも対応

---

## 技術スタック

| 項目 | 内容 |
|---|---|
| インポーター（`importer/`） | Python 3.11+ |
| 閲覧アプリ（`viewer/`） | Tauri 2.x (Rust) + React 18 + TypeScript |

---

## セットアップ

```bash
# リポジトリをクローン
git clone https://github.com/ergtronix/photolibre.git
cd photolibre
```

（開発中。詳細な手順は`importer/`・`viewer/`それぞれのREADMEに追記予定）

---

## 使い方

開発中のため未定。MVP完成後に追記する。

---

## ライセンス

Private（開発中。将来的にOSSライセンスを選定しGitHub公開予定）
