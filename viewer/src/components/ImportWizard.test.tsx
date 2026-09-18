import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
});
