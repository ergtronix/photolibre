import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PhotoGrid } from "./PhotoGrid";
import { PHOTO_IDS_MIME, decodePhotoIds } from "../lib/dnd";
import type { Photo } from "../lib/types";

const { openPhotoFileMock } = vi.hoisted(() => ({
  openPhotoFileMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/api", () => ({
  getThumbnailDataUrl: vi.fn().mockResolvedValue("data:image/jpeg;base64,AAAA"),
  openPhotoFile: openPhotoFileMock,
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

function renderGrid(
  overrides: Partial<{
    photos: Photo[];
    onSelect: (index: number) => void;
    photoVersions: Record<string, number>;
    selectedPhotoIds: Set<string>;
    onToggleSelect: (photoId: string) => void;
  }> = {}
) {
  const props = {
    photos: [] as Photo[],
    onSelect: vi.fn(),
    photoVersions: {},
    selectedPhotoIds: new Set<string>(),
    onToggleSelect: vi.fn(),
    ...overrides,
  };
  render(<PhotoGrid {...props} />);
  return props;
}

describe("PhotoGrid", () => {
  it("renders an empty message when there are no photos", () => {
    renderGrid();

    expect(screen.getByText("写真が見つかりませんでした。")).toBeInTheDocument();
  });

  it("renders one thumbnail button per photo", () => {
    const photos = [makePhoto({ id: "1" }), makePhoto({ id: "2", filename: "b.jpg" })];

    renderGrid({ photos });

    expect(screen.getAllByRole("gridcell").filter((cell) => cell.querySelector("button"))).toHaveLength(2);
  });

  it("calls onSelect with the clicked photo's index", async () => {
    const user = userEvent.setup();
    const photos = [makePhoto({ id: "1", filename: "a.jpg" }), makePhoto({ id: "2", filename: "b.jpg" })];
    const { onSelect } = renderGrid({ photos });

    await user.click(screen.getByRole("button", { name: "b.jpg" }));

    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("shows a favorite marker for favorited photos", async () => {
    const photos = [makePhoto({ id: "1", favorite: true })];

    renderGrid({ photos });

    await waitFor(() => expect(screen.getByText("★")).toBeInTheDocument());
  });

  it("shows the album names a photo belongs to when present (search results)", () => {
    const photos = [makePhoto({ id: "1", albumNames: ["七五三", "家族写真"] })];

    renderGrid({ photos });

    expect(screen.getByText("七五三 / 家族写真")).toBeInTheDocument();
  });

  it("does not show an album caption when albumNames is empty or null", () => {
    const photos = [makePhoto({ id: "1", albumNames: [] }), makePhoto({ id: "2", albumNames: null })];

    renderGrid({ photos });

    expect(document.querySelector(".photo-thumbnail__albums")).not.toBeInTheDocument();
  });

  it("shows a generic video placeholder instead of a decoded thumbnail for videos", () => {
    const photos = [makePhoto({ id: "1", mediaType: "video", filename: "clip.mov" })];

    renderGrid({ photos });

    expect(screen.getByText("動画")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("opens the video with the system player instead of selecting it when clicked", async () => {
    const user = userEvent.setup();
    const photos = [
      makePhoto({ id: "1", mediaType: "video", filename: "clip.mov", filepath: "photos/2020/01/clip.mov" }),
    ];
    const { onSelect } = renderGrid({ photos });

    await user.click(screen.getByRole("button", { name: "clip.mov" }));

    expect(openPhotoFileMock).toHaveBeenCalledWith("photos/2020/01/clip.mov");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("toggles selection instead of opening the photo when Ctrl+clicked", async () => {
    const user = userEvent.setup();
    const photos = [makePhoto({ id: "1", filename: "a.jpg" })];
    const { onSelect, onToggleSelect } = renderGrid({ photos });

    await user.keyboard("[ControlLeft>]");
    await user.click(screen.getByRole("button", { name: "a.jpg" }));
    await user.keyboard("[/ControlLeft]");

    expect(onToggleSelect).toHaveBeenCalledWith("1");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("marks selected photos with the selected class and aria-pressed", () => {
    const photos = [makePhoto({ id: "1", filename: "a.jpg" })];

    renderGrid({ photos, selectedPhotoIds: new Set(["1"]) });

    const button = screen.getByRole("button", { name: "a.jpg" });
    expect(button).toHaveClass("photo-thumbnail--selected");
    expect(button).toHaveAttribute("aria-pressed", "true");
  });

  it("drags only the clicked photo when it is not part of the current selection", () => {
    const photos = [makePhoto({ id: "1", filename: "a.jpg" }), makePhoto({ id: "2", filename: "b.jpg" })];

    renderGrid({ photos, selectedPhotoIds: new Set(["2"]) });

    const setData = vi.fn();
    const dataTransfer = { setData, effectAllowed: "" };
    const button = screen.getByRole("button", { name: "a.jpg" });
    button.dispatchEvent(
      Object.assign(new Event("dragstart", { bubbles: true, cancelable: true }), { dataTransfer })
    );

    expect(setData).toHaveBeenCalledWith(PHOTO_IDS_MIME, expect.any(String));
    expect(decodePhotoIds(setData.mock.calls[0][1])).toEqual(["1"]);
  });

  it("drags the whole selection when the dragged photo is part of it", () => {
    const photos = [makePhoto({ id: "1", filename: "a.jpg" }), makePhoto({ id: "2", filename: "b.jpg" })];

    renderGrid({ photos, selectedPhotoIds: new Set(["1", "2"]) });

    const setData = vi.fn();
    const dataTransfer = { setData, effectAllowed: "" };
    const button = screen.getByRole("button", { name: "a.jpg" });
    button.dispatchEvent(
      Object.assign(new Event("dragstart", { bubbles: true, cancelable: true }), { dataTransfer })
    );

    expect(decodePhotoIds(setData.mock.calls[0][1])).toEqual(["1", "2"]);
  });
});
