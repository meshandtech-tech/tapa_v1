import {
  channelName,
  type PartyChannel,
  type PartyEvent,
  type PartyEventHandler,
} from "./PartyChannel";

/**
 * Transporte via BroadcastChannel: abas do mesmo navegador conversando.
 * Como o Supabase Realtime, NÃO ecoa o evento de volta para quem enviou.
 */
export function createBroadcastChannelAdapter(pin: string): PartyChannel {
  const channel = new BroadcastChannel(channelName(pin));
  const handlers = new Set<PartyEventHandler>();
  let closed = false;

  channel.onmessage = (message: MessageEvent<PartyEvent>) => {
    const event = message.data;
    if (!event || typeof event.type !== "string") return;
    // Um handler que estoure não pode derrubar os outros nem a party.
    handlers.forEach((handler) => {
      try {
        handler(event);
      } catch (error) {
        console.error("[tapa] handler de PartyEvent falhou", error);
      }
    });
  };

  return {
    pin,
    subscribe(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    broadcast(event) {
      if (closed) return;
      try {
        channel.postMessage(event);
      } catch (error) {
        console.error("[tapa] falha ao publicar PartyEvent", error);
      }
    },
    close() {
      if (closed) return;
      closed = true;
      handlers.clear();
      channel.close();
    },
  };
}
