import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useUndoStack } from "./useUndoStack";

describe("useUndoStack", () => {
  it("starts with canUndo false", () => {
    const { result } = renderHook(() => useUndoStack());

    expect(result.current.canUndo).toBe(false);
  });

  it("becomes undoable after pushing an action", () => {
    const { result } = renderHook(() => useUndoStack());

    act(() => {
      result.current.push({ label: "test", undo: vi.fn().mockResolvedValue(undefined) });
    });

    expect(result.current.canUndo).toBe(true);
  });

  it("calls the most recently pushed action's undo and pops it", async () => {
    const { result } = renderHook(() => useUndoStack());
    const firstUndo = vi.fn().mockResolvedValue(undefined);
    const secondUndo = vi.fn().mockResolvedValue(undefined);

    act(() => {
      result.current.push({ label: "first", undo: firstUndo });
    });
    act(() => {
      result.current.push({ label: "second", undo: secondUndo });
    });

    await act(async () => {
      await result.current.undo();
    });

    expect(secondUndo).toHaveBeenCalledTimes(1);
    expect(firstUndo).not.toHaveBeenCalled();
    expect(result.current.canUndo).toBe(true);

    await act(async () => {
      await result.current.undo();
    });

    expect(firstUndo).toHaveBeenCalledTimes(1);
    expect(result.current.canUndo).toBe(false);
  });

  it("does nothing when the stack is empty", async () => {
    const { result } = renderHook(() => useUndoStack());

    await act(async () => {
      await result.current.undo();
    });

    expect(result.current.canUndo).toBe(false);
  });

  it("caps the stack at maxSize, dropping the oldest action", async () => {
    const { result } = renderHook(() => useUndoStack(2));
    const undoA = vi.fn().mockResolvedValue(undefined);
    const undoB = vi.fn().mockResolvedValue(undefined);
    const undoC = vi.fn().mockResolvedValue(undefined);

    act(() => {
      result.current.push({ label: "a", undo: undoA });
    });
    act(() => {
      result.current.push({ label: "b", undo: undoB });
    });
    act(() => {
      result.current.push({ label: "c", undo: undoC });
    });

    await act(async () => {
      await result.current.undo();
    });
    await act(async () => {
      await result.current.undo();
    });

    expect(undoC).toHaveBeenCalledTimes(1);
    expect(undoB).toHaveBeenCalledTimes(1);
    expect(undoA).not.toHaveBeenCalled();
    expect(result.current.canUndo).toBe(false);
  });
});
