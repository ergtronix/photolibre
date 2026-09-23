import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import App from "./App";
import type { Album, Photo } from "./lib/types";

const {
  getArchivePathMock,
  pickAndSetArchivePathMock,
  listAlbumsMock,
  listPhotosMock,
  listPhotoYearsMock,
  listAlbumPhotosMock,
  searchPhotosMock,
  listUnfiledPhotosMock,
  countUnfiledPhotosMock,
  createAlbumMock,
  renameAlbumMock,
  deleteViewerAlbumMock,
  addPhotosToAlbumMock,
  removePhotoFromAlbumMock,
  unfilePhotosMock,
  readPhotoDataUrlMock,
  getThumbnailDataUrlMock,
  getPhotoRotationMock,
  setPhotoRotationMock,
  listPhotosByIdsMock,
  pickImportSourceFolderMock,
  scanImportSourceMock,
  commitImportMock,
  getImportPreviewThumbnailMock,
  useImportProgressMock,
} = vi.hoisted(() => ({
  getArchivePathMock: vi.fn(),
  pickAndSetArchivePathMock: vi.fn(),
  listAlbumsMock: vi.fn(),
  listPhotosMock: vi.fn(),
  listPhotoYearsMock: vi.fn(),
  listAlbumPhotosMock: vi.fn(),
  searchPhotosMock: vi.fn(),
  listUnfiledPhotosMock: vi.fn(),
  countUnfiledPhotosMock: vi.fn(),
  createAlbumMock: vi.fn(),
  renameAlbumMock: vi.fn(),
  deleteViewerAlbumMock: vi.fn(),
  addPhotosToAlbumMock: vi.fn(),
  removePhotoFromAlbumMock: vi.fn(),
  unfilePhotosMock: vi.fn(),
  readPhotoDataUrlMock: vi.fn(),
  getThumbnailDataUrlMock: vi.fn(),
  getPhotoRotationMock: vi.fn(),
  setPhotoRotationMock: vi.fn(),
  listPhotosByIdsMock: vi.fn(),
  pickImportSourceFolderMock: vi.fn(),
  scanImportSourceMock: vi.fn(),
  commitImportMock: vi.fn(),
  getImportPreviewThumbnailMock: vi.fn(),
  useImportProgressMock: vi.fn(),
}));

vi.mock("./lib/api", () => ({
  getArchivePath: getArchivePathMock,
  pickAndSetArchivePath: pickAndSetArchivePathMock,
  listAlbums: listAlbumsMock,
  listPhotos: listPhotosMock,
  listPhotoYears: listPhotoYearsMock,
  listAlbumPhotos: listAlbumPhotosMock,
  searchPhotos: searchPhotosMock,
  listUnfiledPhotos: listUnfiledPhotosMock,
  countUnfiledPhotos: countUnfiledPhotosMock,
  createAlbum: createAlbumMock,
  renameAlbum: renameAlbumMock,
  deleteViewerAlbum: deleteViewerAlbumMock,
  addPhotosToAlbum: addPhotosToAlbumMock,
  removePhotoFromAlbum: removePhotoFromAlbumMock,
  unfilePhotos: unfilePhotosMock,
  readPhotoDataUrl: readPhotoDataUrlMock,
  getThumbnailDataUrl: getThumbnailDataUrlMock,
  getPhotoRotation: getPhotoRotationMock,
  setPhotoRotation: setPhotoRotationMock,
  setArchivePath: vi.fn(),
  listPhotosByIds: listPhotosByIdsMock,
  pickImportSourceFolder: pickImportSourceFolderMock,
  scanImportSource: scanImportSourceMock,
  commitImport: commitImportMock,
  getImportPreviewThumbnail: getImportPreviewThumbnailMock,
}));

