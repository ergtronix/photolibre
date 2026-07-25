import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ArchivePicker } from "./ArchivePicker";

const { pickAndSetArchivePathMock } = vi.hoisted(() => ({
  pickAndSetArchivePathMock: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  pickAndSetArchivePath: pickAndSetArchivePathMock,
}));

beforeEach(() => {
  vi.resetAllMocks();
});

describe("ArchivePicker", () => {
  it("calls onSelected with the chosen folder", async () => {
    const user = userEvent.setup();
    pickAndSetArchivePathMock.mockResolvedValue("E:/AIWork/Data/apple_photos_archive");
    const onSelected = vi.fn();

    render(<ArchivePicker onSelected={onSelected} />);
    await user.click(screen.getByRole("button", { name: "フォルダを選択" }));

    expect(onSelected).toHaveBeenCalledWith("E:/AIWork/Data/apple_photos_archive");
  });

  it("does nothing when the dialog is cancelled", async () => {
    const user = userEvent.setup();
    pickAndSetArchivePathMock.mockResolvedValue(null);
    const onSelected = vi.fn();

    render(<ArchivePicker onSelected={onSelected} />);
    await user.click(screen.getByRole("button", { name: "フォルダを選択" }));

    expect(onSelected).not.toHaveBeenCalled();
  });
});
