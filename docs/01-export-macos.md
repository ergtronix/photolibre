# 1. iMac（macOS）側: 写真ライブラリのエクスポート

photolibreは、古いiMacに溜まったApple Photos（Photos.app）・iPhotoのライブラリを外部メディアへエクスポートするところから始まります。この手順はコマンドライン操作が中心です。

対象: macOS Big Sur以前の古いiMacで、Photos.appおよび（お使いであれば）iPhotoに写真が入っている場合。

---

## 1-1. 準備: osxphotosのインストール

[osxphotos](https://github.com/RhetTbull/osxphotos)というオープンソースツールを使ってPhotos.appからエクスポートします。

```bash
# pipxが未インストールの場合
brew install pipx
pipx ensurepath

# osxphotosをインストール
pipx install osxphotos
```

---

## 1-2. Photos.appライブラリのエクスポート

外付けドライブ（USBメモリ等）をマウントした状態で、以下を実行します。

```bash
mkdir -p /Volumes/{外付けドライブ名}/source_a_photos_app && \
osxphotos export /Volumes/{外付けドライブ名}/source_a_photos_app \
  --directory "{created.strftime,%Y/%m}" \
  --filename "{original_name}" \
  --sidecar xmp \
  2>&1 | tee /Volumes/{外付けドライブ名}/source_a_photos_app/export_log.txt
```

**重要: `--exiftool`オプションは付けないでください。** メタデータ埋め込みのため1枚ごとに外部プロセスを起動する仕様上、2010年前後の古いiMac＋USB 2.0環境では**通常の480倍近く時間がかかる**ことを実データで確認しています（実測: `--exiftool`ありで10時間以上、なしで1分15秒）。写真の日時・お気に入り等のメタデータは`--sidecar xmp`で生成されるXMPサイドカーファイルに保存されるため、`--exiftool`なしでも情報は失われません。

実行後、エクスポート先フォルダの中に `.osxphotos_export.db` と、年/月ごとに整理された写真フォルダが作成されていれば成功です。

---

## 1-3.（iPhotoもお使いの場合）iPhotoライブラリのコピー

Photos.appへ移行済みでも、2016年より前のiPhoto時代のアルバム情報や、Photos.appに引き継がれなかった古い写真が残っている場合があります。iPhotoライブラリ（`〜/Pictures/iPhoto Library.migratedphotolibrary`）がお使いのMacに存在する場合は、**別の**外付けドライブへ以下の2点をコピーしてください。

```bash
mkdir -p /Volumes/{別の外付けドライブ名}/source_b_iphoto && \
rsync -avh --progress \
  ~/Pictures/iPhoto\ Library.migratedphotolibrary/Originals/ \
  /Volumes/{別の外付けドライブ名}/source_b_iphoto/ \
  | tee ~/Desktop/source_b_copy_log.txt
```

**重要: `AlbumData.xml`も忘れずにコピーしてください。** アルバム・イベント（Roll）情報はこのファイルにのみ記録されており、`Originals/`フォルダだけをコピーすると失われてしまいます。

```bash
cp ~/Pictures/iPhoto\ Library.migratedphotolibrary/AlbumData.xml \
   /Volumes/{別の外付けドライブ名}/source_b_iphoto/
```

コピー後、`/Volumes/{別の外付けドライブ名}/source_b_iphoto/` の直下に `AlbumData.xml` と `2008/05/...` のような年月フォルダ構成の写真が両方存在することを確認してください。

---

## 1-4. Windowsへの転送

1-2・1-3で使った外付けドライブ（1本のみの場合はそれ、2本使った場合は両方）を、そのままWindows PCへ接続してください。次のステップ（[02-import-and-view-windows.md](02-import-and-view-windows.md)）でこのデータを読み込みます。

iPhotoをお使いでない場合は1-3の手順は不要で、1-2のPhotos.appエクスポートのみで次のステップへ進めます。
