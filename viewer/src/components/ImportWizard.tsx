import { useState } from "react";
import type { ChangeEvent } from "react";

import { addPhotosToAlbum, commitImport, pickImportSourceFolder, scanImportSource } from "../lib/api";
import type { Album, ImportCommitResult, ImportPreview } from "../lib/types";
import { useImportProgress } from "../lib/useImportProgress";
import { ImportPreviewGrid } from "./ImportPreviewGrid";

interface ImportWizardProps {
  /** 「既存のアルバムに追加」の選択肢に使う、現在のアルバム一覧。 */
  albums: Album[];
  onClose: () => void;
  /** 「取り込んだ写真を見る」が押されたときに、実際に挿入された写真ID一覧を
   * 渡す。呼び出し側（App.tsx）がそのIDだけのビューへ遷移する。 */
  onImportComplete: (photoIds: string[]) => void;
}

type WizardStep = "pick" | "scanning" | "preview" | "copying" | "done";
type AlbumMode = "none" | "new" | "existing";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "不明なエラーが発生しました";
}

/** `selectedCount`件を選んでコミットしたのに、`result`が説明できる件数
 * （挿入・重複・失敗の合計）がそれより少ない場合、書き込みの連続失敗による
 * 早期中断（TASK-382レビュー申し送り事項）が起きたとみなし、その差分を返す。
 * バックエンド側に専用の`aborted`フラグを追加する案もあったが、
 * `commit_import_command`は既にレビュー済みで、選択件数との差分だけで
 * フロントエンド側で判定できるため、この段階では差分計算方式を採用する
 * （判断の詳細はTASK-383.mdに記録）。 */
function countInterrupted(selectedCount: number, result: ImportCommitResult): number {
  const accountedFor = result.insertedCount + result.duplicateCount + result.failedFiles.length;
  return Math.max(0, selectedCount - accountedFor);
}

