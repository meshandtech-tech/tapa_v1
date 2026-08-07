import { punishments } from "../data/punishments";
import type { AnswerRecord } from "../types/game";

type PunishmentRecord = Pick<AnswerRecord, "punishmentIndex">;

export function getUsedPunishmentIndices(records: readonly PunishmentRecord[]): number[] {
  const usedInCurrentCycle = new Set<number>();

  for (const record of records) {
    if (record.punishmentIndex === undefined) continue;
    usedInCurrentCycle.add(record.punishmentIndex);
    if (usedInCurrentCycle.size === punishments.length) usedInCurrentCycle.clear();
  }

  return [...usedInCurrentCycle];
}

export function getAvailablePunishmentIndices(usedIndices: readonly number[]): number[] {
  const used = new Set(usedIndices);
  const available = punishments.flatMap((_, index) => (used.has(index) ? [] : [index]));
  return available.length > 0 ? available : punishments.map((_, index) => index);
}
