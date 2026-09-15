# PhotolibreExport.app ビルド手順（Automator）

このフォルダには、macOS写真エクスポートを1本のダブルクリックアプリにまとめるための
**ソース**（`export.sh` と本手順書）のみが入っています。Automatorの`.app`バイナリ自体は
ビルド環境（実際のmacOS）に依存するため、このリポジトリには同梱していません。
以下の手順で、お使いのMac上で一度だけ組み立ててください。

対象: macOS Big Sur（Automator・bash/zsh標準搭載）を想定しています。他のバージョンでも
動作する可能性がありますが未検証です。

所要時間: 初回のみ5分程度。以降は組み立てたアプリをダブルクリックするだけです。

---

## 0. 前提: export.sh を固定の場所に置く

Automatorのワークフローは`export.sh`を**呼び出すだけの薄いラッパー**として作るため、
`export.sh`自体はMac上の分かりやすい固定パスに置いておく必要があります。

このフォルダ（`tools/macos-export/`）一式を、`~/Applications/photolibre-export/` にコピーしてください。

```bash
mkdir -p ~/Applications/photolibre-export
cp -R /path/to/photolibre/tools/macos-export/* ~/Applications/photolibre-export/
chmod +x ~/Applications/photolibre-export/export.sh
```

（GitHubからリポジトリをZIPでダウンロードした場合は、展開後の`tools/macos-export`フォルダの
中身を上記コマンドの`/path/to/photolibre/tools/macos-export/`部分に読み替えてください。）

> 別のパスに置きたい場合は、後述の手順4で貼り付けるスクリプト中のパスを実際の置き場所に
> 書き換えてください。

---

## 1.（任意・推奨）先に単体で動作確認する

Automatorを組む前に、ターミナルで直接スクリプトを実行して、ダイアログでの選択が
問題なく動くか確認できます。

```bash
bash ~/Applications/photolibre-export/export.sh
```

途中のダイアログはいつでもキャンセルして中断できます（それまでコピーされたファイルは
残ります）。ここで一度確認しておくと、Automator側の設定ミスと`export.sh`自体の問題を
切り分けやすくなります。

---

## 2. Automatorで「アプリケーション」を新規作成

1. Launchpad、またはFinderの`/Applications/Automator.app`からAutomatorを起動します。
2. 起動時に表示されるテンプレート選択画面で **「アプリケーション」** を選び、
   「選択」をクリックします。

---

## 3.「シェルスクリプトを実行」アクションを追加

1. ウィンドウ左側のアクションライブラリ検索欄に「シェルスクリプトを実行」と入力します。
2. 見つかったアクション（カテゴリ: ユーティリティ）をダブルクリックするか、
   右側のワークフロー編集エリアへドラッグして追加します。
3. アクション上部の「シェル」が **`/bin/bash`** になっていることを確認してください
   （Big Sur標準のAutomatorではデフォルトで`/bin/bash`のはずです）。
4. 「入力の引き渡し方法」は `stdin` のままで構いません（このスクリプトは標準入力を使いません）。

---

## 4. スクリプト本体を貼り付け

アクション内のテキストエリアに最初から入っているサンプルコード（`cat`など）を
すべて削除し、以下を貼り付けます。

```bash
#!/bin/bash
bash "$HOME/Applications/photolibre-export/export.sh"
```

手順0で別のパスに置いた場合は、上記の`$HOME/Applications/photolibre-export/export.sh`の
部分を実際のパスに書き換えてください。

これがAutomator側に必要な内容の全てです。処理の中身（osxphotosの確認・エクスポート・
USBコピー・iPhoto検出など）はすべて`export.sh`側にあり、Automatorはそれを呼び出す
だけの薄いラッパーになります。

---

## 5. 保存

1. メニューから「ファイル」→「保存」（`Cmd+S`）を選択します。
2. 名前を `PhotolibreExport` とし、「フォーマット」が **「アプリケーション」** に
   なっていることを確認します。
3. 保存先は任意ですが、`~/Applications`やデスクトップなど分かりやすい場所を
   おすすめします。

これで`PhotolibreExport.app`が作成されます。以降はダブルクリックで起動できます。

---

## 6. 初回起動時の注意（Gatekeeperの警告）

自分でビルドした未署名のアプリのため、初回起動時にmacOSが
「開発元を確認できないため開けません」という警告を表示することがあります。

1. Finderで`PhotolibreExport.app`を **右クリック（またはControlキーを押しながらクリック）**
2. 「開く」を選択
3. 表示される確認ダイアログで、再度「開く」を選択

一度許可すれば、以降は通常のダブルクリックで起動できるようになります。

---

## 7. アイコン・Dock配置（任意）

- Dockにドラッグすれば常駐させて、以降ワンクリックで起動できます。
- アイコンを変更したい場合: 任意の画像をコピー →
  `PhotolibreExport.app`を選択して「情報を見る」（`Cmd+I`）を開く →
  左上のアイコンをクリックして`Cmd+V`で貼り付け。

---

## スクリプトを更新した場合

`export.sh`の中身を直接編集するだけで、次回`PhotolibreExport.app`を起動したときから
変更が反映されます。Automator側でアプリを作り直す必要はありません
（Automator側は`export.sh`を呼び出しているだけのため）。

---

## トラブルシューティング

- **アプリをダブルクリックしても何も起きない、またはすぐ終了する** —
  「1.（任意・推奨）先に単体で動作確認する」の手順でターミナルから直接`export.sh`を
  実行し、表示されるエラーメッセージを確認してください。
- **osxphotosのインストールに失敗する** — ターミナルで
  `pipx install osxphotos`を直接実行し、エラーメッセージを確認してください。
- **処理の途中でエラーが出て止まった** — `~/Desktop/photolibre_export_log.txt`に
  詳細なログが残っています。
- その他の既知の注意点（USB直接エクスポートを避ける理由、`--exiftool`を使わない理由など）は
  [`docs/01-export-macos.md`](../../docs/01-export-macos.md)を参照してください。