export function ImportWizard({ albums, onClose, onImportComplete }: ImportWizardProps) {
  const [step, setStep] = useState<WizardStep>("pick");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [committedCount, setCommittedCount] = useState(0);
  const [albumMode, setAlbumMode] = useState<AlbumMode>("none");
  const [newAlbumName, setNewAlbumName] = useState("");
  const [existingAlbumId, setExistingAlbumId] = useState("");
  const [commitResult, setCommitResult] = useState<ImportCommitResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [albumWarning, setAlbumWarning] = useState<string | null>(null);
  const { progress, reset: resetProgress } = useImportProgress();

  const isBusy = step === "scanning" || step === "copying";

  const handlePickFolder = async () => {
    setErrorMessage(null);
    const folder = await pickImportSourceFolder();
    if (!folder) {
      return;
    }

    setStep("scanning");
    resetProgress();
    try {
      const result = await scanImportSource(folder);
      setPreview(result);
      setSelectedPaths(
        new Set(
          result.items
            .filter((item) => item.dedupStatus.status === "new")
            .map((item) => item.sourcePath)
        )
      );
      setStep("preview");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
      setStep("pick");
    }
  };

  const handleToggleSelect = (sourcePath: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(sourcePath)) {
        next.delete(sourcePath);
      } else {
        next.add(sourcePath);
      }
      return next;
    });
  };

  const handleExistingAlbumChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setExistingAlbumId(event.target.value);
  };

  const handleCommit = async () => {
    setErrorMessage(null);
    setAlbumWarning(null);
    const selected = Array.from(selectedPaths);
    setCommittedCount(selected.length);
    setStep("copying");
    resetProgress();

    try {
      const albumName = albumMode === "new" ? newAlbumName.trim() || null : null;
      const result = await commitImport(selected, albumName);
      setCommitResult(result);

      if (albumMode === "existing" && existingAlbumId && result.insertedPhotoIds.length > 0) {
        try {
          await addPhotosToAlbum(existingAlbumId, result.insertedPhotoIds);
        } catch (error) {
          setAlbumWarning(getErrorMessage(error));
        }
      }

      setStep("done");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
      setStep("preview");
    }
  };

  const handleViewImported = () => {
    if (commitResult && commitResult.insertedPhotoIds.length > 0) {
      onImportComplete(commitResult.insertedPhotoIds);
    }
    onClose();
  };

  const interruptedCount = commitResult ? countInterrupted(committedCount, commitResult) : 0;

  return (
    <div className="import-wizard-overlay" role="presentation">
      <div className="import-wizard" role="dialog" aria-modal="true" aria-label="写真を取り込む">
        <div className="import-wizard__header">
          <h2>写真を取り込む</h2>
          <button
            type="button"
            className="import-wizard__close"
            aria-label="閉じる"
            onClick={onClose}
            disabled={isBusy}
          >
            ×
          </button>
        </div>

        {step === "pick" && (
          <div className="import-wizard__step">
            <p>
              デジタルカメラ・SDカード・スマホからコピーした写真/動画が入っている
              フォルダを選択してください。
            </p>
            <p className="import-wizard__hint">
              スマホの場合は、あらかじめWindowsのフォトアプリ/エクスプローラーで
              任意のフォルダにコピーしてから、そのフォルダを指定してください。
            </p>
            {errorMessage && <p className="import-wizard__error">{errorMessage}</p>}
            <div className="import-wizard__actions">
              <button type="button" onClick={handlePickFolder}>
                フォルダを選択
              </button>
            </div>
          </div>
        )}

        {step === "scanning" && (
          <div className="import-wizard__step">
            <p>フォルダを走査しています...</p>
            {progress && progress.phase === "scanning" && (
              <ImportProgressBar current={progress.current} total={progress.total} label={progress.currentFile} />
            )}
          </div>
        )}

        {step === "preview" && preview && (
          <div className="import-wizard__step import-wizard__step--preview">
            <div className="import-wizard__summary">
              <span>新規: {preview.newCount}件</span>
              <span>重複: {preview.duplicateCount}件</span>
              {preview.errorCount > 0 && <span>読み込みエラー: {preview.errorCount}件</span>}
            </div>

            <p className="import-wizard__warning">
              取り込みを実行すると、選択した写真/動画がアーカイブへコピーされます。
              この操作は取り消せません（Ctrl+Zでの取り消しには対応していません）。
            </p>

            <ImportPreviewGrid
              items={preview.items}
              selectedSourcePaths={selectedPaths}
              onToggleSelect={handleToggleSelect}
            />

            <fieldset className="import-wizard__album-choice">
              <legend>取り込み先アルバム</legend>
              <label>
                <input
                  type="radio"
                  name="import-album-mode"
                  checked={albumMode === "none"}
                  onChange={() => setAlbumMode("none")}
                />
                アルバムに追加しない
              </label>
              <label>
                <input
                  type="radio"
                  name="import-album-mode"
                  checked={albumMode === "new"}
                  onChange={() => setAlbumMode("new")}
                />
                新しいアルバムを作成:
                <input
                  type="text"
                  value={newAlbumName}
                  onChange={(event) => setNewAlbumName(event.target.value)}
                  onFocus={() => setAlbumMode("new")}
                  disabled={albumMode !== "new"}
                  placeholder="アルバム名"
                />
              </label>
              <label>
                <input
                  type="radio"
                  name="import-album-mode"
                  checked={albumMode === "existing"}
                  onChange={() => setAlbumMode("existing")}
                  disabled={albums.length === 0}
                />
                既存のアルバムに追加:
                <select
                  value={existingAlbumId}
                  onChange={handleExistingAlbumChange}
                  disabled={albumMode !== "existing"}
                >
                  <option value="">選択してください</option>
                  {albums.map((album) => (
                    <option key={album.id} value={album.id}>
                      {album.name}
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>

            {errorMessage && <p className="import-wizard__error">{errorMessage}</p>}

            <div className="import-wizard__actions">
              <button type="button" onClick={onClose}>
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleCommit}
                disabled={
                  selectedPaths.size === 0 ||
                  (albumMode === "new" && newAlbumName.trim() === "") ||
                  (albumMode === "existing" && existingAlbumId === "")
                }
              >
                {selectedPaths.size}件を取り込む
              </button>
            </div>
          </div>
        )}

        {step === "copying" && (
          <div className="import-wizard__step">
            <p>取り込み中です。しばらくお待ちください...</p>
            {progress && progress.phase === "copying" && (
              <ImportProgressBar current={progress.current} total={progress.total} label={progress.currentFile} />
            )}
          </div>
        )}

        {step === "done" && commitResult && (
          <div className="import-wizard__step">
            <h3>取り込みが完了しました</h3>
            <ul className="import-wizard__summary-list">
              <li>新規に取り込んだ写真/動画: {commitResult.insertedCount}件</li>
              <li>重複のためスキップ: {commitResult.duplicateCount}件</li>
              {commitResult.failedFiles.length > 0 && (
                <li>コピーに失敗: {commitResult.failedFiles.length}件</li>
              )}
            </ul>
            {interruptedCount > 0 && (
              <p className="import-wizard__warning">
                書き込みが連続して失敗したため、{interruptedCount}
                件は処理されずに中断されました。アーカイブの保存先の空き容量などを
                ご確認のうえ、必要であれば再度お試しください。
              </p>
            )}
            {albumWarning && <p className="import-wizard__error">{albumWarning}</p>}
            <div className="import-wizard__actions">
              <button
                type="button"
                onClick={handleViewImported}
                disabled={commitResult.insertedPhotoIds.length === 0}
              >
                取り込んだ写真を見る
              </button>
              <button type="button" onClick={onClose}>
                閉じる
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface ImportProgressBarProps {
  current: number;
  total: number;
  label: string;
}

function ImportProgressBar({ current, total, label }: ImportProgressBarProps) {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="import-progress-bar">
      <div className="import-progress-bar__track">
        <div className="import-progress-bar__fill" style={{ width: `${percent}%` }} />
      </div>
      <p className="import-progress-bar__label">
        {current} / {total}（{label}）
      </p>
    </div>
  );
}
