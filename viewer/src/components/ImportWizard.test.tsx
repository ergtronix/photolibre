import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ImportWizard } from "./ImportWizard";
import type { Album, ImportCommitResult, ImportPreview } from "../lib/types";

const {
  pickImportSourceFolderMock,
  scanImportSourceMock,
  commitImportMock,
  addPhotosToAlbumMock,
  getImportPreviewThumbnailMock,
  useImportProgressMock,
} = vi.hoisted(() => ({
  pickImportSourceFolderMock: vi.fn(),
  scanImportSourceMock: vi.fn(),
  commitImportMock: vi.fn(),
  addPhotosToAlbumMock: vi.fn(),
  getImportPreviewThumbnailMock: vi.fn(),
  useImportProgressMock: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  pickImportSourceFolder: pickImportSourceFolderMock,
  scanImportSource: scanImportSourceMock,
  commitImport: commitImportMock,
  addPhotosToAlbum: addPhotosToAlbumMock,
  getImportPreviewThumbnail: getImportPreviewThumbnailMock,
}));

vi.mock("../lib/useImportProgress", () => ({
  useImportProgress: useImportProgressMock,
}));

function makePreview(overrides: Partial<ImportPreview> = {}): ImportPreview {
  return {
    newCount: 1,
    duplicateCount: 0,
    errorCount: 0,
    items: [
      {
        sourcePath: "D:/DCIM/a.jpg",
        filename: "a.jpg",
        kind: "photo",
        dedupStatus: { status: "new" },
        dateTaken: "2020-01-01T00:00:00",
      },
    ],
    ...overrides,
  };
}

function makeCommitResult(overrides: Partial<ImportCommitResult> = {}): ImportCommitResult {
  return {
    insertedCount: 1,
    insertedPhotoIds: ["P-NEW-1"],
    duplicateCount: 0,
    failedFiles: [],
    ...overrides,
  };
}

async function advanceToPreview(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "フォルダを選択" }));
  await screen.findByRole("grid", { name: "取り込みプレビュー" });
}

beforeEach(() => {
  vi.resetAllMocks();
  getImportPreviewThumbnailMock.mockResolvedValue("data:image/jpeg;base64,AAAA");
  useImportProgressMock.mockReturnValue({ progress: null, reset: vi.fn() });
});

