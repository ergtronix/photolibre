import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AlbumList } from "./AlbumList";
import type { Album } from "../lib/types";

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

describe("AlbumList", () => {
  it("always renders a 'すべての写真' entry first", () => {
    render(<AlbumList albums={[]} selectedAlbumId={null} onSelect={vi.fn()} />);

    expect(screen.getByRole("button", { name: "すべての写真" })).toBeInTheDocument();
  });

  it("renders each album's name and photo count", () => {
    const albums = [makeAlbum({ id: "alb1", name: "旅行", photoCount: 3 })];

    render(<AlbumList albums={albums} selectedAlbumId={null} onSelect={vi.fn()} />);

    expect(screen.getByText("旅行")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("calls onSelect with the album id when clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const albums = [makeAlbum({ id: "alb1", name: "旅行" })];

    render(<AlbumList albums={albums} selectedAlbumId={null} onSelect={onSelect} />);
    await user.click(screen.getByText("旅行"));

    expect(onSelect).toHaveBeenCalledWith("alb1");
  });

  it("calls onSelect with null when 'すべての写真' is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(<AlbumList albums={[]} selectedAlbumId="alb1" onSelect={onSelect} />);
    await user.click(screen.getByRole("button", { name: "すべての写真" }));

    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("marks the selected album as active", () => {
    const albums = [makeAlbum({ id: "alb1", name: "旅行" })];

    render(<AlbumList albums={albums} selectedAlbumId="alb1" onSelect={vi.fn()} />);

    expect(screen.getByText("旅行").closest("button")).toHaveClass("album-list__item--active");
  });
});
