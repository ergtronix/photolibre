# 2. Windows側: インポートとビュワーでの閲覧

macOS側でエクスポートした写真データ（[01-export-macos.md](01-export-macos.md)参照）を、Windows上でarchive.dbへ統合し、ビュワーアプリで閲覧します。

前提: [Python 3.11+](https://www.python.org/downloads/)がインストール済みであること（インポーターの実行に必要です）。ビュワーアプリはインストーラーをダウンロードして実行するだけなので、Node.js・Rustのインストールは不要です（ソースからビルドしたい開発者向けの手順は、本ページ末尾の「開発者向け: ソースからビルドする」を参照してください）。

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

1. [GitHub Releases](https://github.com/ergtronix/photolibre/releases)ページを開き、最新版のインストーラー（NSIS版の`.exe`、またはMSI版の`.msi`）をダウンロードします。
2. ダウンロードしたファイルをダブルクリックして実行し、画面の指示に従ってインストールします。
   - 初回実行時にWindows SmartScreenが警告を表示することがあります。未署名の無料OSSアプリであることによる既知の挙動です。対処法は[README.mdの「Windows SmartScreenの警告について」](../README.md#windows-smartscreenの警告について)を参照してください。
3. インストール完了後、スタートメニューまたはデスクトップのショートカットからアプリ（「viewer」）を起動します。

初回起動時に「フォルダを選択」画面が表示されるので、2-4で指定した`--archive-root`のフォルダ（例: `E:\PhotoArchive`）を選択してください。以降は自動的にこのフォルダが記憶され、次回起動時からはそのまま写真一覧が表示されます。

別のアーカイブフォルダに切り替えたい場合は、アプリ左上の「アーカイブフォルダを変更」から再選択できます。

---

## 開発者向け: ソースからビルドする

エンドユーザーはインストーラーをダウンロードするだけで利用できます。以下はコントリビューター・開発者向けの、ソースからビルドする手順です。

前提: [Node.js](https://nodejs.org/)・[Rust](https://www.rust-lang.org/tools/install)・MSVC Build Tools（Windows）がインストール済みであること。

```powershell
git clone https://github.com/ergtronix/photolibre.git
cd photolibre/viewer
npm install
npm run tauri build
```

ビルドが成功すると、`viewer/src-tauri/target/release/bundle/`配下にインストーラーが生成されます（NSIS: `nsis/*.exe`、MSI: `msi/*.msi`）。

インストーラーを都度ビルドせず、開発サーバーで素早く動作確認したい場合は以下も使えます。

```powershell
npm run tauri dev
```
