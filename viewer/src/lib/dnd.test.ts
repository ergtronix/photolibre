import { describe, expect, it } from "vitest";

import { decodePhotoIds, encodePhotoIds } from "./dnd";

describe("encodePhotoIds / decodePhotoIds", () => {
  it("round-trips a list of photo ids", () => {
    const ids = ["1", "2", "3"];

    expect(decodePhotoIds(encodePhotoIds(ids))).toEqual(ids);
  });

  it("returns an empty array for empty input", () => {
    expect(decodePhotoIds("")).toEqual([]);
  });

  it("returns an empty array for malformed JSON", () => {
    expect(decodePhotoIds("not json")).toEqual([]);
  });

  it("returns an empty array when the payload is not an array", () => {
    expect(decodePhotoIds(JSON.stringify({ not: "an array" }))).toEqual([]);
  });

  it("filters out non-string entries", () => {
    expect(decodePhotoIds(JSON.stringify(["1", 2, null, "3"]))).toEqual(["1", "3"]);
  });
});
