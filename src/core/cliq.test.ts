import { describe, expect, it } from "vitest";
import { normalizeCliq } from "./cliq";

describe("normalizeCliq", () => {
  it("cleans aliases", () => {
    expect(normalizeCliq(" laila 22 ")).toBe("LAILA22");
    expect(normalizeCliq("Esraa")).toBe("ESRAA");
  });
  it("accepts mobile numbers, including Arabic digits", () => {
    expect(normalizeCliq("0791234567")).toBe("0791234567");
    expect(normalizeCliq("٠٧٩١٢٣٤٥٦٧")).toBe("0791234567");
  });
  it("rejects junk", () => {
    expect(normalizeCliq("")).toBeNull();
    expect(normalizeCliq("ليلى")).toBeNull();
    expect(normalizeCliq("a@b")).toBeNull();
    expect(normalizeCliq("X".repeat(21))).toBeNull();
  });
});