vi.mock("./lib/useImportProgress", () => ({
  useImportProgress: useImportProgressMock,
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

function makePhoto(overrides: Partial<Photo> = {}): Photo {
  return {
    id: "1",
    filename: "a.jpg",
    filepath: "photos/2020/01/a.jpg",
    mediaType: "photo",
    dateTaken: "2020-01-01T00:00:00",
    dateAdded: null,
    latitude: null,
    longitude: null,
    favorite: false,
    hidden: false,
    title: null,
    description: null,
    width: 100,
    height: 100,
    source: "source_a",
    albumNames: null,
    ...overrides,
  };
}

function makeAlbum(overrides: Partial<Album> = {}): Album {
  return {
    id: "alb1",
    name: "旅行",
    albumType: "manual",
    source: "source_a",
    photoCount: 1,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  listPhotoYearsMock.mockResolvedValue([]);
  readPhotoDataUrlMock.mockResolvedValue("data:image/jpeg;base64,AAAA");
  getThumbnailDataUrlMock.mockResolvedValue("data:image/jpeg;base64,AAAA");
  getPhotoRotationMock.mockResolvedValue(0);
  setPhotoRotationMock.mockResolvedValue(undefined);
  listUnfiledPhotosMock.mockResolvedValue([]);
  countUnfiledPhotosMock.mockResolvedValue(0);
  listAlbumPhotosMock.mockResolvedValue([]);
  addPhotosToAlbumMock.mockResolvedValue(undefined);
  removePhotoFromAlbumMock.mockResolvedValue(undefined);
  unfilePhotosMock.mockResolvedValue({});
  renameAlbumMock.mockResolvedValue(undefined);
  deleteViewerAlbumMock.mockResolvedValue(undefined);
  listPhotosByIdsMock.mockResolvedValue([]);
  getImportPreviewThumbnailMock.mockResolvedValue("data:image/jpeg;base64,AAAA");
  useImportProgressMock.mockReturnValue({ progress: null, reset: vi.fn() });
});

describe("App", () => {
  it("shows the archive picker when no archive path is configured", async () => {
    getArchivePathMock.mockResolvedValue(null);

    render(<App />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "フォルダを選択" })).toBeInTheDocument()
    );
  });

  it("loads albums and photos once an archive path is configured", async () => {
    getArchivePathMock.mockResolvedValue("E:/archive");
    listAlbumsMock.mockResolvedValue([makeAlbum()]);
    listPhotosMock.mockResolvedValue([makePhoto()]);

    render(<App />);

    await waitFor(() => expect(screen.getByText("旅行")).toBeInTheDocument());
    const photoGrid = screen.getByRole("grid", { name: "写真一覧" });
    expect(within(photoGrid).getAllByRole("gridcell").filter((cell) => cell.querySelector("button"))).toHaveLength(
      1
    );
  });

  it("switches to album photos when an album is selected", async () => {
    const user = userEvent.setup();
    getArchivePathMock.mockResolvedValue("E:/archive");
    listAlbumsMock.mockResolvedValue([makeAlbum({ id: "alb1", name: "旅行" })]);
    listPhotosMock.mockResolvedValue([makePhoto({ id: "1" })]);
    listAlbumPhotosMock.mockResolvedValue([makePhoto({ id: "2" }), makePhoto({ id: "3" })]);

    render(<App />);
    await waitFor(() => expect(screen.getByText("旅行")).toBeInTheDocument());

    await user.click(screen.getByText("旅行"));

    await waitFor(() => expect(listAlbumPhotosMock).toHaveBeenCalledWith("alb1"));
  });

  it("switches to search results when a search is submitted", async () => {
    const user = userEvent.setup();
    getArchivePathMock.mockResolvedValue("E:/archive");
    listAlbumsMock.mockResolvedValue([]);
    listPhotosMock.mockResolvedValue([makePhoto({ id: "1" })]);
    searchPhotosMock.mockResolvedValue([makePhoto({ id: "2", filename: "sunset.jpg" })]);

    render(<App />);
    await waitFor(() => expect(listPhotosMock).toHaveBeenCalled());

    await user.type(screen.getByLabelText("検索"), "sunset");
    await user.click(screen.getByRole("button", { name: "検索" }));

    await waitFor(() => expect(searchPhotosMock).toHaveBeenCalledWith("sunset"));
  });

  it("opens the lightbox when a photo is clicked", async () => {
    const user = userEvent.setup();
    getArchivePathMock.mockResolvedValue("E:/archive");
    listAlbumsMock.mockResolvedValue([]);
    listPhotosMock.mockResolvedValue([makePhoto({ id: "1", filename: "a.jpg" })]);

    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "a.jpg" })).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "a.jpg" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("allows switching to a different archive folder once one is already configured", async () => {
    const user = userEvent.setup();
    getArchivePathMock.mockResolvedValue("E:/archive");
    listAlbumsMock.mockResolvedValue([makeAlbum({ id: "alb1", name: "旅行" })]);
    listPhotosMock.mockResolvedValue([makePhoto({ id: "1" })]);
    pickAndSetArchivePathMock.mockResolvedValue("E:/other-archive");

    render(<App />);
    await waitFor(() => expect(screen.getByText("旅行")).toBeInTheDocument());

    listAlbumsMock.mockResolvedValue([]);
    listPhotosMock.mockResolvedValue([]);

    await user.click(screen.getByRole("button", { name: "アーカイブフォルダを変更" }));

    await waitFor(() => expect(pickAndSetArchivePathMock).toHaveBeenCalled());
    await waitFor(() => expect(listAlbumsMock).toHaveBeenCalledTimes(2));
  });

  it("does nothing when the archive-change dialog is cancelled", async () => {
    const user = userEvent.setup();
    getArchivePathMock.mockResolvedValue("E:/archive");
    listAlbumsMock.mockResolvedValue([makeAlbum({ id: "alb1", name: "旅行" })]);
    listPhotosMock.mockResolvedValue([makePhoto({ id: "1" })]);
    pickAndSetArchivePathMock.mockResolvedValue(null);

    render(<App />);
    await waitFor(() => expect(screen.getByText("旅行")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "アーカイブフォルダを変更" }));

    await waitFor(() => expect(pickAndSetArchivePathMock).toHaveBeenCalled());
    expect(listAlbumsMock).toHaveBeenCalledTimes(1);
  });

  // ---- 年の絞り込み一覧を、写真のある年から作る（TASK-390） ----

  function yearOptionLabels(): string[] {
    return within(screen.getByLabelText("年"))
      .getAllByRole("option")
      .map((option) => option.textContent ?? "");
  }

  it("builds the year filter from the years that have photos in the archive", async () => {
    getArchivePathMock.mockResolvedValue("E:/archive");
    listAlbumsMock.mockResolvedValue([]);
    listPhotosMock.mockResolvedValue([]);
    listPhotoYearsMock.mockResolvedValue([2027, 2026, 2019]);

    render(<App />);

    await waitFor(() => expect(yearOptionLabels()).toEqual(["すべて", "2027", "2026", "2019"]));
    expect(listPhotoYearsMock).toHaveBeenCalledTimes(1);
  });

  it("filters photos by a year chosen from the generated year list", async () => {
    const user = userEvent.setup();
    getArchivePathMock.mockResolvedValue("E:/archive");
    listAlbumsMock.mockResolvedValue([]);
    listPhotosMock.mockResolvedValue([]);
    listPhotoYearsMock.mockResolvedValue([2027, 2019]);

    render(<App />);
    await waitFor(() => expect(yearOptionLabels()).toContain("2027"));

    await user.selectOptions(screen.getByLabelText("年"), "2027");

    await waitFor(() =>
      expect(listPhotosMock).toHaveBeenLastCalledWith(expect.objectContaining({ year: 2027 }))
    );
  });

  it("shows only 'すべて' in the year filter when switching to an archive with no dated photos", async () => {
    const user = userEvent.setup();
    getArchivePathMock.mockResolvedValue("E:/archive");
    listAlbumsMock.mockResolvedValue([]);
    listPhotosMock.mockResolvedValue([]);
    listPhotoYearsMock.mockResolvedValue([2020]);
    pickAndSetArchivePathMock.mockResolvedValue("E:/other-archive");

    render(<App />);
    await waitFor(() => expect(yearOptionLabels()).toEqual(["すべて", "2020"]));

    listPhotoYearsMock.mockResolvedValue([]);
    await user.click(screen.getByRole("button", { name: "アーカイブフォルダを変更" }));

    await waitFor(() => expect(listPhotoYearsMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(yearOptionLabels()).toEqual(["すべて"]));
  });

  // 回帰テスト（TASK-391修正2）: アーカイブを切り替えた直後、新しい年の一覧が
  // 読み込まれるまでの間、前のアーカイブの年が一瞬残ってしまうと、まだ古い
  // アーカイブの写真であるかのように誤解させる。切り替えた瞬間に一旦
  // 「すべて」だけにリセットされることを確認する（listPhotoYearsの解決を
  // 保留したまま検証する）。
  it("clears the year filter options immediately when the archive is changed, before the new years finish loading", async () => {
    const user = userEvent.setup();
    getArchivePathMock.mockResolvedValue("E:/archive");
    listAlbumsMock.mockResolvedValue([]);
    listPhotosMock.mockResolvedValue([]);
    listPhotoYearsMock.mockResolvedValue([2020]);
    pickAndSetArchivePathMock.mockResolvedValue("E:/other-archive");

    render(<App />);
    await waitFor(() => expect(yearOptionLabels()).toEqual(["すべて", "2020"]));

    let resolveYears: (years: number[]) => void = () => {};
    listPhotoYearsMock.mockReturnValue(
      new Promise<number[]>((resolve) => {
        resolveYears = resolve;
      })
    );

    await user.click(screen.getByRole("button", { name: "アーカイブフォルダを変更" }));

    await waitFor(() => expect(yearOptionLabels()).toEqual(["すべて"]));

    resolveYears([2031]);
    await waitFor(() => expect(yearOptionLabels()).toEqual(["すべて", "2031"]));
  });

  it("reloads the year list when the archive folder is changed", async () => {
    const user = userEvent.setup();
    getArchivePathMock.mockResolvedValue("E:/archive");
    listAlbumsMock.mockResolvedValue([]);
    listPhotosMock.mockResolvedValue([]);
    listPhotoYearsMock.mockResolvedValue([2020]);
    pickAndSetArchivePathMock.mockResolvedValue("E:/other-archive");

    render(<App />);
    await waitFor(() => expect(yearOptionLabels()).toEqual(["すべて", "2020"]));

    listPhotoYearsMock.mockResolvedValue([2031, 2030]);
    await user.click(screen.getByRole("button", { name: "アーカイブフォルダを変更" }));

    await waitFor(() => expect(listPhotoYearsMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(yearOptionLabels()).toEqual(["すべて", "2031", "2030"]));
  });

  it("clears the selected year when switching archives so the selection does not go out of sync", async () => {
    const user = userEvent.setup();
    getArchivePathMock.mockResolvedValue("E:/archive");
    listAlbumsMock.mockResolvedValue([]);
    listPhotosMock.mockResolvedValue([]);
    listPhotoYearsMock.mockResolvedValue([2020]);
    pickAndSetArchivePathMock.mockResolvedValue("E:/other-archive");

    render(<App />);
    await waitFor(() => expect(yearOptionLabels()).toEqual(["すべて", "2020"]));
    await user.selectOptions(screen.getByLabelText("年"), "2020");
    await waitFor(() =>
      expect(listPhotosMock).toHaveBeenLastCalledWith(expect.objectContaining({ year: 2020 }))
    );

    listPhotoYearsMock.mockResolvedValue([2031]);
    await user.click(screen.getByRole("button", { name: "アーカイブフォルダを変更" }));

    await waitFor(() => expect(yearOptionLabels()).toEqual(["すべて", "2031"]));
    expect((screen.getByLabelText("年") as HTMLSelectElement).value).toBe("");
  });

  it("does not reload the year list when the archive-change dialog is cancelled", async () => {
    const user = userEvent.setup();
    getArchivePathMock.mockResolvedValue("E:/archive");
    listAlbumsMock.mockResolvedValue([]);
    listPhotosMock.mockResolvedValue([]);
    listPhotoYearsMock.mockResolvedValue([2020]);
    pickAndSetArchivePathMock.mockResolvedValue(null);

    render(<App />);
    await waitFor(() => expect(yearOptionLabels()).toEqual(["すべて", "2020"]));

    await user.click(screen.getByRole("button", { name: "アーカイブフォルダを変更" }));
    await waitFor(() => expect(pickAndSetArchivePathMock).toHaveBeenCalled());

    expect(listPhotoYearsMock).toHaveBeenCalledTimes(1);
  });

  // 回帰テスト（TASK-391修正3、ImportWizard.test.tsx:120付近の書き方を参考）:
  // このエフェクト（年の一覧の読み込み）はTASK-391で新規に書かれたコードであり、
  // 実在した不具合の再現ではない。ImportWizardで過去に実在したバグパターン
  // （クリーンアップでcancelled/isMountedをfalseにしたきり、エフェクト本体で
  // trueに戻さないため、React.StrictModeの二重実行後に状態が反映されなくなる）
  // を、このeffectが踏んでいないことを確認する、保険的なテストである。
  it("loads the year list correctly even under React.StrictMode's double-invoked effects", async () => {
    getArchivePathMock.mockResolvedValue("E:/archive");
    listAlbumsMock.mockResolvedValue([]);
    listPhotosMock.mockResolvedValue([]);
    listPhotoYearsMock.mockResolvedValue([2027, 2020]);

    render(<App />, { wrapper: StrictMode });

    await waitFor(() => expect(yearOptionLabels()).toEqual(["すべて", "2027", "2020"]));
  });

  async function runImportUntilDone(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "写真を取り込む" }));
    await user.click(screen.getByRole("button", { name: "フォルダを選択" }));
    await screen.findByRole("grid", { name: "取り込みプレビュー" });
    await user.click(screen.getByRole("button", { name: /件を取り込む/ }));
    await screen.findByText(/取り込みが完了しました/);
  }

  function arrangeImportOfNewYearPhoto() {
    pickImportSourceFolderMock.mockResolvedValue("D:/DCIM");
    scanImportSourceMock.mockResolvedValue({
      newCount: 1,
      duplicateCount: 0,
      errorCount: 0,
      skippedCount: 0,
      items: [
        {
          sourcePath: "D:/DCIM/a.jpg",
          filename: "a.jpg",
          kind: "photo",
          dedupStatus: { status: "new" },
          dateTaken: "2027-01-05T10:00:00",
        },
      ],
    });
    commitImportMock.mockResolvedValue({
      insertedCount: 1,
      insertedPhotoIds: ["P-NEW-1"],
      duplicateCount: 0,
      failedFiles: [],
    });
    listPhotosByIdsMock.mockResolvedValue([makePhoto({ id: "P-NEW-1", filename: "imported.jpg" })]);
  }

  it("reloads the year list after an import finishes and the wizard is closed with the close button", async () => {
    const user = userEvent.setup();
    getArchivePathMock.mockResolvedValue("E:/archive");
    listAlbumsMock.mockResolvedValue([]);
    listPhotosMock.mockResolvedValue([]);
    listPhotoYearsMock.mockResolvedValue([2020]);
    arrangeImportOfNewYearPhoto();

    render(<App />);
    await waitFor(() => expect(yearOptionLabels()).toEqual(["すべて", "2020"]));

    await runImportUntilDone(user);
    listPhotoYearsMock.mockResolvedValue([2027, 2020]);
    const closeButtons = within(screen.getByRole("dialog", { name: "写真を取り込む" })).getAllByRole(
      "button",
      { name: "閉じる" }
    );
    await user.click(closeButtons[closeButtons.length - 1]);

    await waitFor(() => expect(listPhotoYearsMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(yearOptionLabels()).toEqual(["すべて", "2027", "2020"]));
  });

  // TASK-392: 「閉じる」で閉じたとき、アルバム一覧・現在の写真一覧（「すべての写真」）が
  // 読み込み直されることを確認する回帰テスト。
  it("reloads the album list and the 'all photos' view after an import finishes and the wizard is closed with the close button", async () => {
    const user = userEvent.setup();
    getArchivePathMock.mockResolvedValue("E:/archive");
    listAlbumsMock.mockResolvedValue([]);
    listPhotosMock.mockResolvedValue([]);
    listPhotoYearsMock.mockResolvedValue([2020]);
    arrangeImportOfNewYearPhoto();

    render(<App />);
    await waitFor(() => expect(yearOptionLabels()).toEqual(["すべて", "2020"]));
    expect(listAlbumsMock).toHaveBeenCalledTimes(1);
    expect(listPhotosMock).toHaveBeenCalledTimes(1);

    await runImportUntilDone(user);
    listAlbumsMock.mockResolvedValue([makeAlbum({ id: "alb-new", name: "新しいアルバム" })]);
    listPhotosMock.mockResolvedValue([makePhoto({ id: "P-NEW-1", filename: "imported.jpg" })]);
    const closeButtons = within(screen.getByRole("dialog", { name: "写真を取り込む" })).getAllByRole(
      "button",
      { name: "閉じる" }
    );
    await user.click(closeButtons[closeButtons.length - 1]);

    await waitFor(() => expect(listAlbumsMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(listPhotosMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText("新しいアルバム")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("img", { name: "imported.jpg" })).toBeInTheDocument());
  });

  // TASK-392: 「未分類」を見ているときも、「閉じる」で写真一覧が読み込み直されることを確認する。
  it("reloads the 'unfiled' photo view after an import finishes and the wizard is closed with the close button", async () => {
    const user = userEvent.setup();
    getArchivePathMock.mockResolvedValue("E:/archive");
    listAlbumsMock.mockResolvedValue([]);
    listPhotosMock.mockResolvedValue([]);
    listPhotoYearsMock.mockResolvedValue([2020]);
    countUnfiledPhotosMock.mockResolvedValue(1);
    listUnfiledPhotosMock.mockResolvedValue([]);
    arrangeImportOfNewYearPhoto();

    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: /未分類/ })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /未分類/ }));
    await waitFor(() => expect(listUnfiledPhotosMock).toHaveBeenCalledTimes(1));

    await runImportUntilDone(user);
    listUnfiledPhotosMock.mockResolvedValue([makePhoto({ id: "P-NEW-1", filename: "imported.jpg" })]);
    const closeButtons = within(screen.getByRole("dialog", { name: "写真を取り込む" })).getAllByRole(
      "button",
      { name: "閉じる" }
    );
    await user.click(closeButtons[closeButtons.length - 1]);

    await waitFor(() => expect(listUnfiledPhotosMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole("img", { name: "imported.jpg" })).toBeInTheDocument());
  });

  it("reloads the year list after an import finishes and the imported photos are viewed", async () => {
    const user = userEvent.setup();
    getArchivePathMock.mockResolvedValue("E:/archive");
    listAlbumsMock.mockResolvedValue([]);
    listPhotosMock.mockResolvedValue([]);
    listPhotoYearsMock.mockResolvedValue([2020]);
    arrangeImportOfNewYearPhoto();

    render(<App />);
    await waitFor(() => expect(yearOptionLabels()).toEqual(["すべて", "2020"]));

    await runImportUntilDone(user);
    listPhotoYearsMock.mockResolvedValue([2027, 2020]);
    await user.click(screen.getByRole("button", { name: "取り込んだ写真を見る" }));

    await waitFor(() => expect(listPhotoYearsMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(listPhotosByIdsMock).toHaveBeenCalledWith(["P-NEW-1"]));

    // importResultビュー中はFilterBar（年の絞り込み）が表示されないため、
    // 「すべての写真」に戻って、年の一覧が実際に更新されたことを確認する。
    await user.click(screen.getByRole("button", { name: "すべての写真" }));
    await waitFor(() => expect(yearOptionLabels()).toEqual(["すべて", "2027", "2020"]));
  });

  // TASK-393（react-reviewer HIGH指摘の修正）: handleViewImportedが、
  // onImportCompleteとonClose（closeImportWizard経由のreloadCurrentPhotos）を
  // 両方呼んでいたため、取り込み前に見ていたビュー（「すべての写真」）の
  // listPhotosの応答が、listPhotosByIds（取り込んだ写真）の応答より遅れて
  // 返ってくると、取り込んだ写真の表示が古いビューの内容で上書きされる
  // 競合状態があった。この再現テスト。
  it("does not let a delayed reload of the previous view overwrite the imported-photos view", async () => {
    const user = userEvent.setup();
    getArchivePathMock.mockResolvedValue("E:/archive");
    listAlbumsMock.mockResolvedValue([]);
    listPhotoYearsMock.mockResolvedValue([2020]);

    let resolveDelayedListPhotos: (photos: Photo[]) => void = () => {};
    const delayedListPhotosPromise = new Promise<Photo[]>((resolve) => {
      resolveDelayedListPhotos = resolve;
    });
    listPhotosMock.mockResolvedValueOnce([makePhoto({ id: "OLD-1", filename: "old.jpg" })]);
    listPhotosMock.mockReturnValueOnce(delayedListPhotosPromise);

    arrangeImportOfNewYearPhoto();

    render(<App />);
    await waitFor(() => expect(screen.getByRole("img", { name: "old.jpg" })).toBeInTheDocument());

    await runImportUntilDone(user);
    await user.click(screen.getByRole("button", { name: "取り込んだ写真を見る" }));

    await waitFor(() => expect(screen.getByRole("img", { name: "imported.jpg" })).toBeInTheDocument());

    // 取り込み前のビュー（「すべての写真」）の読み込み直しが、ここでようやく解決する。
    // resolveの継続（setPhotosの反映）が確実に処理されるまで待つ
    // （act経由でマクロタスクを1回はさむ。waitForの即時成功による見逃しを防ぐ）。
    await act(async () => {
      resolveDelayedListPhotos([makePhoto({ id: "OLD-1", filename: "old.jpg" })]);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getByRole("img", { name: "imported.jpg" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "old.jpg" })).not.toBeInTheDocument();
  });

  // TASK-393: 「取り込んだ写真を見る」を選んだとき、refreshSidebar（アルバム一覧・
  // 未分類件数の読み込み直し）が1回だけ呼ばれることを確認する
  // （onImportCompleteとcloseImportWizardの二重呼び出しがなくなったこと）。
  it("refreshes the sidebar only once after choosing to view the imported photos", async () => {
    const user = userEvent.setup();
    getArchivePathMock.mockResolvedValue("E:/archive");
    listAlbumsMock.mockResolvedValue([]);
    listPhotosMock.mockResolvedValue([]);
    listPhotoYearsMock.mockResolvedValue([2020]);
    arrangeImportOfNewYearPhoto();

    render(<App />);
    await waitFor(() => expect(listAlbumsMock).toHaveBeenCalledTimes(1));

    await runImportUntilDone(user);
    await user.click(screen.getByRole("button", { name: "取り込んだ写真を見る" }));

    await waitFor(() => expect(listPhotosByIdsMock).toHaveBeenCalledWith(["P-NEW-1"]));
    await waitFor(() => expect(listAlbumsMock).toHaveBeenCalledTimes(2));
    expect(listAlbumsMock).toHaveBeenCalledTimes(2);
  });

  it("shows the unfiled photo count and switches to the unfiled view when selected", async () => {
    const user = userEvent.setup();
    getArchivePathMock.mockResolvedValue("E:/archive");
    listAlbumsMock.mockResolvedValue([]);
    listPhotosMock.mockResolvedValue([]);
    countUnfiledPhotosMock.mockResolvedValue(2);
    listUnfiledPhotosMock.mockResolvedValue([makePhoto({ id: "9", filename: "unfiled.jpg" })]);

    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: /未分類/ })).toHaveTextContent("2"));

    await user.click(screen.getByRole("button", { name: /未分類/ }));

    await waitFor(() => expect(listUnfiledPhotosMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole("button", { name: "unfiled.jpg" })).toBeInTheDocument());
  });

  it("creates a new album via the sidebar and refreshes the album list", async () => {
    const user = userEvent.setup();
    getArchivePathMock.mockResolvedValue("E:/archive");
    listAlbumsMock.mockResolvedValue([]);
    listPhotosMock.mockResolvedValue([]);
    createAlbumMock.mockResolvedValue({
      id: "new-alb",
      name: "夏休み",
      albumType: "manual",
      source: "viewer",
      photoCount: 0,
    });

    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "＋ 新しいアルバム" })).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "＋ 新しいアルバム" }));
    await user.type(screen.getByPlaceholderText("アルバム名"), "夏休み{Enter}");

    await waitFor(() => expect(createAlbumMock).toHaveBeenCalledWith("夏休み"));
    await waitFor(() => expect(listAlbumsMock).toHaveBeenCalledTimes(2));
  });

  it("renames an album via double-click", async () => {
    const user = userEvent.setup();
    getArchivePathMock.mockResolvedValue("E:/archive");
    listAlbumsMock.mockResolvedValue([makeAlbum({ id: "alb1", name: "旅行" })]);
    listPhotosMock.mockResolvedValue([]);

    render(<App />);
    await waitFor(() => expect(screen.getByText("旅行")).toBeInTheDocument());

    await user.dblClick(screen.getByText("旅行"));
    const input = screen.getByDisplayValue("旅行");
    await user.clear(input);
    await user.type(input, "沖縄旅行{Enter}");

    await waitFor(() => expect(renameAlbumMock).toHaveBeenCalledWith("alb1", "沖縄旅行"));
  });

  it("adds dropped photos to an album", async () => {
    getArchivePathMock.mockResolvedValue("E:/archive");
    listAlbumsMock.mockResolvedValue([makeAlbum({ id: "alb1", name: "旅行" })]);
    listPhotosMock.mockResolvedValue([]);

    render(<App />);
    await waitFor(() => expect(screen.getByText("旅行")).toBeInTheDocument());

    const albumItem = screen.getByText("旅行").closest("li");
    if (!albumItem) {
      throw new Error("album list item not found");
    }
    const dataTransfer = {
      getData: (type: string) =>
        type === "application/x-photolibre-photo-ids" ? JSON.stringify(["1", "2"]) : "",
    };
    albumItem.dispatchEvent(
      Object.assign(new Event("drop", { bubbles: true, cancelable: true }), { dataTransfer })
    );

    await waitFor(() => expect(addPhotosToAlbumMock).toHaveBeenCalledWith("alb1", ["1", "2"]));
  });

  it("moves dropped photos to unfiled (removes them from every album)", async () => {
    getArchivePathMock.mockResolvedValue("E:/archive");
    listAlbumsMock.mockResolvedValue([makeAlbum({ id: "alb1", name: "旅行" })]);
    listPhotosMock.mockResolvedValue([]);
    unfilePhotosMock.mockResolvedValue({ "1": ["alb1"] });

    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: /未分類/ })).toBeInTheDocument());

    const unfiledItem = screen.getByRole("button", { name: /未分類/ }).closest("li");
    if (!unfiledItem) {
      throw new Error("unfiled list item not found");
    }
    const dataTransfer = {
      getData: (type: string) =>
        type === "application/x-photolibre-photo-ids" ? JSON.stringify(["1"]) : "",
    };
    unfiledItem.dispatchEvent(
      Object.assign(new Event("drop", { bubbles: true, cancelable: true }), { dataTransfer })
    );

    await waitFor(() => expect(unfilePhotosMock).toHaveBeenCalledWith(["1"]));
  });

  it("undoes moving photos to unfiled by re-adding them to their previous albums", async () => {
    const user = userEvent.setup();
    getArchivePathMock.mockResolvedValue("E:/archive");
    listAlbumsMock.mockResolvedValue([makeAlbum({ id: "alb1", name: "旅行" })]);
    listPhotosMock.mockResolvedValue([]);
    unfilePhotosMock.mockResolvedValue({ "1": ["alb1"] });

    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: /未分類/ })).toBeInTheDocument());

    const unfiledItem = screen.getByRole("button", { name: /未分類/ }).closest("li");
    if (!unfiledItem) {
      throw new Error("unfiled list item not found");
    }
    const dataTransfer = {
      getData: (type: string) =>
        type === "application/x-photolibre-photo-ids" ? JSON.stringify(["1"]) : "",
    };
    unfiledItem.dispatchEvent(
      Object.assign(new Event("drop", { bubbles: true, cancelable: true }), { dataTransfer })
    );
    await waitFor(() => expect(unfilePhotosMock).toHaveBeenCalled());

    await user.click(document.body);
    await user.keyboard("{Control>}z{/Control}");

    await waitFor(() => expect(addPhotosToAlbumMock).toHaveBeenCalledWith("alb1", ["1"]));
  });

  it("removes selected photos from the current album via the selection toolbar", async () => {
    const user = userEvent.setup();
    getArchivePathMock.mockResolvedValue("E:/archive");
    listAlbumsMock.mockResolvedValue([makeAlbum({ id: "alb1", name: "旅行" })]);
    listPhotosMock.mockResolvedValue([]);
    listAlbumPhotosMock.mockResolvedValue([makePhoto({ id: "2", filename: "b.jpg" })]);

    render(<App />);
    await waitFor(() => expect(screen.getByText("旅行")).toBeInTheDocument());

    await user.click(screen.getByText("旅行"));
    await waitFor(() => expect(screen.getByRole("button", { name: "b.jpg" })).toBeInTheDocument());

    await user.keyboard("[ControlLeft>]");
    await user.click(screen.getByRole("button", { name: "b.jpg" }));
    await user.keyboard("[/ControlLeft]");

    await waitFor(() => expect(screen.getByText("1件選択中")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "アルバムから外す" }));

    await waitFor(() => expect(removePhotoFromAlbumMock).toHaveBeenCalledWith("alb1", "2"));
  });

  it("undoes the most recent album creation with Ctrl+Z", async () => {
    const user = userEvent.setup();
    getArchivePathMock.mockResolvedValue("E:/archive");
    listAlbumsMock.mockResolvedValue([]);
    listPhotosMock.mockResolvedValue([]);
    createAlbumMock.mockResolvedValue({
      id: "new-alb",
      name: "夏休み",
      albumType: "manual",
      source: "viewer",
      photoCount: 0,
    });

    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "＋ 新しいアルバム" })).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "＋ 新しいアルバム" }));
    await user.type(screen.getByPlaceholderText("アルバム名"), "夏休み{Enter}");
    await waitFor(() => expect(createAlbumMock).toHaveBeenCalled());

    await user.click(document.body);
    await user.keyboard("{Control>}z{/Control}");

    await waitFor(() => expect(deleteViewerAlbumMock).toHaveBeenCalledWith("new-alb"));
  });

  it("opens the import wizard from the sidebar", async () => {
    const user = userEvent.setup();
    getArchivePathMock.mockResolvedValue("E:/archive");
    listAlbumsMock.mockResolvedValue([]);
    listPhotosMock.mockResolvedValue([]);

    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "写真を取り込む" })).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "写真を取り込む" }));

    expect(screen.getByRole("dialog", { name: "写真を取り込む" })).toBeInTheDocument();
  });

  it("disables the global Ctrl+Z undo shortcut while the import wizard is open", async () => {
    const user = userEvent.setup();
    getArchivePathMock.mockResolvedValue("E:/archive");
    listAlbumsMock.mockResolvedValue([makeAlbum({ id: "alb1", name: "旅行" })]);
    listPhotosMock.mockResolvedValue([]);
    createAlbumMock.mockResolvedValue({
      id: "new-alb",
      name: "夏休み",
      albumType: "manual",
      source: "viewer",
      photoCount: 0,
    });

    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "＋ 新しいアルバム" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "＋ 新しいアルバム" }));
    await user.type(screen.getByPlaceholderText("アルバム名"), "夏休み{Enter}");
    await waitFor(() => expect(createAlbumMock).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: "写真を取り込む" }));
    expect(screen.getByRole("dialog", { name: "写真を取り込む" })).toBeInTheDocument();

    await user.keyboard("{Control>}z{/Control}");

    expect(deleteViewerAlbumMock).not.toHaveBeenCalled();
  });

  it("switches to the imported-photos view once the import wizard completes", async () => {
    const user = userEvent.setup();
    getArchivePathMock.mockResolvedValue("E:/archive");
    listAlbumsMock.mockResolvedValue([]);
    listPhotosMock.mockResolvedValue([]);
    pickImportSourceFolderMock.mockResolvedValue("D:/DCIM");
    scanImportSourceMock.mockResolvedValue({
      newCount: 1,
      duplicateCount: 0,
      errorCount: 0,
      items: [
        {
          sourcePath: "D:/DCIM/a.jpg",
          filename: "a.jpg",
          kind: "photo",
          dedupStatus: { status: "new" },
          dateTaken: null,
        },
      ],
    });
    commitImportMock.mockResolvedValue({
      insertedCount: 1,
      insertedPhotoIds: ["P-NEW-1"],
      duplicateCount: 0,
      failedFiles: [],
    });
    listPhotosByIdsMock.mockResolvedValue([makePhoto({ id: "P-NEW-1", filename: "imported.jpg" })]);

    render(<App />);
    await waitFor(() => expect(listPhotosMock).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: "写真を取り込む" }));
    await user.click(screen.getByRole("button", { name: "フォルダを選択" }));
    await screen.findByRole("grid", { name: "取り込みプレビュー" });
    await user.click(screen.getByRole("button", { name: /件を取り込む/ }));
    await screen.findByText(/取り込みが完了しました/);

    await user.click(screen.getByRole("button", { name: "取り込んだ写真を見る" }));

    await waitFor(() => expect(listPhotosByIdsMock).toHaveBeenCalledWith(["P-NEW-1"]));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "imported.jpg" })).toBeInTheDocument()
    );
    expect(screen.queryByRole("dialog", { name: "写真を取り込む" })).not.toBeInTheDocument();
  });
});
