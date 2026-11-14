import { describe, expect, it } from "vitest";
import { fmtMoney, fmtRange, fmtReported } from "./nil";

describe("NIL money formatting", () => {
  it("never shows false precision", () => {
    expect(fmtMoney(5000)).toBe("Under $10K");
    expect(fmtMoney(450000)).toBe("$450K");
    expect(fmtMoney(1250000)).toBe("$1.25M");
    expect(fmtMoney(1500000)).toBe("$1.5M");
    expect(fmtMoney(2000000)).toBe("$2M");
    expect(fmtMoney(12300000)).toBe("$12.3M");
    expect(fmtMoney(null)).toBe("—");
  });
  it("formats ranges and reported figures", () => {
    expect(fmtRange(5000, 40000)).toBe("<$10K–$40K");
    expect(fmtRange(1100000, 2600000)).toBe("$1.1M–$2.6M");
    expect(fmtReported(3900000, null)).toBe("at least $3.9M");
    expect(fmtReported(6000000, 7000000)).toBe("$6M–$7M");
    expect(fmtReported(5000000, 5000000)).toBe("$5M");
  });
});
