import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

import App from "./App";
import type { Album, Photo } from "./lib/types";

const {
  getArchivePathMock,
  listAlbumsMock,
  listPhotosMock,
  listAlbumPhotosMock,
  searchPhotosMock,
  readPhotoDataUrlMock,
} = vi.hoisted(() => ({
  getArchivePathMock: vi.fn(),
  listAlbumsMock: vi.fn(),
  listPhotosMock: vi.fn(),
  listAlbumPhotosMock: vi.fn(),
  searchPhotosMock: vi.fn(),
  readPhotoDataUrlMock: vi.fn(),
}));

vi.mock("./lib/api", () => ({
  getArchivePath: getArchivePathMock,
  listAlbums: listAlbumsMock,
  listPhotos: listPhotosMock,
  listAlbumPhotos: listAlbumPhotosMock,
  searchPhotos: searchPhotosMock,
  readPhotoDataUrl: readPhotoDataUrlMock,
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
    const photoGrid = screen.getByRole("list", { name: "写真一覧" });
    expect(within(photoGrid).getAllByRole("listitem")).toHaveLength(1);
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
});
