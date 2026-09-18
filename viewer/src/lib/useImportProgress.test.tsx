import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useImportProgress } from "./useImportProgress";

const { listenMock } = vi.hoisted(() => ({
  listenMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: listenMock,
}));

beforeEach(() => {
  vi.resetAllMocks();
});

describe("useImportProgress", () => {
  it("starts with no progress", () => {
    listenMock.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useImportProgress());

    expect(result.current.progress).toBeNull();
  });

  it("subscribes to the import-progress event on mount", () => {
    listenMock.mockReturnValue(new Promise(() => {}));

    renderHook(() => useImportProgress());

    expect(listenMock).toHaveBeenCalledWith("import-progress", expect.any(Function));
  });

  it("updates progress when the event fires", async () => {
    let capturedCallback: ((event: { payload: unknown }) => void) | null = null;
    listenMock.mockImplementation((_event: string, callback: (event: { payload: unknown }) => void) => {
      capturedCallback = callback;
      return Promise.resolve(vi.fn());
    });

    const { result } = renderHook(() => useImportProgress());
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      capturedCallback?.({
        payload: { phase: "scanning", current: 3, total: 10, currentFile: "a.jpg" },
      });
    });

    expect(result.current.progress).toEqual({
      phase: "scanning",
      current: 3,
      total: 10,
      currentFile: "a.jpg",
    });
  });

  it("clears progress when reset is called", async () => {
    let capturedCallback: ((event: { payload: unknown }) => void) | null = null;
    listenMock.mockImplementation((_event: string, callback: (event: { payload: unknown }) => void) => {
      capturedCallback = callback;
      return Promise.resolve(vi.fn());
    });

    const { result } = renderHook(() => useImportProgress());
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      capturedCallback?.({
        payload: { phase: "copying", current: 1, total: 1, currentFile: "b.jpg" },
      });
    });
    expect(result.current.progress).not.toBeNull();

    act(() => {
      result.current.reset();
    });

    expect(result.current.progress).toBeNull();
  });

  it("unlistens on unmount", async () => {
    const unlistenSpy = vi.fn();
    listenMock.mockResolvedValue(unlistenSpy);

    const { unmount } = renderHook(() => useImportProgress());
    await act(async () => {
      await Promise.resolve();
    });

    unmount();

    expect(unlistenSpy).toHaveBeenCalledTimes(1);
  });

  it("unlistens immediately if unmounted before the listen promise resolves", async () => {
    const unlistenSpy = vi.fn();
    let resolveListen: ((fn: () => void) => void) | null = null;
    listenMock.mockReturnValue(
      new Promise<() => void>((resolve) => {
        resolveListen = resolve;
      })
    );

    const { unmount } = renderHook(() => useImportProgress());
    unmount();

    await act(async () => {
      resolveListen?.(unlistenSpy);
      await Promise.resolve();
    });

    expect(unlistenSpy).toHaveBeenCalledTimes(1);
  });

  it("does not throw or leave an unhandled rejection when listen() itself rejects", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    listenMock.mockRejectedValue(new Error("event system unavailable"));

    const { result } = renderHook(() => useImportProgress());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.progress).toBeNull();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
