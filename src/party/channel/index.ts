import { createBroadcastChannelAdapter } from "./BroadcastChannelAdapter";
import { createStorageEventAdapter } from "./StorageEventAdapter";
import type { PartyChannel } from "./PartyChannel";

export type { PartyChannel, PartyEvent, PartyEventHandler } from "./PartyChannel";

/**
 * Único ponto de troca de transporte.
 *
 * Fase 2 (Supabase): trocar o corpo desta função por
 * `return createSupabaseRealtimeAdapter(pin)`. Nenhuma tela muda.
 */
export function createPartyChannel(pin: string): PartyChannel {
  if (typeof BroadcastChannel !== "undefined") {
    return createBroadcastChannelAdapter(pin);
  }
  return createStorageEventAdapter(pin);
}
