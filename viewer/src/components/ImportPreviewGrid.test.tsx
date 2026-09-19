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
    dateSource: null,
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

  // TASK-384（C-5）完了条件2: 動画/EXIF無し写真のmtimeフォールバック
  // （dateSource="estimated"）が、実際の撮影日時（"captured"）と
  // 視覚的に区別可能な表示になっていることを確認する。
  it("marks items with an estimated (mtime fallback) date with a distinct badge", () => {
    const items = [
      makeItem({ sourcePath: "a.jpg", filename: "a.jpg", dateSource: "captured" }),
      makeItem({ sourcePath: "b.mov", filename: "b.mov", kind: "video", dateSource: "estimated" }),
    ];

    renderGrid({ items });

    expect(screen.getAllByText("推定日時")).toHaveLength(1);
  });

  it("does not show the estimated-date badge when dateSource is null (captured or unknown)", () => {
    const items = [makeItem({ sourcePath: "a.jpg", filename: "a.jpg", dateSource: null })];

    renderGrid({ items });

    expect(screen.queryByText("推定日時")).not.toBeInTheDocument();
  });

  // typescript-reviewer指摘（TASK-384 C-5差し戻しM4）: 推定日時の理由説明を
  // titleだけに頼らず、キーボード操作者・スクリーンリーダー利用者にも
  // aria-describedby経由で到達可能にする。
  it("exposes the estimated-date reason to assistive tech via aria-describedby, not just title", () => {
    const items = [
      makeItem({ sourcePath: "b.mov", filename: "b.mov", kind: "video", dateSource: "estimated" }),
    ];

    renderGrid({ items });

    const checkbox = screen.getByRole("checkbox", { name: "b.mov" });
    const describedById = checkbox.getAttribute("aria-describedby");
    expect(describedById).toBeTruthy();

    const description = document.getElementById(describedById as string);
    expect(description).not.toBeNull();
    expect(description).toHaveTextContent(
      "EXIFに撮影日時が無いため、ファイルの更新日時から推定しています"
    );
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
