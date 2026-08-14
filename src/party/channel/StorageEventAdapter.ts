import {
  channelName,
  type PartyChannel,
  type PartyEvent,
  type PartyEventHandler,
} from "./PartyChannel";

/**
 * Fallback para navegadores sem BroadcastChannel.
 * O evento `storage` do localStorage só dispara em OUTRAS abas, que é
 * exatamente a semântica que queremos (sem eco para o remetente).
 */
export function createStorageEventAdapter(pin: string): PartyChannel {
  const key = channelName(pin);
  const handlers = new Set<PartyEventHandler>();
  let closed = false;

  const onStorage = (storageEvent: StorageEvent) => {
    if (storageEvent.key !== key || !storageEvent.newValue) return;
    let event: PartyEvent;
    try {
      event = JSON.parse(storageEvent.newValue).event as PartyEvent;
    } catch {
      return;
    }
    if (!event || typeof event.type !== "string") return;
    handlers.forEach((handler) => {
      try {
        handler(event);
      } catch (error) {
        console.error("[tapa] handler de PartyEvent falhou", error);
      }
    });
  };

  window.addEventListener("storage", onStorage);

  return {
    pin,
    subscribe(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    broadcast(event) {
      if (closed) return;
      try {
        // O nonce garante que dois eventos iguais seguidos ainda disparem.
        localStorage.setItem(key, JSON.stringify({ nonce: Date.now() + Math.random(), event }));
      } catch (error) {
        console.error("[tapa] falha ao publicar PartyEvent", error);
      }
    },
    close() {
      if (closed) return;
      closed = true;
      handlers.clear();
      window.removeEventListener("storage", onStorage);
    },
  };
}
