import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ArchivePicker } from "./ArchivePicker";

const { openMock } = vi.hoisted(() => ({ openMock: vi.fn() }));
const { setArchivePathMock } = vi.hoisted(() => ({ setArchivePathMock: vi.fn() }));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: openMock,
}));
vi.mock("../lib/api", () => ({
  setArchivePath: setArchivePathMock,
}));

beforeEach(() => {
  vi.resetAllMocks();
});

describe("ArchivePicker", () => {
  it("calls setArchivePath and onSelected when a folder is chosen", async () => {
    const user = userEvent.setup();
    openMock.mockResolvedValue("E:/AIWork/Data/apple_photos_archive");
    setArchivePathMock.mockResolvedValue(undefined);
    const onSelected = vi.fn();

    render(<ArchivePicker onSelected={onSelected} />);
    await user.click(screen.getByRole("button", { name: "フォルダを選択" }));

    expect(setArchivePathMock).toHaveBeenCalledWith("E:/AIWork/Data/apple_photos_archive");
    expect(onSelected).toHaveBeenCalledWith("E:/AIWork/Data/apple_photos_archive");
  });

  it("does nothing when the dialog is cancelled", async () => {
    const user = userEvent.setup();
    openMock.mockResolvedValue(null);
    const onSelected = vi.fn();

    render(<ArchivePicker onSelected={onSelected} />);
    await user.click(screen.getByRole("button", { name: "フォルダを選択" }));

    expect(setArchivePathMock).not.toHaveBeenCalled();
    expect(onSelected).not.toHaveBeenCalled();
  });
});
