#!/bin/bash
#
# photolibre - macOS写真エクスポートツール（export.sh）
#
# Photos.app（Source A）・iPhoto（Source B、お使いの場合のみ）のライブラリを
# 外付けドライブへエクスポートするための一本化スクリプト。
# GUIダイアログ（osascript/AppleScript）で選択を促すため、ターミナル操作の知識は不要。
#
# 実行方法:
#   1. 単体でターミナルから直接実行して動作確認できます: bash export.sh
#   2. 通常は Automator で組み立てた PhotolibreExport.app からこのスクリプトを
#      呼び出す運用を想定しています（同フォルダの BUILD.md を参照）。
#
# 対象OS: macOS Big Sur（bash/zsh標準搭載）を想定。Automatorの「シェルスクリプトを実行」
#         アクションの既定シェルは /bin/bash のため、本スクリプトも /bin/bash 前提で書いています。
#         bash 3.2（Big Sur/Automator既定）で動く構文のみを使用しています
#         （連想配列・globstar等、bash4以降の機能は使っていません）。
#
# 変更しないこと: osxphotos export / rsync のコマンド・オプション自体は
#                 docs/01-export-macos.md の旧手順で実証済みの内容から変更していません。
#                 変えているのは「実行方法」（ターミナル手打ち → ダイアログ誘導）のみです。
#
# 非破壊原則: 元の写真ファイル（Photos.app/iPhotoライブラリ本体）には一切書き込みません。
#             すべてosxphotos/rsync/cpによる「コピー」のみです。

if [ "$(uname)" != "Darwin" ]; then
  echo "このスクリプトはmacOS専用です。" >&2
  exit 1
fi

# Automatorの「シェルスクリプトを実行」アクションは、ログインシェルの初期化ファイル
# （~/.zshrc, ~/.bash_profile 等）を読み込まない素のシェルとして動作するため、
# pipx/Homebrewがインストールしたコマンドが見えないことがある。
# そのため、既知のインストール先を明示的にPATHへ追加しておく。
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

LOG_FILE="$HOME/Desktop/photolibre_export_log.txt"
IPHOTO_LIB="$HOME/Pictures/iPhoto Library.migratedphotolibrary"

# ----------------------------------------------------------------------------
# ヘルパー関数
# ----------------------------------------------------------------------------

log() {
  local ts
  ts=$(date "+%Y-%m-%d %H:%M:%S")
  echo "[$ts] $1" | tee -a "$LOG_FILE" >/dev/null
}

# AppleScriptの二重引用符文字列に安全に埋め込めるようエスケープする
as_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

# 通知（非ブロッキング）
notify() {
  local msg
  msg=$(as_escape "$1")
  osascript -e "display notification \"$msg\" with title \"photolibre エクスポート\"" >/dev/null 2>&1
}

# 情報ダイアログ（OKクリックまでブロック）
dialog_info() {
  local msg
  msg=$(as_escape "$1")
  osascript >/dev/null 2>&1 <<EOF
display dialog "$msg" buttons {"OK"} default button "OK" with icon note with title "photolibre エクスポート"
EOF
}

# エラーダイアログ
dialog_error() {
  local msg
  msg=$(as_escape "$1")
  osascript >/dev/null 2>&1 <<EOF
display dialog "$msg" buttons {"OK"} default button "OK" with icon stop with title "photolibre エクスポート - エラー"
EOF
}

# はい/いいえの確認ダイアログ。「はい」なら0、それ以外（いいえ/キャンセル/×）なら1を返す
dialog_confirm() {
  local msg result
  msg=$(as_escape "$1")
  result=$(osascript 2>/dev/null <<EOF
try
  display dialog "$msg" buttons {"いいえ", "はい"} default button "はい" with title "photolibre エクスポート"
  button returned of result
on error
  "いいえ"
end try
EOF
)
  [ "$result" = "はい" ]
}

# フォルダ選択ダイアログ。選択されたPOSIXパスを返す。キャンセル時は空文字列を返す。
# 第2引数（任意）: AppleScriptの "default location" に渡す式（例: "(path to desktop)"）
choose_folder() {
  local msg default_loc result script
  msg=$(as_escape "$1")
  default_loc="$2"
  if [ -n "$default_loc" ]; then
    script="try
  POSIX path of (choose folder with prompt \"$msg\" default location $default_loc)
on error
  \"\"
end try"
  else
    script="try
  POSIX path of (choose folder with prompt \"$msg\")
on error
  \"\"
end try"
  fi
  result=$(osascript 2>/dev/null <<EOF
$script
EOF
)
  printf '%s' "$result"
}

# 末尾のスラッシュを取り除く（choose folderの戻り値はスラッシュ付きのことがあるため正規化）
strip_trailing_slash() {
  local p="$1"
  case "$p" in
    */) printf '%s' "${p%/}" ;;
    *) printf '%s' "$p" ;;
  esac
}

