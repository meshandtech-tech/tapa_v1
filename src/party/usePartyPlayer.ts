import { useCallback, useEffect, useRef, useState } from "react";
import { createPartyChannel, type HostCommand, type PartyChannel } from "./channel";
import { loadLocalPlayer, ownsHostToken, saveLocalPlayer } from "./partyStorage";
import type { PartyState, Player } from "./types";

export type PartyConnection = "connecting" | "connected" | "closed";

/**
 * Lado Player (celular). Nunca calcula fase: envia intenções e renderiza
 * o último `STATE` que o Host mandou.
 */
export function usePartyPlayer(pin: string) {
  const [state, setState] = useState<PartyState | null>(null);
  const [connection, setConnection] = useState<PartyConnection>("connecting");
  const [me, setMe] = useState<Player | null>(() => loadLocalPlayer(pin));
  const channelRef = useRef<PartyChannel | null>(null);
  const meRef = useRef(me);
  meRef.current = me;

  useEffect(() => {
    const channel = createPartyChannel(pin);
    channelRef.current = channel;

    const unsubscribe = channel.subscribe((event) => {
      if (event.type === "STATE") {
        setState(event.state);
        setConnection("connected");
        // Reconexão após F5: se o Host ainda me tem na sala, reentra sozinho.
        const current = meRef.current;
        if (current && !event.state.players.some((player) => player.id === current.id)) {
          channel.broadcast({ type: "PLAYER_JOIN", player: current });
        }
        return;
      }
      if (event.type === "PARTY_CLOSED") {
        setConnection("closed");
        setState(null);
      }
    });

    channel.broadcast({ type: "REQUEST_STATE" });

    return () => {
      const current = meRef.current;
      if (current) channel.broadcast({ type: "PLAYER_LEAVE", playerId: current.id });
      unsubscribe();
      channel.close();
      channelRef.current = null;
    };
  }, [pin]);

  const join = useCallback(
    (player: Player) => {
      setMe(player);
      saveLocalPlayer(pin, player);
      channelRef.current?.broadcast({ type: "PLAYER_JOIN", player });
    },
    [pin],
  );

  const updateMe = useCallback(
    (patch: Partial<Omit<Player, "id">>) => {
      const current = meRef.current;
      if (!current) return;
      const updated = { ...current, ...patch };
      setMe(updated);
      saveLocalPlayer(pin, updated);
      channelRef.current?.broadcast({ type: "PLAYER_UPDATE", playerId: current.id, patch });
    },
    [pin],
  );

  const answer = useCallback((optionIndex: number) => {
    const current = meRef.current;
    if (!current) return;
    channelRef.current?.broadcast({
      type: "ANSWER",
      playerId: current.id,
      optionIndex,
    });
  }, []);

  /** Comando do host. A TV confere se sou mesmo o host antes de aplicar. */
  const sendHostCommand = useCallback((command: HostCommand) => {
    const current = meRef.current;
    if (!current) return;
    channelRef.current?.broadcast({ type: "HOST_ACTION", playerId: current.id, command });
  }, []);

  /** Eu como o Host me enxerga — a verdade sobre pontuação e apelido aceito. */
  const meInParty = state?.players.find((player) => player.id === me?.id) ?? null;
  const isHost = !!meInParty && state?.hostPlayerId === meInParty.id;

  /**
   * Reivindica o comando da sala assim que entro, se este aparelho guardou o
   * token de criação. O reducer recusa se já houver outro host.
   */
  useEffect(() => {
    if (!meInParty || state?.hostPlayerId) return;
    if (!ownsHostToken(pin)) return;
    channelRef.current?.broadcast({ type: "CLAIM_HOST", playerId: meInParty.id });
  }, [pin, meInParty, state?.hostPlayerId]);

  return { state, me, meInParty, isHost, connection, join, updateMe, answer, sendHostCommand };
}
