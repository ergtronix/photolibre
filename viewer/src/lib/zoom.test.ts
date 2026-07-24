import { describe, expect, it } from "vitest";

import { MAX_ZOOM, MIN_ZOOM, clampZoom, zoomFromWheelDelta, zoomStep } from "./zoom";

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
