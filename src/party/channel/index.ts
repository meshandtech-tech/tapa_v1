import { isSupabaseConfigured } from "../../lib/supabase";
import { createBroadcastChannelAdapter } from "./BroadcastChannelAdapter";
import { createStorageEventAdapter } from "./StorageEventAdapter";
import { createSupabaseRealtimeAdapter } from "./SupabaseRealtimeAdapter";
import type { PartyChannel } from "./PartyChannel";

export type { PartyChannel, PartyEvent, PartyEventHandler } from "./PartyChannel";

/** Como a sala está conectada agora. A UI usa isto para avisar o host. */
export type TransportKind = "supabase" | "local";

export function activeTransport(): TransportKind {
  return isSupabaseConfigured ? "supabase" : "local";
}

/**
 * Único ponto de troca de transporte.
 *
 * Com Supabase configurado, aparelhos diferentes entram na mesma sala.
 * Sem ele, o app continua utilizável — só que limitado a abas do mesmo
 * navegador. Preferimos degradar a quebrar: um dev sem credenciais ainda
 * consegue rodar o projeto inteiro.
 */
export function createPartyChannel(pin: string): PartyChannel {
  if (isSupabaseConfigured) {
    return createSupabaseRealtimeAdapter(pin);
  }
  if (typeof BroadcastChannel !== "undefined") {
    return createBroadcastChannelAdapter(pin);
  }
  return createStorageEventAdapter(pin);
}