abort() {
  log "ERROR: $1"
  dialog_error "$1"
  exit 1
}

# ----------------------------------------------------------------------------
# 0. osxphotosの確認・自動インストール
# ----------------------------------------------------------------------------

log "===== photolibre export.sh 開始 ====="

if ! command -v osxphotos >/dev/null 2>&1; then
  if ! command -v pipx >/dev/null 2>&1; then
    abort "pipx が見つかりませんでした。

先にターミナルで以下を実行してから、もう一度このアプリを起動してください:

  brew install pipx
  pipx ensurepath

（Homebrew自体の自動インストールは行いません。Homebrewが未導入の場合は https://brew.sh の手順に従ってください。）"
  fi

  log "osxphotos が見つからないため pipx install osxphotos を実行します"
  notify "osxphotos をインストールしています…"
  pipx install osxphotos >>"$LOG_FILE" 2>&1

  if ! command -v osxphotos >/dev/null 2>&1; then
    abort "osxphotos のインストールに失敗しました。詳細はログを確認してください:
$LOG_FILE"
  fi
  log "osxphotos のインストールに成功しました"
fi

# ----------------------------------------------------------------------------
# 1. 開始確認
# ----------------------------------------------------------------------------

WELCOME_MSG="photolibre 写真エクスポートツール

以下の順に進みます:
  1. Photos.app の写真をMac内蔵ストレージへエクスポート
  2. エクスポート結果をUSBメモリ等へコピー
  3. （iPhotoをお使いの場合のみ）iPhotoライブラリを別のUSBへコピー

各ステップでダイアログが表示されるので、フォルダを選択して進めてください。
続けますか？"

if ! dialog_confirm "$WELCOME_MSG"; then
  log "ユーザーが開始確認でキャンセルしました"
  exit 0
fi

# ----------------------------------------------------------------------------
# 2. Photos.app（Source A）: エクスポート先フォルダの選択とエクスポート
# ----------------------------------------------------------------------------

