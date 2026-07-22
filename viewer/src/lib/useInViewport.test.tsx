import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useInViewport } from "./useInViewport";

type ObserverCallback = (entries: Partial<IntersectionObserverEntry>[]) => void;

let observedCallback: ObserverCallback | null = null;
let disconnectSpy: ReturnType<typeof vi.fn>;

class FakeIntersectionObserver {
  constructor(callback: ObserverCallback) {
    observedCallback = callback;
  }
  observe = vi.fn();
  disconnect = disconnectSpy;
  unobserve = vi.fn();
  takeRecords = vi.fn(() => []);
}

function TestComponent() {
  const [ref, isVisible] = useInViewport<HTMLDivElement>();
  return <div ref={ref}>{isVisible ? "visible" : "hidden"}</div>;
}

beforeEach(() => {
  observedCallback = null;
  disconnectSpy = vi.fn();
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useInViewport", () => {
  it("starts as not visible", () => {
    render(<TestComponent />);

    expect(screen.getByText("hidden")).toBeInTheDocument();
  });

  it("becomes visible once the observer reports an intersection", () => {
    render(<TestComponent />);

    act(() => {
      observedCallback?.([{ isIntersecting: true }]);
    });

    expect(screen.getByText("visible")).toBeInTheDocument();
  });

  it("stays not visible when the observer reports no intersection", () => {
    render(<TestComponent />);

    observedCallback?.([{ isIntersecting: false }]);

    expect(screen.getByText("hidden")).toBeInTheDocument();
  });

  it("disconnects the observer once visible", () => {
    render(<TestComponent />);

    act(() => {
      observedCallback?.([{ isIntersecting: true }]);
    });

    expect(disconnectSpy).toHaveBeenCalled();
  });
});
