import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";

import type { ImportProgress } from "./types";

/** `commands.rs`が発行する`import-progress`イベント（TASK-382、C-3）を購読し、
 * 直近の進捗を保持するフック。取り込みウィザードの`scanning`/`copying`
 * ステップで表示に使う。マウント中は購読し続け、アンマウント時に確実に
 * 購読解除する（`listen()`のPromiseがまだ解決していないうちにアンマウント
 * された場合も、解決後すぐ解除する）。 */
export function useImportProgress() {
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let unlisten: (() => void) | undefined;

    listen<ImportProgress>("import-progress", (event) => {
      if (mountedRef.current) {
        setProgress(event.payload);
      }
    })
      .then((unlistenFn) => {
        if (mountedRef.current) {
          unlisten = unlistenFn;
        } else {
          unlistenFn();
        }
      })
      .catch((error: unknown) => {
        // `listen()`自体が失敗するのは稀（Tauriのイベントシステム自体が
        // 利用不能な場合等）。進捗表示が出ないだけで機能自体は継続できるため、
        // 未処理のPromise rejectionにしない（typescript-reviewer指摘、
        // TASK-383レビュー対応）以外の追加対応はしない。
        console.error("import-progressイベントの購読に失敗しました:", error);
      });

    return () => {
      mountedRef.current = false;
      unlisten?.();
    };
  }, []);

  const reset = useCallback(() => setProgress(null), []);

  return { progress, reset };
}
