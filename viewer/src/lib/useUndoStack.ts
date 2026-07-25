import { useCallback, useEffect, useRef, useState } from "react";

export interface UndoAction {
  label: string;
  undo: () => Promise<void>;
}

const DEFAULT_MAX_SIZE = 50;

/** アルバム分類操作（作成・リネーム・写真追加/除外）を取り消すためのUndoスタック。
 * Ctrl+Zで呼び出す想定。DB側にUndoログを持たせず、各操作の「逆操作」を
 * フロントエンド側でクロージャとして保持するだけのシンプルな設計にしている。 */
export function useUndoStack(maxSize: number = DEFAULT_MAX_SIZE) {
  const [stack, setStack] = useState<UndoAction[]>([]);
  const stackRef = useRef<UndoAction[]>([]);

  useEffect(() => {
    stackRef.current = stack;
  }, [stack]);

  const push = useCallback(
    (action: UndoAction) => {
      setStack((prev) => {
        const next = [...prev, action];
        return next.length > maxSize ? next.slice(next.length - maxSize) : next;
      });
    },
    [maxSize]
  );

  const undo = useCallback(async () => {
    const current = stackRef.current;
    if (current.length === 0) {
      return;
    }
    const last = current[current.length - 1];
    setStack(current.slice(0, -1));
    await last.undo();
  }, []);

  return { push, undo, canUndo: stack.length > 0 };
}
