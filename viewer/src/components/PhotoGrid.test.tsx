import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PhotoGrid } from "./PhotoGrid";
import type { Photo } from "../lib/types";

vi.mock("../lib/api", () => ({
  readPhotoDataUrl: vi.fn().mockResolvedValue("data:image/jpeg;base64,AAAA"),
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

describe("PhotoGrid", () => {
  it("renders an empty message when there are no photos", () => {
    render(<PhotoGrid photos={[]} onSelect={vi.fn()} />);

    expect(screen.getByText("写真が見つかりませんでした。")).toBeInTheDocument();
  });

  it("renders one thumbnail button per photo", () => {
    const photos = [makePhoto({ id: "1" }), makePhoto({ id: "2", filename: "b.jpg" })];

    render(<PhotoGrid photos={photos} onSelect={vi.fn()} />);

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("calls onSelect with the clicked photo's index", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const photos = [makePhoto({ id: "1", filename: "a.jpg" }), makePhoto({ id: "2", filename: "b.jpg" })];

    render(<PhotoGrid photos={photos} onSelect={onSelect} />);
    await user.click(screen.getByRole("button", { name: "b.jpg" }));

    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("shows a favorite marker for favorited photos", async () => {
    const photos = [makePhoto({ id: "1", favorite: true })];

    render(<PhotoGrid photos={photos} onSelect={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("★")).toBeInTheDocument());
  });
});
