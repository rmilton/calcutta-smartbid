import { describe, expect, it } from "vitest";
import {
  formatBidInputText,
  formatBidInputValue,
  parseBidInputValue
} from "@/lib/bid-input";

describe("bid input helpers", () => {
  it("formats bid values with grouping separators", () => {
    expect(formatBidInputValue(0)).toBe("0");
    expect(formatBidInputValue(1000)).toBe("1,000");
    expect(formatBidInputValue(10000)).toBe("10,000");
    expect(formatBidInputText("201300")).toBe("201,300");
  });

  it("normalizes typed bid strings into grouped display text", () => {
    expect(formatBidInputText("1,234")).toBe("1,234");
    expect(formatBidInputText("$12,300")).toBe("12,300");
    expect(formatBidInputText("")).toBe("");
  });

  it("parses formatted bid text back into plain numbers", () => {
    expect(parseBidInputValue("1,000")).toBe(1000);
    expect(parseBidInputValue("10,000")).toBe(10000);
    expect(parseBidInputValue("$201,300")).toBe(201300);
    expect(parseBidInputValue("")).toBe(0);
  });
});
