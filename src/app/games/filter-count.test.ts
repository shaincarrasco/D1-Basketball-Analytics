import { describe, expect, it } from "vitest";
import { activeFilterCount } from "./filter-count";

describe("activeFilterCount", () => {
  it("is zero at the defaults", () => {
    expect(activeFilterCount({ conf: "all", sort: "time", liveView: false })).toBe(0);
  });
  it("counts a conference and a sort", () => {
    expect(activeFilterCount({ conf: "ACC", sort: "time", liveView: false })).toBe(1);
    expect(activeFilterCount({ conf: "ACC", sort: "watch", liveView: false })).toBe(2);
  });
  it("ignores the sort in the Live view", () => {
    expect(activeFilterCount({ conf: "all", sort: "watch", liveView: true })).toBe(0);
  });
});
