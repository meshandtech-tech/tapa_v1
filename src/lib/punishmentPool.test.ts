import { describe, expect, it } from "vitest";
import { getAvailablePunishmentIndices, getUsedPunishmentIndices } from "./punishmentPool";

describe("punishment pool", () => {
  it("excludes every punishment already drawn in the current cycle", () => {
    const used = getUsedPunishmentIndices([
      { punishmentIndex: 2 },
      { punishmentIndex: 7 },
      { punishmentIndex: 10 },
    ]);

    expect(used).toEqual([2, 7, 10]);
    expect(getAvailablePunishmentIndices(used)).not.toContain(2);
    expect(getAvailablePunishmentIndices(used)).toHaveLength(9);
  });

  it("starts a fresh cycle only after all 12 punishments were used", () => {
    const completeCycle = Array.from({ length: 12 }, (_, punishmentIndex) => ({ punishmentIndex }));
    expect(getUsedPunishmentIndices(completeCycle)).toEqual([]);
    expect(getAvailablePunishmentIndices([])).toHaveLength(12);

    expect(getUsedPunishmentIndices([...completeCycle, { punishmentIndex: 4 }])).toEqual([4]);
  });
});
