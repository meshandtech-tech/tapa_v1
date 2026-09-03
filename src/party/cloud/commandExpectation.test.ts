import { describe, expect, it } from "vitest";
import { expectedPhaseEnd } from "./commandExpectation";
import type { RoomSnapshot } from "./snapshot";

describe("expectedPhaseEnd", () => {
  it("preserva os microssegundos exatos enviados pelo Postgres", () => {
    const phaseEndsAt = "2026-09-03T04:12:34.123456+00:00";
    const snapshot = {
      room: { phase: "PRESENTATION", phaseEndsAt },
    } as RoomSnapshot;

    expect(expectedPhaseEnd(snapshot, {
      phase: "PRESENTATION",
      phaseDeadline: Date.parse(phaseEndsAt),
    })).toBe(phaseEndsAt);
  });

  it("usa o estado somente como fallback quando não há foto da fase", () => {
    expect(expectedPhaseEnd(null, {
      phase: "PRESENTATION",
      phaseDeadline: Date.parse("2026-09-03T04:12:34.123Z"),
    })).toBe("2026-09-03T04:12:34.123Z");
  });
});
