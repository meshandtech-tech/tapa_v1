import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase } from "../../lib/supabase";
import {
  channelName,
  type PartyChannel,
  type PartyEvent,
  type PartyEventHandler,
} from "./PartyChannel";

/** Um único nome de evento: o discriminante real vive dentro do PartyEvent. */
const EVENT = "party";

/**
 * Transporte via Supabase Realtime — aparelhos diferentes, redes diferentes.
 *
 * Duas diferenças em relação ao BroadcastChannel que o adapter precisa cobrir:
 *
 * 1. `send()` só funciona depois do status SUBSCRIBED, e a conexão leva
 *    algumas centenas de ms. Mas a autoridade publica o STATE e quem entra
 *    pede REQUEST_STATE já no mount — sem fila, esses
 *    primeiros eventos evaporariam e o jogador ficaria preso em "procurando
 *    a sala". Por isso tudo que sai antes da conexão fica numa fila.
 *
 * 2. `send()` é assíncrono e pode falhar. Falha de envio não pode derrubar
 *    a festa, então erro vira log — igual ao adapter local.
 */
export function createSupabaseRealtimeAdapter(pin: string): PartyChannel {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("[tapa] Supabase não configurado — use createPartyChannel()");
  }

  const handlers = new Set<PartyEventHandler>();
  const pending: PartyEvent[] = [];
  let ready = false;
  let closed = false;

  const channel: RealtimeChannel = supabase.channel(channelName(pin), {
    // self: false replica o BroadcastChannel — quem envia não recebe de volta.
    config: { broadcast: { self: false } },
  });

  channel.on("broadcast", { event: EVENT }, (message) => {
    const event = message.payload as PartyEvent | undefined;
    if (!event || typeof event.type !== "string") return;
    // Um handler que estoure não pode derrubar os outros nem a party.
    handlers.forEach((handler) => {
      try {
        handler(event);
      } catch (error) {
        console.error("[tapa] handler de PartyEvent falhou", error);
      }
    });
  });

  const push = (event: PartyEvent) => {
    channel.send({ type: "broadcast", event: EVENT, payload: event }).catch((error) => {
      console.error("[tapa] falha ao publicar PartyEvent", error);
    });
  };

  channel.subscribe((status) => {
    if (closed) return;
    if (status === "SUBSCRIBED") {
      ready = true;
      // Drena o que foi emitido enquanto o websocket ainda subia.
      while (pending.length > 0) push(pending.shift()!);
      return;
    }
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      ready = false;
      console.error(`[tapa] canal da sala ${pin}: ${status}`);
    }
  });

  return {
    pin,
    subscribe(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    broadcast(event) {
      if (closed) return;
      if (ready) push(event);
      else pending.push(event);
    },
    close() {
      if (closed) return;
      closed = true;
      handlers.clear();
      pending.length = 0;
      supabase.removeChannel(channel);
    },
  };
}
