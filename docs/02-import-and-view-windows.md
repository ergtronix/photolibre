# 2. Windows側: インポートとビュワーでの閲覧

macOS側でエクスポートした写真データ（[01-export-macos.md](01-export-macos.md)参照）を、Windows上でarchive.dbへ統合し、PhotoLibreアプリで閲覧します。

前提: [Python 3.11+](https://www.python.org/downloads/)がインストール済みであること（インポーターの実行に必要です）。閲覧アプリ「PhotoLibre」はインストーラーをダウンロードして実行するだけなので、Node.js・Rustのインストールは不要です（ソースからビルドしたい開発者向けの手順は、本ページ末尾の「開発者向け: ソースからビルドする」を参照してください）。

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

## 2-5. PhotoLibreのインストールと起動

### 旧版（v0.2.0、アプリ名「viewer」）をお使いの方へ

v0.3.0からアプリの名前が「viewer」から「PhotoLibre」に変わりました。名前が変わったため、PhotoLibreは旧版とは**別のアプリ**としてインストールされます。**先に、旧版の「viewer」をアンインストールしてください。**「設定」→「アプリ」→「インストールされているアプリ」から「viewer」を選び、「アンインストール」を実行します。

- アーカイブフォルダの場所の設定は旧版と同じ場所に保存されるため、PhotoLibreがそのまま引き継ぎます。
- 旧版のアンインストール中に「Delete the application data」というチェック項目が表示されます。**ここにはチェックを入れないでください**（チェックを入れると、引き継がれるはずのアーカイブフォルダの場所の設定が消え、PhotoLibreの初回起動時にもう一度フォルダを選ぶことになります）。

### インストール

1. [https://github.com/ergtronix/photolibre/releases/latest](https://github.com/ergtronix/photolibre/releases/latest)を開き、インストーラー`PhotoLibre_0.3.0_x64-setup.exe`（`0.3.0`の部分は版番号です。最新版をダウンロードしてください）をダウンロードします。
2. ダウンロードしたファイルをダブルクリックして実行します。
   - 初回実行時にWindows SmartScreen（「Windows によって PC が保護されました」）が警告を表示することがあります。未署名の無料OSSアプリであることによる既知の挙動です。対処法は[README.mdの「Windows SmartScreenの警告について」](../README.md#windows-smartscreenの警告について)を参照してください。
   - 管理者権限は不要です（お使いのユーザーだけにインストールされます）。
3. **インストーラーの画面は英語です。** 次の順に画面が表示されるので、案内に従って進めてください。

   1. 「Welcome to PhotoLibre Setup」: [Next >]をクリックします。
      <!-- スクリーンショット: Welcome to PhotoLibre Setup -->
   2. 「Already Installed」（「Choose how you want to install PhotoLibre」）: **PhotoLibreがすでに入っている場合にだけ**表示されます。古い版が入っている場合は、「Uninstall before installing」（初期選択）と「Do not uninstall」（上書きインストール）のどちらかを選ぶ画面です。画面の案内に従って選んでください。すでに同じ版のPhotoLibreが入っている場合は、選択肢が「Add/Reinstall components」（初期選択）と「Uninstall PhotoLibre」になります。入れ直すだけの場合は、「Add/Reinstall components」のまま進めてください（「Uninstall PhotoLibre」を選ぶとアンインストールされます）。
      <!-- スクリーンショット: Already Installed -->
   3. 「Choose Install Location」: インストール先を選ぶ画面です。初期値は`C:\Users\<あなたのユーザー名>\AppData\Local\PhotoLibre`で、必要な容量は約17MBです。通常は、そのままで構いません。
      <!-- スクリーンショット: Choose Install Location -->
   4. 「Installing」: インストールの進捗が表示されます。
      <!-- スクリーンショット: Installing -->
   5. 「Installation Complete」: [Next >]をクリックします。
      <!-- スクリーンショット: Installation Complete -->
   6. 「Completing PhotoLibre Setup」: 「Run PhotoLibre」（今すぐPhotoLibreを起動する）のチェックはそのままにしておくと、[Finish]で起動します。「Create desktop shortcut」（デスクトップにショートカットを作る）は、ショートカットが必要かどうかに合わせて、チェックを入れる／外してから、[Finish]をクリックします。
      <!-- スクリーンショット: Completing PhotoLibre Setup -->

   > PhotoLibreが起動したままインストールを始めると、「PhotoLibre is running! Click OK to kill it」と表示されます。[OK]をクリックするとPhotoLibreが終了し、インストールが続きます。あらかじめPhotoLibreを閉じておくと確実です。

4. インストール完了後は、スタートメニューの「PhotoLibre」から起動します（「Create desktop shortcut」にチェックを入れた場合は、デスクトップのショートカットからも起動できます）。
   - インストール先のフォルダを開きたい場合は、スタートメニューの「PhotoLibre」を右クリックして「ファイルの場所を開く」を選びます。

### 初回起動

初回起動時に「フォルダを選択」画面が表示されるので、2-4で指定した`--archive-root`のフォルダ（例: `E:\PhotoArchive`）を選択してください（すでにアーカイブフォルダの設定が残っている場合は、この画面は表示されず、そのまま写真一覧が表示されます）。以降は自動的にこのフォルダが記憶され、次回起動時からはそのまま写真一覧が表示されます。

別のアーカイブフォルダに切り替えたい場合は、アプリ左上の「アーカイブフォルダを変更」から再選択できます。

PhotoLibreを起動した状態で、もう一度起動しようとすると、新しいウィンドウは開かず、起動中の画面が前面に表示されます（二重起動防止）。

### 更新（新しい版へ）

新しい版のインストーラーを実行するだけで更新できます。アーカイブフォルダの場所の設定は、そのまま残ります。

### アンインストール

「設定」→「アプリ」→「インストールされているアプリ」→「PhotoLibre」→「アンインストール」を実行します。

途中の画面に「Delete the application data」というチェック項目があります。チェックを入れてアンインストールすると、アーカイブフォルダの場所の設定など、PhotoLibreがお使いのユーザー領域に保存しているデータが削除されます。**写真のアーカイブは削除されません**（アーカイブは、アプリの外の、ご自身で選んだフォルダに保存されているためです）。

---

## 2-6. デジタルカメラ・SDカード・スマホからの取り込み

初回のPhotos.app/iPhoto統合（2-1〜2-4）とは別に、デジタルカメラのSDカードやスマホから直接、写真/動画をアーカイブへ追加できます。こちらはPythonのインポーター（`importer/`）を使わず、PhotoLibreアプリ内で完結します。

### 使い方

1. PhotoLibreのサイドバーにある「写真を取り込む」ボタンをクリックします。
2. 「写真を取り込む」画面に、「次の画面は、Windows標準のフォルダ選択画面です。中の写真は表示されません。フォルダを選ぶと、次の画面で写真の一覧を確認できます。」という案内文が表示されます。内容を確認したら「フォルダを選択」をクリックします。
3. Windows標準のフォルダ選択画面が開くので、取り込みたい写真/動画が入っているフォルダを指定します。
   - デジタルカメラ・SDカードの場合は、SDカードをPCに挿してエクスプローラーで見えるフォルダ（例: `DCIM`配下）をそのまま指定できます。
   - **スマホの場合は、あらかじめWindowsのフォトアプリ/エクスプローラーで任意のフォルダにコピーしてから、そのフォルダを指定してください。** スマホをUSB接続したまま直接デバイス内を読み取る方式には対応していません。
4. フォルダの走査が終わると、プレビュー画面に新規・重複・非対応形式・読み込みエラーの件数と、サムネイル付きの一覧が表示されます。取り込みたいファイルにチェックが入っていることを確認してください（新規ファイルは自動で選択済み、重複と判定されたファイルは自動で選択解除されています）。
5. 必要であれば「取り込み先アルバム」で新規アルバムの作成、または既存アルバムへの追加を選びます。
6. 「〇件を取り込む」を実行すると、選択したファイルがアーカイブへコピーされ、`archive.db`に登録されます。**この操作は取り消せません**（Ctrl+Zでの取り消しには対応していません）。完了後の画面で「取り込んだ写真を見る」「閉じる」のどちらを選んでも、新しく取り込んだ写真や、追加・作成したアルバムは、サイドバーと写真一覧にすぐ反映されます。

### 対応していない形式（既知の制限）

- **`.heic`/`.heif`（iPhoneの既定の写真形式）、および各社のRAW形式（`.cr2`/`.nef`/`.dng`/`.arw`等）はv1では非対応です。** PhotoLibreが内部で使っている画像デコードライブラリ（`image`クレート）がこれらの形式のデコーダを持たないためで、拡張子の見落としではなく構造的な制約です。取り込みプレビューの「非対応形式のためスキップ」件数として表示されますが、コピーもDB登録もされません。
  - iPhoneでこの機能を使いたい場合は、iPhone側のカメラ設定を「互換性優先」（`.heic`ではなく`.jpg`で保存）に変更してから撮影するか、Windowsの「フォト」アプリ等で事前にJPEGへ変換してからフォルダにコピーしてください。
  - 将来的にHEIC対応クレートを追加する形での改善を検討していますが、現時点では未対応です。
- 拡張子の無いファイル・写真/動画と無関係なファイル（`Thumbs.db`等）は、エラーや警告なしに単純に無視されます。

### 撮影日時が「推定日時」と表示される場合について

写真のEXIFに撮影日時（`DateTimeOriginal`）が記録されていない場合や、動画ファイル（本アプリが使うライブラリでは動画コンテナ内の撮影日時を読み取れません）の場合、代わりにファイルの更新日時（mtime）を撮影日時として使用します。この場合、取り込みプレビューのサムネイルに**「推定日時」**というバッジが表示され、実際のEXIF撮影日時とは区別できるようになっています。SDカードのコピー方法によってはmtimeが撮影日と一致しないことがあるため、日付順の並びに違和感がある場合はこのバッジの有無を確認してください。

### 壊れたファイル・読み取れないファイルが混ざっていた場合

フォルダの中に破損したファイルや、走査後に読み取れなくなったファイル（SDカードの接触不良等）が混ざっていても、それらのファイルだけがスキップ（プレビューでは「読み込みエラー」、取り込み実行後は「コピーに失敗」として件数表示）され、他の正常なファイルの取り込みは続行されます。ただし、書き込み（コピー）が3件連続で失敗した場合は、アーカイブの保存先ディスクの空き容量不足など環境側の問題を疑い、残りの処理を中断します。中断した場合はプレビュー画面に案内が表示されるので、保存先の空き容量等を確認してから再度お試しください。

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
