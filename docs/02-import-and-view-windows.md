# 2. Windows側: インポートとビュワーでの閲覧

macOS側でエクスポートした写真データ（[01-export-macos.md](01-export-macos.md)参照）を、Windows上でarchive.dbへ統合し、ビュワーアプリで閲覧します。

前提: [Python 3.11+](https://www.python.org/downloads/) と [Node.js](https://nodejs.org/)・[Rust](https://www.rust-lang.org/tools/install) がインストール済みであること。

以降のコマンドは、すべて**Windows PowerShell**で実行します。スタートメニューで「PowerShell」と検索して起動してください（「Windows Terminal」でも構いません。コマンドプロンプト(cmd.exe)ではありません）。

---

## 2-1. リポジトリの取得

```powershell
git clone https://github.com/ergtronix/photolibre.git
cd photolibre
```

---

## 2-2. インポーターのセットアップ

```powershell
cd importer
python -m venv .venv
.venv\Scripts\pip install -e .
```

---

## 2-3. エクスポートしたデータの配置

外付けドライブ（またはそこからコピーしたフォルダ）を、Windows PC上の任意の場所（Gitリポジトリの外を推奨）に用意します。

- Photos.appのエクスポート先（`01-export-macos.md`の1-2で作成したフォルダ、`.osxphotos_export.db`を含む）
- iPhotoのコピー先（1-3を実施した場合のみ。`AlbumData.xml`を含む）

例:
```
E:\PhotoImport\
├── source_a_photos_app\   ← Photos.appのエクスポート先
└── source_b_iphoto\       ← iPhotoのコピー先（iPhotoをお使いの場合のみ）
```

---

## 2-4. インポーターの実行

```powershell
cd importer
.venv\Scripts\python scripts\run_import.py `
  --source-a "E:\PhotoImport\source_a_photos_app" `
  --source-b "E:\PhotoImport\source_b_iphoto" `
  --archive-root "E:\PhotoArchive"
```

- `--archive-root`に指定したフォルダに`archive.db`と整理された写真ファイルが作成されます。
- Source A/B原本フォルダには一切書き込み・削除を行いません（実行後に自動で検証されます）。
- 実行結果として、取り込み件数・スキップ件数・重複検出件数・アルバム統合件数がコンソールに表示されます。

> **既知の制限:** 現時点では`--source-a`・`--source-b`の両方の指定が必須です。iPhotoライブラリをお持ちでない場合の単独実行対応は今後の改善課題です。

---

## 2-5. ビュワーアプリの起動

```powershell
cd viewer
npm install
npm run tauri dev
```

初回起動時に「フォルダを選択」画面が表示されるので、2-4で指定した`--archive-root`のフォルダ（例: `E:\PhotoArchive`）を選択してください。以降は自動的にこのフォルダが記憶され、次回起動時からはそのまま写真一覧が表示されます。

別のアーカイブフォルダに切り替えたい場合は、アプリ左上の「アーカイブフォルダを変更」から再選択できます。

> **補足:** 現時点ではWindows向けのインストーラー（.msi/.exe）は未整備で、`npm run tauri dev`による開発サーバー起動が導入方法になります。パッケージ化されたインストーラーの整備は今後の改善課題です。
