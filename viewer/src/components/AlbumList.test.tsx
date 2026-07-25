import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AlbumList } from "./AlbumList";
import { PHOTO_IDS_MIME, encodePhotoIds } from "../lib/dnd";
import type { Album, AlbumSelection } from "../lib/types";

function makeAlbum(overrides: Partial<Album> = {}): Album {
  return {
    id: "alb1",
    name: "旅行",
    albumType: "manual",
    source: "source_a",
    photoCount: 3,
    ...overrides,
  };
}

function renderList(
  overrides: Partial<{
    albums: Album[];
    unfiledCount: number;
    selection: AlbumSelection;
    onSelect: (selection: AlbumSelection) => void;
    onCreateAlbum: (name: string) => void;
    onRenameAlbum: (albumId: string, newName: string) => void;
    onDropPhotos: (albumId: string, photoIds: string[]) => void;
  }> = {}
) {
  const props = {
    albums: [] as Album[],
    unfiledCount: 0,
    selection: { kind: "all" } as AlbumSelection,
    onSelect: vi.fn(),
    onCreateAlbum: vi.fn(),
    onRenameAlbum: vi.fn(),
    onDropPhotos: vi.fn(),
    ...overrides,
  };
  render(<AlbumList {...props} />);
  return props;
}

describe("AlbumList", () => {
  it("always renders a 'すべての写真' entry first", () => {
    renderList();

    expect(screen.getByRole("button", { name: "すべての写真" })).toBeInTheDocument();
  });

  it("renders a '未分類' entry with the unfiled photo count", () => {
    renderList({ unfiledCount: 2 });

    const button = screen.getByRole("button", { name: /未分類/ });
    expect(button).toHaveTextContent("2");
  });

  it("calls onSelect with the unfiled selection when '未分類' is clicked", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderList();

    await user.click(screen.getByRole("button", { name: /未分類/ }));

    expect(onSelect).toHaveBeenCalledWith({ kind: "unfiled" });
  });

  it("renders each album's name and photo count", () => {
    const albums = [makeAlbum({ id: "alb1", name: "旅行", photoCount: 3 })];

    renderList({ albums });

    expect(screen.getByText("旅行")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("calls onSelect with the album selection when an album is clicked", async () => {
    const user = userEvent.setup();
    const albums = [makeAlbum({ id: "alb1", name: "旅行" })];
    const { onSelect } = renderList({ albums });

    await user.click(screen.getByText("旅行"));

    expect(onSelect).toHaveBeenCalledWith({ kind: "album", albumId: "alb1" });
  });

  it("calls onSelect with the all selection when 'すべての写真' is clicked", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderList({ selection: { kind: "album", albumId: "alb1" } });

    await user.click(screen.getByRole("button", { name: "すべての写真" }));

    expect(onSelect).toHaveBeenCalledWith({ kind: "all" });
  });

  it("marks the selected album as active", () => {
    const albums = [makeAlbum({ id: "alb1", name: "旅行" })];

    renderList({ albums, selection: { kind: "album", albumId: "alb1" } });

    expect(screen.getByText("旅行").closest("button")).toHaveClass("album-list__item--active");
  });

  it("creates a new album via the inline input", async () => {
    const user = userEvent.setup();
    const { onCreateAlbum } = renderList();

    await user.click(screen.getByRole("button", { name: "＋ 新しいアルバム" }));
    await user.type(screen.getByPlaceholderText("アルバム名"), "夏休み{Enter}");

    expect(onCreateAlbum).toHaveBeenCalledWith("夏休み");
  });

  it("does not create an album when the new-album input is left empty", async () => {
    const user = userEvent.setup();
    const { onCreateAlbum } = renderList();

    await user.click(screen.getByRole("button", { name: "＋ 新しいアルバム" }));
    await user.keyboard("{Enter}");

    expect(onCreateAlbum).not.toHaveBeenCalled();
  });

  it("renames an album via double-click then Enter", async () => {
    const user = userEvent.setup();
    const albums = [makeAlbum({ id: "alb1", name: "旅行" })];
    const { onRenameAlbum } = renderList({ albums });

    await user.dblClick(screen.getByText("旅行"));
    const input = screen.getByDisplayValue("旅行");
    await user.clear(input);
    await user.type(input, "沖縄旅行{Enter}");

    expect(onRenameAlbum).toHaveBeenCalledWith("alb1", "沖縄旅行");
  });

  it("cancels renaming on Escape without calling onRenameAlbum", async () => {
    const user = userEvent.setup();
    const albums = [makeAlbum({ id: "alb1", name: "旅行" })];
    const { onRenameAlbum } = renderList({ albums });

    await user.dblClick(screen.getByText("旅行"));
    const input = screen.getByDisplayValue("旅行");
    await user.type(input, "変更中{Escape}");

    expect(onRenameAlbum).not.toHaveBeenCalled();
    expect(screen.getByText("旅行")).toBeInTheDocument();
  });

  it("highlights an album while a drag is over it and clears the highlight on drag leave", () => {
    const albums = [makeAlbum({ id: "alb1", name: "旅行" })];
    renderList({ albums });

    const albumItem = screen.getByText("旅行").closest("li");
    if (!albumItem) {
      throw new Error("album list item not found");
    }

    fireEvent.dragOver(albumItem);
    expect(screen.getByText("旅行").closest("button")).toHaveClass("album-list__item--drag-over");

    fireEvent.dragLeave(albumItem);
    expect(screen.getByText("旅行").closest("button")).not.toHaveClass("album-list__item--drag-over");
  });

  it("commits a new album name on blur without pressing Enter", async () => {
    const user = userEvent.setup();
    const { onCreateAlbum } = renderList();

    await user.click(screen.getByRole("button", { name: "＋ 新しいアルバム" }));
    await user.type(screen.getByPlaceholderText("アルバム名"), "冬休み");
    await user.click(document.body);

    expect(onCreateAlbum).toHaveBeenCalledWith("冬休み");
  });

  it("commits a rename on blur without pressing Enter", async () => {
    const user = userEvent.setup();
    const albums = [makeAlbum({ id: "alb1", name: "旅行" })];
    const { onRenameAlbum } = renderList({ albums });

    await user.dblClick(screen.getByText("旅行"));
    const input = screen.getByDisplayValue("旅行");
    await user.clear(input);
    await user.type(input, "沖縄旅行");
    await user.click(document.body);

    expect(onRenameAlbum).toHaveBeenCalledWith("alb1", "沖縄旅行");
  });

  it("calls onDropPhotos with the dropped photo ids when photos are dropped on an album", () => {
    const albums = [makeAlbum({ id: "alb1", name: "旅行" })];
    const { onDropPhotos } = renderList({ albums });

    const albumItem = screen.getByText("旅行").closest("li");
    if (!albumItem) {
      throw new Error("album list item not found");
    }

    const dataTransfer = {
      getData: (type: string) => (type === PHOTO_IDS_MIME ? encodePhotoIds(["1", "2"]) : ""),
    };
    albumItem.dispatchEvent(
      Object.assign(new Event("drop", { bubbles: true, cancelable: true }), { dataTransfer })
    );

    expect(onDropPhotos).toHaveBeenCalledWith("alb1", ["1", "2"]);
  });
});
