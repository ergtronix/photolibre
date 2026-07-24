import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PhotoGrid } from "./PhotoGrid";
import type { Photo } from "../lib/types";

vi.mock("../lib/api", () => ({
  getThumbnailDataUrl: vi.fn().mockResolvedValue("data:image/jpeg;base64,AAAA"),
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

describe("PhotoGrid", () => {
  it("renders an empty message when there are no photos", () => {
    render(<PhotoGrid photos={[]} onSelect={vi.fn()} photoVersions={{}} />);

    expect(screen.getByText("写真が見つかりませんでした。")).toBeInTheDocument();
  });

  it("renders one thumbnail button per photo", () => {
    const photos = [makePhoto({ id: "1" }), makePhoto({ id: "2", filename: "b.jpg" })];

    render(<PhotoGrid photos={photos} onSelect={vi.fn()} photoVersions={{}} />);

    expect(screen.getAllByRole("gridcell").filter((cell) => cell.querySelector("button"))).toHaveLength(2);
  });

  it("calls onSelect with the clicked photo's index", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const photos = [makePhoto({ id: "1", filename: "a.jpg" }), makePhoto({ id: "2", filename: "b.jpg" })];

    render(<PhotoGrid photos={photos} onSelect={onSelect} photoVersions={{}} />);
    await user.click(screen.getByRole("button", { name: "b.jpg" }));

    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("shows a favorite marker for favorited photos", async () => {
    const photos = [makePhoto({ id: "1", favorite: true })];

    render(<PhotoGrid photos={photos} onSelect={vi.fn()} photoVersions={{}} />);

    await waitFor(() => expect(screen.getByText("★")).toBeInTheDocument());
  });

  it("shows the album names a photo belongs to when present (search results)", () => {
    const photos = [makePhoto({ id: "1", albumNames: ["七五三", "家族写真"] })];

    render(<PhotoGrid photos={photos} onSelect={vi.fn()} photoVersions={{}} />);

    expect(screen.getByText("七五三 / 家族写真")).toBeInTheDocument();
  });

  it("does not show an album caption when albumNames is empty or null", () => {
    const photos = [makePhoto({ id: "1", albumNames: [] }), makePhoto({ id: "2", albumNames: null })];

    render(<PhotoGrid photos={photos} onSelect={vi.fn()} photoVersions={{}} />);

    expect(document.querySelector(".photo-thumbnail__albums")).not.toBeInTheDocument();
  });
});
