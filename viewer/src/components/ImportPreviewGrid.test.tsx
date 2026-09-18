import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ImportPreviewGrid } from "./ImportPreviewGrid";
import type { ImportPreviewItem } from "../lib/types";

const { getImportPreviewThumbnailMock } = vi.hoisted(() => ({
  getImportPreviewThumbnailMock: vi.fn().mockResolvedValue("data:image/jpeg;base64,AAAA"),
}));

vi.mock("../lib/api", () => ({
  getImportPreviewThumbnail: getImportPreviewThumbnailMock,
}));

function makeItem(overrides: Partial<ImportPreviewItem> = {}): ImportPreviewItem {
  return {
    sourcePath: "D:/DCIM/100CANON/IMG_0001.JPG",
    filename: "IMG_0001.JPG",
    kind: "photo",
    dedupStatus: { status: "new" },
    dateTaken: "2020-01-01T00:00:00",
    ...overrides,
  };
}

function renderGrid(
  overrides: Partial<{
    items: ImportPreviewItem[];
    selectedSourcePaths: Set<string>;
    onToggleSelect: (sourcePath: string) => void;
  }> = {}
) {
  const props = {
    items: [] as ImportPreviewItem[],
    selectedSourcePaths: new Set<string>(),
    onToggleSelect: vi.fn(),
    ...overrides,
  };
  render(<ImportPreviewGrid {...props} />);
  return props;
}

describe("ImportPreviewGrid", () => {
  it("renders an empty message when there are no items", () => {
    renderGrid();

    expect(screen.getByText(/取り込み対象の写真\/動画が見つかりませんでした/)).toBeInTheDocument();
  });

  it("renders one checkbox per item", () => {
    const items = [makeItem({ sourcePath: "a.jpg", filename: "a.jpg" }), makeItem({ sourcePath: "b.jpg", filename: "b.jpg" })];

    renderGrid({ items });

    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
  });

  it("loads a preview thumbnail for each photo item", async () => {
    const items = [makeItem({ sourcePath: "D:/a.jpg", filename: "a.jpg" })];

    renderGrid({ items });

    await waitFor(() => expect(getImportPreviewThumbnailMock).toHaveBeenCalledWith("D:/a.jpg"));
  });

  it("shows a generic video placeholder instead of a decoded thumbnail for videos", () => {
    const items = [makeItem({ kind: "video", filename: "clip.mov" })];

    renderGrid({ items });

    expect(screen.getByText("動画")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("marks duplicate items with a badge", () => {
    const items = [
      makeItem({ sourcePath: "a.jpg", filename: "a.jpg", dedupStatus: { status: "new" } }),
      makeItem({
        sourcePath: "b.jpg",
        filename: "b.jpg",
        dedupStatus: { status: "duplicate_of_existing", photoId: "P-1" },
      }),
    ];

    renderGrid({ items });

    expect(screen.getAllByText("重複")).toHaveLength(1);
  });

  it("calls onToggleSelect with the item's source path when clicked", async () => {
    const user = userEvent.setup();
    const items = [makeItem({ sourcePath: "a.jpg", filename: "a.jpg" })];
    const { onToggleSelect } = renderGrid({ items });

    await user.click(screen.getByRole("checkbox", { name: "a.jpg" }));

    expect(onToggleSelect).toHaveBeenCalledWith("a.jpg");
  });

  it("reflects the checked state passed in via selectedSourcePaths", () => {
    const items = [makeItem({ sourcePath: "a.jpg", filename: "a.jpg" })];

    renderGrid({ items, selectedSourcePaths: new Set(["a.jpg"]) });

    expect(screen.getByRole("checkbox", { name: "a.jpg" })).toBeChecked();
  });
});
