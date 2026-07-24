import { describe, expect, it } from "vitest";

import { MAX_ZOOM, MIN_ZOOM, clampZoom, zoomFromWheelDelta, zoomStep, zoomToPoint } from "./zoom";

describe("clampZoom", () => {
  it("keeps values within range unchanged", () => {
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(2)).toBe(2);
  });

  it("clamps values below the minimum", () => {
    expect(clampZoom(0.1)).toBe(MIN_ZOOM);
  });

  it("clamps values above the maximum", () => {
    expect(clampZoom(10)).toBe(MAX_ZOOM);
  });
});

describe("zoomStep", () => {
  it("increases zoom by one step when direction is 1", () => {
    expect(zoomStep(1, 1)).toBe(1.25);
  });

  it("decreases zoom by one step when direction is -1", () => {
    expect(zoomStep(1, -1)).toBe(0.75);
  });

  it("does not go below the minimum zoom", () => {
    expect(zoomStep(MIN_ZOOM, -1)).toBe(MIN_ZOOM);
  });

  it("does not go above the maximum zoom", () => {
    expect(zoomStep(MAX_ZOOM, 1)).toBe(MAX_ZOOM);
  });
});

describe("zoomFromWheelDelta", () => {
  it("zooms in when deltaY is negative (wheel scrolled up)", () => {
    expect(zoomFromWheelDelta(1, -100)).toBe(1.25);
  });

  it("zooms out when deltaY is positive (wheel scrolled down)", () => {
    expect(zoomFromWheelDelta(1, 100)).toBe(0.75);
  });
});

describe("zoomToPoint", () => {
  const center = { x: 100, y: 100 };

  it("keeps pan unchanged when zooming exactly at the center with no existing pan", () => {
    const result = zoomToPoint({ x: 0, y: 0 }, 1, 2, center, center);

    expect(result).toEqual({ x: 0, y: 0 });
  });

  it("shifts pan away from a point to the right of center so that point stays fixed", () => {
    // カーソルが中心より右50pxの位置で2倍に拡大 -> その分だけ左へずらす
    const pointer = { x: 150, y: 100 };

    const result = zoomToPoint({ x: 0, y: 0 }, 1, 2, pointer, center);

    expect(result).toEqual({ x: -50, y: 0 });
  });

  it("shifts pan away from a point above center so that point stays fixed", () => {
    const pointer = { x: 100, y: 60 }; // 中心より40px上

    const result = zoomToPoint({ x: 0, y: 0 }, 1, 2, pointer, center);

    // ratio = 2; y' = 60 - 100 - 2*(60 - 100 - 0) = -40 - 2*(-40) = 40
    expect(result).toEqual({ x: 0, y: 40 });
  });

  it("accounts for existing pan when computing the new pan", () => {
    const pointer = { x: 150, y: 100 };
    const existingPan = { x: 10, y: 5 };

    const result = zoomToPoint(existingPan, 2, 4, pointer, center);

    // ratio = 2
    // x: 150 - 100 - 2 * (150 - 100 - 10) = 50 - 2*40 = 50 - 80 = -30
    // y: 100 - 100 - 2 * (100 - 100 - 5) = 0 - 2*(-5) = 10
    expect(result).toEqual({ x: -30, y: 10 });
  });

  it("returns the same pan when zoom does not change (ratio of 1)", () => {
    const pointer = { x: 150, y: 80 };
    const existingPan = { x: 12, y: -7 };

    const result = zoomToPoint(existingPan, 2, 2, pointer, center);

    expect(result).toEqual(existingPan);
  });
});
