import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

// jsdomはIntersectionObserverを実装していないため、既定では
// 「常に表示されている」ものとして即座にコールバックするフェイクを用意する。
// 遅延読み込み自体の挙動を検証するテストは独自のモックで上書きする。
class DefaultIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin: string = "";
  readonly thresholds: ReadonlyArray<number> = [];

  constructor(private callback: IntersectionObserverCallback) {}

  observe(target: Element): void {
    this.callback(
      [{ isIntersecting: true, target } as IntersectionObserverEntry],
      this
    );
  }
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

globalThis.IntersectionObserver = DefaultIntersectionObserver as unknown as typeof IntersectionObserver;