LOCAL_EXPORT_DIR=$(choose_folder "Photos.appのエクスポート先フォルダを選択してください。
※ 必ずMacの内蔵ストレージ上のフォルダを選んでください（USBメモリへの直接エクスポートは避けてください）。" "(path to desktop)")

if [ -z "$LOCAL_EXPORT_DIR" ]; then
  log "ユーザーがエクスポート先選択をキャンセルしました"
  exit 0
fi
LOCAL_EXPORT_DIR=$(strip_trailing_slash "$LOCAL_EXPORT_DIR")

case "$LOCAL_EXPORT_DIR" in
  /Volumes/*)
    if ! dialog_confirm "選択されたフォルダは外付けドライブ（USBメモリ等）の可能性があります。

USBメモリへの直接エクスポートは、実際に試したところ完了しないことが確認されています（原因未確認）。
Macの内蔵ストレージ上のフォルダを選び直すことを強く推奨します。

このまま続行しますか？（推奨: いいえを選んでフォルダを選び直す）"; then
      log "ユーザーがUSB直接エクスポートの警告で中止しました"
      exit 0
    fi
    log "警告: ユーザーはUSB配下のフォルダへのエクスポートを承知の上で続行しました: $LOCAL_EXPORT_DIR"
    ;;
esac

mkdir -p "$LOCAL_EXPORT_DIR" || abort "エクスポート先フォルダの作成に失敗しました: $LOCAL_EXPORT_DIR"

log "Photos.appエクスポート開始: 出力先=$LOCAL_EXPORT_DIR"
notify "Photos.appからのエクスポートを開始します。件数によっては数分かかります…"

# 重要: このコマンド・オプションは docs/01-export-macos.md の旧手順から変更していません。
# --exiftool は付けない（古いiMacで480倍近く時間がかかることを実測済みのため）。
# メタデータは --sidecar xmp によるXMPサイドカーファイルに保存される。
osxphotos export "$LOCAL_EXPORT_DIR" \
  --directory "{created.strftime,%Y/%m}" \
  --filename "{original_name}" \
  --sidecar xmp \
  2>&1 | tee "$LOCAL_EXPORT_DIR/export_log.txt" | tee -a "$LOG_FILE" >/dev/null
EXPORT_STATUS=${PIPESTATUS[0]}

if [ "$EXPORT_STATUS" -ne 0 ]; then
  abort "Photos.appのエクスポートに失敗しました（終了コード: $EXPORT_STATUS）。
詳細: $LOCAL_EXPORT_DIR/export_log.txt"
fi

log "Photos.appエクスポート完了"
dialog_info "Photos.appのエクスポートが完了しました。
続けてUSBメモリ等の外部メディアへコピーします。"

# ----------------------------------------------------------------------------
# 3. Source A: USBメモリ等へのコピー
# ----------------------------------------------------------------------------

USB_A_DEST=$(choose_folder "Source A（Photos.app）のコピー先となる、外付けドライブ（またはその中のフォルダ）を選択してください。
配下に source_a_photos_app フォルダが自動作成されます。")

if [ -z "$USB_A_DEST" ]; then
  log "ユーザーがSource Aコピー先選択をキャンセルしました"
  exit 0
fi
USB_A_DEST=$(strip_trailing_slash "$USB_A_DEST")
TARGET_A="$USB_A_DEST/source_a_photos_app"

mkdir -p "$TARGET_A" || abort "コピー先フォルダの作成に失敗しました: $TARGET_A"

log "Source A rsyncコピー開始: $LOCAL_EXPORT_DIR -> $TARGET_A"
notify "Source A（Photos.app）をUSBへコピーしています…"

rsync -avh --progress "$LOCAL_EXPORT_DIR/" "$TARGET_A/" >>"$LOG_FILE" 2>&1
RSYNC_A_STATUS=$?

if [ "$RSYNC_A_STATUS" -ne 0 ]; then
  abort "Source A（Photos.app）のUSBへのコピーに失敗しました（終了コード: $RSYNC_A_STATUS）。
詳細: $LOG_FILE"
fi

log "Source A rsyncコピー完了"
dialog_info "Source A（Photos.app）のUSBへのコピーが完了しました。"

# ----------------------------------------------------------------------------
# 4. iPhotoライブラリ（Source B）の検出・コピー（存在する場合のみ）
# ----------------------------------------------------------------------------

if [ -d "$IPHOTO_LIB" ]; then
  log "iPhotoライブラリを検出しました: $IPHOTO_LIB"

  if dialog_confirm "iPhotoライブラリが見つかりました。

iPhotoのコピーも行いますか？
（Photos.appへ移行済みでも、2016年より前のアルバム情報や、移行されなかった古い写真が
iPhotoライブラリに残っている場合があります。）"; then

    USB_B_DEST=$(choose_folder "Source B（iPhoto）のコピー先となる、Source Aとは別の外付けドライブ（またはその中のフォルダ）を選択してください。
配下に source_b_iphoto フォルダが自動作成されます。")

    if [ -z "$USB_B_DEST" ]; then
      log "ユーザーがSource Bコピー先選択をキャンセルしました"
      dialog_info "iPhotoのコピーはキャンセルされました。Source A（Photos.app）の処理は完了しています。"
      exit 0
    fi
    USB_B_DEST=$(strip_trailing_slash "$USB_B_DEST")
    TARGET_B="$USB_B_DEST/source_b_iphoto"

    mkdir -p "$TARGET_B" || abort "コピー先フォルダの作成に失敗しました: $TARGET_B"

    log "Source B rsyncコピー開始: $IPHOTO_LIB/Originals -> $TARGET_B"
    notify "Source B（iPhoto）のOriginalsをUSBへコピーしています…"

    rsync -avh --progress "$IPHOTO_LIB/Originals/" "$TARGET_B/" >>"$LOG_FILE" 2>&1
    RSYNC_B_STATUS=$?

    if [ "$RSYNC_B_STATUS" -ne 0 ]; then
      abort "Source B（iPhoto）のUSBへのコピーに失敗しました（終了コード: $RSYNC_B_STATUS）。
詳細: $LOG_FILE"
    fi

    # 重要: AlbumData.xmlはOriginals/フォルダに含まれないため個別にコピーする。
    # アルバム・イベント（Roll）情報はこのファイルにのみ記録されている。
    if [ ! -f "$IPHOTO_LIB/AlbumData.xml" ]; then
      abort "AlbumData.xml が見つかりませんでした: $IPHOTO_LIB/AlbumData.xml
iPhotoライブラリの構成が想定と異なる可能性があります。"
    fi

    cp "$IPHOTO_LIB/AlbumData.xml" "$TARGET_B/" || abort "AlbumData.xmlのコピーに失敗しました: $TARGET_B"

    log "Source B（iPhoto）コピー完了（Originals + AlbumData.xml）"
    dialog_info "Source B（iPhoto）のコピーが完了しました（Originals + AlbumData.xml）。"
  else
    log "ユーザーはiPhotoのコピーを行わない選択をしました"
  fi
else
  log "iPhotoライブラリは検出されませんでした（スキップ）"
fi

# ----------------------------------------------------------------------------
# 5. 完了
# ----------------------------------------------------------------------------

log "===== photolibre export.sh 完了 ====="

dialog_info "すべてのエクスポート処理が完了しました。

ログ: $LOG_FILE

外付けドライブをWindows PCへ接続し、次のステップ（02-import-and-view-windows.md）に進んでください。"

exit 0
