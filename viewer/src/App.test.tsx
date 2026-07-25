import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

import App from "./App";
import type { Album, Photo } from "./lib/types";

const {
  getArchivePathMock,
  pickAndSetArchivePathMock,
  listAlbumsMock,
  listPhotosMock,
  listAlbumPhotosMock,
  searchPhotosMock,
  listUnfiledPhotosMock,
  countUnfiledPhotosMock,
  createAlbumMock,
  renameAlbumMock,
  deleteViewerAlbumMock,
  addPhotosToAlbumMock,
  removePhotoFromAlbumMock,
  readPhotoDataUrlMock,
  getThumbnailDataUrlMock,
  getPhotoRotationMock,
  setPhotoRotationMock,
} = vi.hoisted(() => ({
  getArchivePathMock: vi.fn(),
  pickAndSetArchivePathMock: vi.fn(),
  listAlbumsMock: vi.fn(),
  listPhotosMock: vi.fn(),
  listAlbumPhotosMock: vi.fn(),
  searchPhotosMock: vi.fn(),
  listUnfiledPhotosMock: vi.fn(),
  countUnfiledPhotosMock: vi.fn(),
  createAlbumMock: vi.fn(),
  renameAlbumMock: vi.fn(),
  deleteViewerAlbumMock: vi.fn(),
  addPhotosToAlbumMock: vi.fn(),
  removePhotoFromAlbumMock: vi.fn(),
  readPhotoDataUrlMock: vi.fn(),
  getThumbnailDataUrlMock: vi.fn(),
  getPhotoRotationMock: vi.fn(),
  setPhotoRotationMock: vi.fn(),
}));

vi.mock("./lib/api", () => ({
  getArchivePath: getArchivePathMock,
  pickAndSetArchivePath: pickAndSetArchivePathMock,
  listAlbums: listAlbumsMock,
  listPhotos: listPhotosMock,
  listAlbumPhotos: listAlbumPhotosMock,
  searchPhotos: searchPhotosMock,
  listUnfiledPhotos: listUnfiledPhotosMock,
  countUnfiledPhotos: countUnfiledPhotosMock,
  createAlbum: createAlbumMock,
  renameAlbum: renameAlbumMock,
  deleteViewerAlbum: deleteViewerAlbumMock,
  addPhotosToAlbum: addPhotosToAlbumMock,
  removePhotoFromAlbum: removePhotoFromAlbumMock,
  readPhotoDataUrl: readPhotoDataUrlMock,
  getThumbnailDataUrl: getThumbnailDataUrlMock,
  getPhotoRotation: getPhotoRotationMock,
  setPhotoRotation: setPhotoRotationMock,
  setArchivePath: vi.fn(),
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
  readPhotoDataUrlMock.mockResolvedValue("data:image/jpeg;base64,AAAA");
  getThumbnailDataUrlMock.mockResolvedValue("data:image/jpeg;base64,AAAA");
  getPhotoRotationMock.mockResolvedValue(0);
  setPhotoRotationMock.mockResolvedValue(undefined);
  listUnfiledPhotosMock.mockResolvedValue([]);
  countUnfiledPhotosMock.mockResolvedValue(0);
  listAlbumPhotosMock.mockResolvedValue([]);
  addPhotosToAlbumMock.mockResolvedValue(undefined);
  removePhotoFromAlbumMock.mockResolvedValue(undefined);
  renameAlbumMock.mockResolvedValue(undefined);
  deleteViewerAlbumMock.mockResolvedValue(undefined);
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
});
