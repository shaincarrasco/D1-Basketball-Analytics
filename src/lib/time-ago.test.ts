import { describe, expect, it } from "vitest";
import { clockLabel, offlineMessage } from "./time-ago";

const TZ = "America/New_York";
const now = Date.parse("2026-11-18T03:00:00Z"); // Nov 17, 10:00 PM ET

describe("clockLabel", () => {
  it("shows just the time for today", () => {
    expect(clockLabel(Date.parse("2026-11-18T02:40:00Z"), now, TZ)).toBe("9:40 PM");
  });
  it("adds the date for an earlier day", () => {
    expect(clockLabel(Date.parse("2026-11-16T17:05:00Z"), now, TZ)).toBe("Nov 16, 12:05 PM");
  });
});

describe("offlineMessage", () => {
  it("prefers the last live load", () => {
    expect(offlineMessage(Date.parse("2026-11-18T02:40:00Z"), "Nov 17, 6:00 AM EST", now, TZ)).toBe("You're offline · showing scores from 9:40 PM");
  });
  it("falls back to the data timestamp, then a plain note", () => {
    expect(offlineMessage(null, "Nov 17, 6:00 AM EST", now, TZ)).toBe("You're offline · showing scores from Nov 17, 6:00 AM EST");
    expect(offlineMessage(null, "", now, TZ)).toBe("You're offline · scores may be out of date");
    expect(offlineMessage(Number.NaN, null, now, TZ)).toBe("You're offline · scores may be out of date");
  });
});
