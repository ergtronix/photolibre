# 1. iMac（macOS）側: 写真ライブラリのエクスポート

photolibreは、古いiMacに溜まったApple Photos（Photos.app）・iPhotoのライブラリを外部メディアへエクスポートするところから始まります。**Automatorで組み立てる小さなアプリ**を使うことで、ターミナルへのコマンド手打ちなしに、ダイアログでの選択だけでエクスポートが完了します。

対象: macOS Big Sur以前の古いiMacで、Photos.appおよび（お使いであれば）iPhotoに写真が入っている場合。

---

## 1-1. エクスポートアプリの準備（初回のみ）

このリポジトリの[`tools/macos-export/`](../tools/macos-export/)フォルダに、エクスポート処理をまとめたシェルスクリプト（`export.sh`）と、それをAutomatorの「アプリケーション」として5分程度で組み立てる手順書（[`BUILD.md`](../tools/macos-export/BUILD.md)）を同梱しています。

1. `tools/macos-export/`フォルダを、GitHubからダウンロードするか`git clone`して、Mac上のどこかに置いてください。
2. [`tools/macos-export/BUILD.md`](../tools/macos-export/BUILD.md)の手順に従って、Automatorで`PhotolibreExport.app`を1回だけ組み立ててください。組み立てたアプリはDockやデスクトップに置いて、以降はダブルクリックで起動できます。

> Automatorの`.app`はビルド環境（実際のmacOS）に依存するバイナリのため、このリポジトリにはソース（シェルスクリプト＋組み立て手順書）のみを同梱しています。組み立ては一度だけ行えば、以後は繰り返し使えます。スクリプトの中身だけを先に確認したい場合は、ターミナルで`bash tools/macos-export/export.sh`として単体実行することもできます（BUILD.mdの1節を参照）。

---

## 1-2. アプリを実行してエクスポート

`PhotolibreExport.app`をダブルクリックすると、以下の流れをダイアログでの選択だけで進められます。

1. **osxphotosの確認・自動インストール** — [osxphotos](https://github.com/RhetTbull/osxphotos)というオープンソースツールが未インストールの場合、自動的に`pipx install osxphotos`が実行されます。`pipx`自体が未インストールの場合のみ、「`brew install pipx`を先に実行してください」という案内が表示されて終了します（Homebrewの自動インストールは行いません。多くのMacユーザーは既に導入済み、または[公式サイト](https://brew.sh)の手順で一度だけ導入する前提条件として扱っています）。
2. **Photos.appのエクスポート先を選択** — ダイアログで保存先フォルダを選びます。**必ずMacの内蔵ストレージ上のフォルダを選んでください。**
3. Photos.appからのエクスポートが自動実行されます（`--sidecar xmp`でメタデータのXMPサイドカーファイルも生成、`--exiftool`は使用しません — 理由は後述）。
4. **USBメモリ等の外部メディアへのコピー先を選択** — ダイアログでコピー先フォルダを選ぶと、`rsync`で自動コピーされます（`source_a_photos_app`フォルダが自動作成されます）。
5. **iPhotoライブラリの検出** — `~/Pictures/iPhoto Library.migratedphotolibrary`が存在する場合のみ、「iPhotoのコピーも行いますか？」と確認されます。「はい」を選ぶと、Source Aとは**別の**外付けドライブ内のコピー先を選ぶダイアログが表示され、`Originals/`と`AlbumData.xml`の両方が自動コピーされます（アルバム・イベント情報は`AlbumData.xml`にのみ記録されているため、両方揃って初めて完全なデータになります）。iPhotoライブラリが見つからない場合はこのステップ自体がスキップされます。
6. 完了すると、結果のサマリーダイアログが表示されます。処理の詳細ログは`~/Desktop/photolibre_export_log.txt`に保存されます。

各ステップは順にダイアログが出るのを待つだけで進みます。途中でキャンセルしても、それまでにコピー済みのファイルはそのまま残ります。

---

## なぜUSBメモリへの直接エクスポートを避けるのか

**USBメモリへの直接エクスポートは避けてください。** 実際に試したところ、`osxphotos export`の出力先をUSBメモリのマウントポイントに直接指定すると、エクスポートが完了しませんでした（原因未確認。外付けのHDD/SSDであれば書き込み速度等の違いにより成功する可能性はありますが、こちらは未検証です）。そのため、`PhotolibreExport.app`のPhotos.appエクスポート先選択ダイアログで`/Volumes/`配下（外付けドライブ）が選ばれた場合、アプリ側でも警告ダイアログを表示します。必ずMacの内蔵ストレージ上のフォルダへ一旦エクスポートし、その後のステップでUSBへコピーする2段階の流れに従ってください。

---

## なぜ`--exiftool`を使わないのか

メタデータ埋め込みのため1枚ごとに外部プロセスを起動する仕様上、2010年前後の古いiMac環境では**通常の480倍近く時間がかかる**ことを実データで確認しています（実測: `--exiftool`ありで10時間以上、なしで1分15秒）。写真の日時・お気に入り等のメタデータは`--sidecar xmp`で生成されるXMPサイドカーファイルに保存されるため、`--exiftool`なしでも情報は失われません。`PhotolibreExport.app`が実行する`osxphotos export`コマンドも、この制約を踏まえて`--exiftool`は付けていません。

---

## トラブルシューティング

- **「開発元を確認できないため開けません」と表示される** — Automatorで自分で組み立てた未署名アプリのため、初回起動時にmacOS Gatekeeperの警告が出ることがあります。Finderでアプリを**右クリック（Controlキーを押しながらクリック）→「開く」**を選び、表示される確認ダイアログで「開く」を選んでください。一度許可すれば、以降はダブルクリックで通常通り起動します。
- **エラーが出て途中で止まった** — `~/Desktop/photolibre_export_log.txt`にエラー内容が記録されています。内容を確認の上、必要であれば`tools/macos-export/export.sh`単体をターミナルで直接実行して詳細を確認することもできます（`bash export.sh`）。
- **osxphotosのインストールに失敗する** — ターミナルで`pipx install osxphotos`を直接実行し、エラーメッセージを確認してください。
- アプリの組み立て自体に関するトラブルシューティングは[`tools/macos-export/BUILD.md`](../tools/macos-export/BUILD.md)も参照してください。

---

## 1-3. Windowsへの転送

エクスポートで使った外付けドライブ（1-2の手順4のみを使った場合はそれ、iPhotoもコピーした場合は手順5で使ったものも含めた2本）を、そのままWindows PCへ接続してください。次のステップ（[02-import-and-view-windows.md](02-import-and-view-windows.md)）でこのデータを読み込みます。
