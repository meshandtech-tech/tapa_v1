import { describe, expect, it } from "vitest";
import { punishments } from "./punishments";

describe("punishment data", () => {
  it("contains exactly 12 non-empty roulette entries", () => {
    expect(punishments).toHaveLength(12);
    expect(punishments.every((punishment) => punishment.trim().length > 0)).toBe(true);
  });
});