describe("ImportWizard", () => {
  it("shows the pick step initially", () => {
    render(<ImportWizard albums={[]} onClose={vi.fn()} onImportComplete={vi.fn()} />);

    expect(screen.getByRole("button", { name: "フォルダを選択" })).toBeInTheDocument();
  });

  it("stays on the pick step when the folder dialog is cancelled", async () => {
    const user = userEvent.setup();
    pickImportSourceFolderMock.mockResolvedValue(null);
    render(<ImportWizard albums={[]} onClose={vi.fn()} onImportComplete={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "フォルダを選択" }));

    expect(scanImportSourceMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "フォルダを選択" })).toBeInTheDocument();
  });

  it("scans the selected folder and shows the preview once scanning completes", async () => {
    const user = userEvent.setup();
    pickImportSourceFolderMock.mockResolvedValue("D:/DCIM");
    scanImportSourceMock.mockResolvedValue(makePreview());

    render(<ImportWizard albums={[]} onClose={vi.fn()} onImportComplete={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "フォルダを選択" }));

    await waitFor(() => expect(scanImportSourceMock).toHaveBeenCalledWith("D:/DCIM"));
    expect(await screen.findByRole("grid", { name: "取り込みプレビュー" })).toBeInTheDocument();
  });

  // 回帰テスト（ERG実機確認で発見・2026-09-19修正）: React.StrictMode（開発モード）
  // は初回マウント時に各effectを「実行→シミュレートされたクリーンアップ→再実行」の
  // 順で二重に走らせる。`isMountedRef`をクリーンアップでfalseにするだけでeffect本体で
  // trueに戻していないと、二重実行後は永続的にfalseのままとなり、
  // `handlePickFolder`/`handleCommit`の完了ガードが常に発動してスキャン/コミットが
  // 完了してもUIが先に進まないフリーズになる。このテストは`wrapper: StrictMode`を
  // 使うことで、修正前のコードに対しては実際に失敗する（"取り込みプレビュー"の
  // grid要素が現れずscanningステップのまま固まる）ことを確認済み。
  it("reaches the preview step after scanning completes even under React.StrictMode's double-invoked effects", async () => {
    const user = userEvent.setup();
    pickImportSourceFolderMock.mockResolvedValue("D:/DCIM");
    scanImportSourceMock.mockResolvedValue(makePreview());

    render(<ImportWizard albums={[]} onClose={vi.fn()} onImportComplete={vi.fn()} />, {
      wrapper: StrictMode,
    });
    await user.click(screen.getByRole("button", { name: "フォルダを選択" }));

    await waitFor(() => expect(scanImportSourceMock).toHaveBeenCalledWith("D:/DCIM"));
    expect(await screen.findByRole("grid", { name: "取り込みプレビュー" })).toBeInTheDocument();
  });

  it("shows scanning progress reported by useImportProgress", async () => {
    const user = userEvent.setup();
    pickImportSourceFolderMock.mockResolvedValue("D:/DCIM");
    scanImportSourceMock.mockReturnValue(new Promise(() => {}));
    useImportProgressMock.mockReturnValue({
      progress: { phase: "scanning", current: 4, total: 10, currentFile: "a.jpg" },
      reset: vi.fn(),
    });

    render(<ImportWizard albums={[]} onClose={vi.fn()} onImportComplete={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "フォルダを選択" }));

    expect(await screen.findByText(/4\s*\/\s*10/)).toBeInTheDocument();
  });

  it("pre-selects new items but not duplicates", async () => {
    const user = userEvent.setup();
    pickImportSourceFolderMock.mockResolvedValue("D:/DCIM");
    scanImportSourceMock.mockResolvedValue(
      makePreview({
        newCount: 1,
        duplicateCount: 1,
        items: [
          {
            sourcePath: "a.jpg",
            filename: "a.jpg",
            kind: "photo",
            dedupStatus: { status: "new" },
            dateTaken: null,
          },
          {
            sourcePath: "b.jpg",
            filename: "b.jpg",
            kind: "photo",
            dedupStatus: { status: "duplicate_of_existing", photoId: "P-1" },
            dateTaken: null,
          },
        ],
      })
    );

    render(<ImportWizard albums={[]} onClose={vi.fn()} onImportComplete={vi.fn()} />);
    await advanceToPreview(user);

    expect(screen.getByRole("checkbox", { name: "a.jpg" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "b.jpg" })).not.toBeChecked();
  });

  // TASK-384（C-5）完了条件1: HEIC等のスキップ理由がプレビュー画面の
  // サマリーに表示されること。
  it("shows the skipped count in the preview summary when unsupported files were found", async () => {
    const user = userEvent.setup();
    pickImportSourceFolderMock.mockResolvedValue("D:/DCIM");
    scanImportSourceMock.mockResolvedValue(
      makePreview({
        skippedCount: 2,
        skippedItems: [
          { filename: "a.heic", reason: "unsupported_format" },
          { filename: "b.heic", reason: "unsupported_format" },
        ],
      })
    );

    render(<ImportWizard albums={[]} onClose={vi.fn()} onImportComplete={vi.fn()} />);
    await advanceToPreview(user);

    expect(screen.getByText(/非対応形式のためスキップ: 2件/)).toBeInTheDocument();
  });

  it("does not show the skipped summary line when nothing was skipped", async () => {
    const user = userEvent.setup();
    pickImportSourceFolderMock.mockResolvedValue("D:/DCIM");
    scanImportSourceMock.mockResolvedValue(makePreview());

    render(<ImportWizard albums={[]} onClose={vi.fn()} onImportComplete={vi.fn()} />);
    await advanceToPreview(user);

    expect(screen.queryByText(/非対応形式のためスキップ/)).not.toBeInTheDocument();
  });

  it("shows a warning that the import cannot be undone", async () => {
    const user = userEvent.setup();
    pickImportSourceFolderMock.mockResolvedValue("D:/DCIM");
    scanImportSourceMock.mockResolvedValue(makePreview());

    render(<ImportWizard albums={[]} onClose={vi.fn()} onImportComplete={vi.fn()} />);
    await advanceToPreview(user);

    expect(screen.getByText(/取り消せません/)).toBeInTheDocument();
  });

  it("disables the commit button when no items are selected", async () => {
    const user = userEvent.setup();
    pickImportSourceFolderMock.mockResolvedValue("D:/DCIM");
    scanImportSourceMock.mockResolvedValue(makePreview());

    render(<ImportWizard albums={[]} onClose={vi.fn()} onImportComplete={vi.fn()} />);
    await advanceToPreview(user);
    await user.click(screen.getByRole("checkbox", { name: "a.jpg" }));

    expect(screen.getByRole("button", { name: /件を取り込む/ })).toBeDisabled();
  });

  it("commits without an album when no album option is chosen", async () => {
    const user = userEvent.setup();
    pickImportSourceFolderMock.mockResolvedValue("D:/DCIM");
    scanImportSourceMock.mockResolvedValue(makePreview());
    commitImportMock.mockResolvedValue(makeCommitResult());

    render(<ImportWizard albums={[]} onClose={vi.fn()} onImportComplete={vi.fn()} />);
    await advanceToPreview(user);
    await user.click(screen.getByRole("button", { name: /件を取り込む/ }));

    await waitFor(() =>
      expect(commitImportMock).toHaveBeenCalledWith(["D:/DCIM/a.jpg"], null)
    );
  });

  it("commits the selected items and creates a new album when chosen", async () => {
    const user = userEvent.setup();
    pickImportSourceFolderMock.mockResolvedValue("D:/DCIM");
    scanImportSourceMock.mockResolvedValue(makePreview());
    commitImportMock.mockResolvedValue(makeCommitResult());

    render(<ImportWizard albums={[]} onClose={vi.fn()} onImportComplete={vi.fn()} />);
    await advanceToPreview(user);

    await user.click(screen.getByRole("radio", { name: /新しいアルバムを作成/ }));
    await user.type(screen.getByPlaceholderText("アルバム名"), "旅行");
    await user.click(screen.getByRole("button", { name: /件を取り込む/ }));

    await waitFor(() => expect(commitImportMock).toHaveBeenCalledWith(["D:/DCIM/a.jpg"], "旅行"));
    expect(await screen.findByText(/取り込みが完了しました/)).toBeInTheDocument();
  });

  it("adds imported photos to an existing album after commit when chosen", async () => {
    const user = userEvent.setup();
    pickImportSourceFolderMock.mockResolvedValue("D:/DCIM");
    scanImportSourceMock.mockResolvedValue(makePreview());
    commitImportMock.mockResolvedValue(makeCommitResult());
    const albums: Album[] = [
      { id: "alb1", name: "旅行", albumType: "manual", source: "viewer", photoCount: 2 },
    ];

    render(<ImportWizard albums={albums} onClose={vi.fn()} onImportComplete={vi.fn()} />);
    await advanceToPreview(user);

    await user.click(screen.getByRole("radio", { name: /既存のアルバムに追加/ }));
    await user.selectOptions(screen.getByRole("combobox"), "alb1");
    await user.click(screen.getByRole("button", { name: /件を取り込む/ }));

    await waitFor(() => expect(commitImportMock).toHaveBeenCalledWith(["D:/DCIM/a.jpg"], null));
    await waitFor(() =>
      expect(addPhotosToAlbumMock).toHaveBeenCalledWith("alb1", ["P-NEW-1"])
    );
  });

  it("shows copying progress reported by useImportProgress", async () => {
    const user = userEvent.setup();
    pickImportSourceFolderMock.mockResolvedValue("D:/DCIM");
    scanImportSourceMock.mockResolvedValue(makePreview());
    commitImportMock.mockReturnValue(new Promise(() => {}));
    useImportProgressMock.mockReturnValue({
      progress: { phase: "copying", current: 2, total: 5, currentFile: "a.jpg" },
      reset: vi.fn(),
    });

    render(<ImportWizard albums={[]} onClose={vi.fn()} onImportComplete={vi.fn()} />);
    await advanceToPreview(user);
    await user.click(screen.getByRole("button", { name: /件を取り込む/ }));

    expect(await screen.findByText(/2\s*\/\s*5/)).toBeInTheDocument();
  });

  it("shows a done summary after a successful commit", async () => {
    const user = userEvent.setup();
    pickImportSourceFolderMock.mockResolvedValue("D:/DCIM");
    scanImportSourceMock.mockResolvedValue(makePreview());
    commitImportMock.mockResolvedValue(
      makeCommitResult({ insertedCount: 1, duplicateCount: 0, failedFiles: [] })
    );

    render(<ImportWizard albums={[]} onClose={vi.fn()} onImportComplete={vi.fn()} />);
    await advanceToPreview(user);
    await user.click(screen.getByRole("button", { name: /件を取り込む/ }));

    expect(await screen.findByText(/取り込みが完了しました/)).toBeInTheDocument();
    expect(screen.getByText(/1件/)).toBeInTheDocument();
  });

  it("warns when the commit was interrupted before processing every selected item", async () => {
    const user = userEvent.setup();
    pickImportSourceFolderMock.mockResolvedValue("D:/DCIM");
    scanImportSourceMock.mockResolvedValue(
      makePreview({
        newCount: 3,
        items: [
          {
            sourcePath: "a.jpg",
            filename: "a.jpg",
            kind: "photo",
            dedupStatus: { status: "new" },
            dateTaken: null,
          },
          {
            sourcePath: "b.jpg",
            filename: "b.jpg",
            kind: "photo",
            dedupStatus: { status: "new" },
            dateTaken: null,
          },
          {
            sourcePath: "c.jpg",
            filename: "c.jpg",
            kind: "photo",
            dedupStatus: { status: "new" },
            dateTaken: null,
          },
        ],
      })
    );
    // 3件選択したが、応答上は1件挿入・失敗0件・重複0件＝2件が未着手のまま中断された。
    commitImportMock.mockResolvedValue(
      makeCommitResult({ insertedCount: 1, insertedPhotoIds: ["P-1"], duplicateCount: 0, failedFiles: [] })
    );

    render(<ImportWizard albums={[]} onClose={vi.fn()} onImportComplete={vi.fn()} />);
    await advanceToPreview(user);
    await user.click(screen.getByRole("button", { name: /件を取り込む/ }));

    expect(await screen.findByText(/中断されました/)).toBeInTheDocument();
  });

  it("does not warn about interruption when every selected item is accounted for", async () => {
    const user = userEvent.setup();
    pickImportSourceFolderMock.mockResolvedValue("D:/DCIM");
    scanImportSourceMock.mockResolvedValue(makePreview());
    commitImportMock.mockResolvedValue(
      makeCommitResult({ insertedCount: 0, insertedPhotoIds: [], duplicateCount: 0, failedFiles: ["a.jpg"] })
    );

    render(<ImportWizard albums={[]} onClose={vi.fn()} onImportComplete={vi.fn()} />);
    await advanceToPreview(user);
    await user.click(screen.getByRole("button", { name: /件を取り込む/ }));

    await screen.findByText(/取り込みが完了しました/);
    expect(screen.queryByText(/中断されました/)).not.toBeInTheDocument();
  });

  it("calls onImportComplete and onClose when viewing imported photos", async () => {
    const user = userEvent.setup();
    const onImportComplete = vi.fn();
    const onClose = vi.fn();
    pickImportSourceFolderMock.mockResolvedValue("D:/DCIM");
    scanImportSourceMock.mockResolvedValue(makePreview());
    commitImportMock.mockResolvedValue(makeCommitResult({ insertedPhotoIds: ["P-NEW-1"] }));

    render(<ImportWizard albums={[]} onClose={onClose} onImportComplete={onImportComplete} />);
    await advanceToPreview(user);
    await user.click(screen.getByRole("button", { name: /件を取り込む/ }));
    await screen.findByText(/取り込みが完了しました/);

    await user.click(screen.getByRole("button", { name: "取り込んだ写真を見る" }));

    expect(onImportComplete).toHaveBeenCalledWith(["P-NEW-1"]);
    expect(onClose).toHaveBeenCalled();
  });

  it("shows an error and returns to the pick step when scanning fails", async () => {
    const user = userEvent.setup();
    pickImportSourceFolderMock.mockResolvedValue("D:/DCIM");
    scanImportSourceMock.mockRejectedValue("アーカイブフォルダが設定されていません");

    render(<ImportWizard albums={[]} onClose={vi.fn()} onImportComplete={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "フォルダを選択" }));

    expect(await screen.findByText("アーカイブフォルダが設定されていません")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "フォルダを選択" })).toBeInTheDocument();
  });

  it("shows an error and returns to the preview step when commit fails, preserving the selection", async () => {
    const user = userEvent.setup();
    pickImportSourceFolderMock.mockResolvedValue("D:/DCIM");
    scanImportSourceMock.mockResolvedValue(makePreview());
    commitImportMock.mockRejectedValue("ディスクの空き容量が不足しています");

    render(<ImportWizard albums={[]} onClose={vi.fn()} onImportComplete={vi.fn()} />);
    await advanceToPreview(user);
    await user.click(screen.getByRole("button", { name: /件を取り込む/ }));

    expect(await screen.findByText("ディスクの空き容量が不足しています")).toBeInTheDocument();
    expect(await screen.findByRole("checkbox", { name: "a.jpg" })).toBeChecked();
  });

  it("calls onClose when the close button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ImportWizard albums={[]} onClose={onClose} onImportComplete={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "閉じる" }));

    expect(onClose).toHaveBeenCalled();
  });

  it("disables the close button while scanning is in progress", async () => {
    const user = userEvent.setup();
    pickImportSourceFolderMock.mockResolvedValue("D:/DCIM");
    scanImportSourceMock.mockReturnValue(new Promise(() => {}));

    render(<ImportWizard albums={[]} onClose={vi.fn()} onImportComplete={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "フォルダを選択" }));

    expect(await screen.findByRole("button", { name: "閉じる" })).toBeDisabled();
  });

  it("shows an error (instead of getting stuck) when the folder picker itself fails", async () => {
    const user = userEvent.setup();
    pickImportSourceFolderMock.mockRejectedValue("フォルダ選択ダイアログを開けませんでした");

    render(<ImportWizard albums={[]} onClose={vi.fn()} onImportComplete={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "フォルダを選択" }));

    expect(await screen.findByText("フォルダ選択ダイアログを開けませんでした")).toBeInTheDocument();
    expect(scanImportSourceMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "フォルダを選択" })).toBeInTheDocument();
  });

  it("moves initial focus into the dialog when it opens", async () => {
    render(<ImportWizard albums={[]} onClose={vi.fn()} onImportComplete={vi.fn()} />);

    await waitFor(() => expect(screen.getByRole("button", { name: "閉じる" })).toHaveFocus());
  });

  it("closes when Escape is pressed", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ImportWizard albums={[]} onClose={onClose} onImportComplete={vi.fn()} />);

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalled();
  });

  it("does not close on Escape while scanning is in progress", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    pickImportSourceFolderMock.mockResolvedValue("D:/DCIM");
    scanImportSourceMock.mockReturnValue(new Promise(() => {}));

    render(<ImportWizard albums={[]} onClose={onClose} onImportComplete={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "フォルダを選択" }));

    await user.keyboard("{Escape}");

    expect(onClose).not.toHaveBeenCalled();
  });

  it("wraps focus from the last to the first focusable element when tabbing forward", () => {
    render(<ImportWizard albums={[]} onClose={vi.fn()} onImportComplete={vi.fn()} />);
    const closeButton = screen.getByRole("button", { name: "閉じる" });
    const pickButton = screen.getByRole("button", { name: "フォルダを選択" });
    pickButton.focus();
    expect(pickButton).toHaveFocus();

    fireEvent.keyDown(screen.getByRole("dialog", { name: "写真を取り込む" }), { key: "Tab" });

    expect(closeButton).toHaveFocus();
  });

  it("wraps focus from the first to the last focusable element when shift-tabbing backward", () => {
    render(<ImportWizard albums={[]} onClose={vi.fn()} onImportComplete={vi.fn()} />);
    const closeButton = screen.getByRole("button", { name: "閉じる" });
    const pickButton = screen.getByRole("button", { name: "フォルダを選択" });
    closeButton.focus();
    expect(closeButton).toHaveFocus();

    fireEvent.keyDown(screen.getByRole("dialog", { name: "写真を取り込む" }), {
      key: "Tab",
      shiftKey: true,
    });

    expect(pickButton).toHaveFocus();
  });

  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <div>
        <button type="button" onClick={() => setOpen(true)}>
          開く
        </button>
        {open && (
          <ImportWizard albums={[]} onClose={() => setOpen(false)} onImportComplete={vi.fn()} />
        )}
      </div>
    );
  }

  it("returns focus to the trigger element after closing", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "開く" }));
    expect(await screen.findByRole("dialog", { name: "写真を取り込む" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "閉じる" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "開く" })).toHaveFocus());
  });

  it("marks error messages with role=alert so screen readers announce them", async () => {
    const user = userEvent.setup();
    pickImportSourceFolderMock.mockResolvedValue("D:/DCIM");
    scanImportSourceMock.mockRejectedValue("アーカイブフォルダが設定されていません");

    render(<ImportWizard albums={[]} onClose={vi.fn()} onImportComplete={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "フォルダを選択" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "アーカイブフォルダが設定されていません"
    );
  });

  it("marks progress text with role=status so screen readers announce it", async () => {
    const user = userEvent.setup();
    pickImportSourceFolderMock.mockResolvedValue("D:/DCIM");
    scanImportSourceMock.mockReturnValue(new Promise(() => {}));
    useImportProgressMock.mockReturnValue({
      progress: { phase: "scanning", current: 4, total: 10, currentFile: "a.jpg" },
      reset: vi.fn(),
    });

    render(<ImportWizard albums={[]} onClose={vi.fn()} onImportComplete={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "フォルダを選択" }));

    expect(await screen.findByRole("status")).toHaveTextContent(/4\s*\/\s*10/);
  });

  it("marks the undo warning with role=status", async () => {
    const user = userEvent.setup();
    pickImportSourceFolderMock.mockResolvedValue("D:/DCIM");
    scanImportSourceMock.mockResolvedValue(makePreview());

    render(<ImportWizard albums={[]} onClose={vi.fn()} onImportComplete={vi.fn()} />);
    await advanceToPreview(user);

    expect(screen.getByRole("status")).toHaveTextContent(/取り消せません/);
  });

  it("shows an album warning when adding to the existing album fails after a successful commit", async () => {
    const user = userEvent.setup();
    pickImportSourceFolderMock.mockResolvedValue("D:/DCIM");
    scanImportSourceMock.mockResolvedValue(makePreview());
    commitImportMock.mockResolvedValue(makeCommitResult());
    addPhotosToAlbumMock.mockRejectedValue("アルバムへの追加に失敗しました");
    const albums: Album[] = [
      { id: "alb1", name: "旅行", albumType: "manual", source: "viewer", photoCount: 2 },
    ];

    render(<ImportWizard albums={albums} onClose={vi.fn()} onImportComplete={vi.fn()} />);
    await advanceToPreview(user);
    await user.click(screen.getByRole("radio", { name: "既存のアルバムに追加" }));
    await user.selectOptions(screen.getByRole("combobox"), "alb1");
    await user.click(screen.getByRole("button", { name: /件を取り込む/ }));

    expect(await screen.findByText("アルバムへの追加に失敗しました")).toBeInTheDocument();
    // 取り込み自体は成功しているので、完了サマリと「取り込んだ写真を見る」は表示されたまま。
    expect(screen.getByText(/取り込みが完了しました/)).toBeInTheDocument();
  });

  it("re-disables the new-album name field when switching the radio back to 'no album'", async () => {
    const user = userEvent.setup();
    pickImportSourceFolderMock.mockResolvedValue("D:/DCIM");
    scanImportSourceMock.mockResolvedValue(makePreview());

    render(<ImportWizard albums={[]} onClose={vi.fn()} onImportComplete={vi.fn()} />);
    await advanceToPreview(user);

    await user.click(screen.getByRole("radio", { name: /新しいアルバムを作成/ }));
    expect(screen.getByLabelText("新しいアルバム名")).toBeEnabled();

    await user.click(screen.getByRole("radio", { name: "アルバムに追加しない" }));

    expect(screen.getByLabelText("新しいアルバム名")).toBeDisabled();
  });

  it("logs a warning when the reported commit counts exceed the number of selected items", async () => {
    const user = userEvent.setup();
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    pickImportSourceFolderMock.mockResolvedValue("D:/DCIM");
    scanImportSourceMock.mockResolvedValue(makePreview());
    // makePreview()の既定は1件選択に対し、insertedCountが5件と矛盾する異常値。
    commitImportMock.mockResolvedValue(
      makeCommitResult({ insertedCount: 5, insertedPhotoIds: ["P-1"], duplicateCount: 0, failedFiles: [] })
    );

    render(<ImportWizard albums={[]} onClose={vi.fn()} onImportComplete={vi.fn()} />);
    await advanceToPreview(user);
    await user.click(screen.getByRole("button", { name: /件を取り込む/ }));

    await screen.findByText(/取り込みが完了しました/);
    expect(consoleWarn).toHaveBeenCalled();
    consoleWarn.mockRestore();
  });

  it("keeps the new-album radio's accessible name stable without the nested text input", async () => {
    const user = userEvent.setup();
    pickImportSourceFolderMock.mockResolvedValue("D:/DCIM");
    scanImportSourceMock.mockResolvedValue(makePreview());

    render(<ImportWizard albums={[]} onClose={vi.fn()} onImportComplete={vi.fn()} />);
    await advanceToPreview(user);

    const radio = screen.getByRole("radio", { name: "新しいアルバムを作成" });
    expect(radio).toBeInTheDocument();
    expect(screen.getByLabelText("新しいアルバム名")).toBeInTheDocument();
  });
});
