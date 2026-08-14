import { useCallback, useEffect, useReducer, useRef } from "react";
import { createPartyChannel, type PartyChannel } from "./channel";
import { createPartyState, partyReducer, type PartyAction } from "./partyReducer";
import { loadPartyState, savePartyState } from "./partyStorage";
import type { PartyState } from "./types";

function initHostState(pin: string): PartyState {
  // F5 na TV não pode matar a sala: reidrata do localStorage quando possível.
  const saved = loadPartyState(pin);
  return saved && saved.pin === pin ? saved : createPartyState(pin);
}

/**
 * Lado Host (TV). É a autoridade: aplica as intenções que chegam dos
 * celulares e reemite o estado inteiro para todo mundo.
 */
export function usePartyHost(pin: string) {
  const [state, dispatch] = useReducer(partyReducer, pin, initHostState);
  const channelRef = useRef<PartyChannel | null>(null);
  // Ref para o listener sempre ler o estado atual sem se reinscrever a cada tecla.
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const channel = createPartyChannel(pin);
    channelRef.current = channel;

    const unsubscribe = channel.subscribe((event) => {
      switch (event.type) {
        case "PLAYER_JOIN":
          dispatch({ type: "PLAYER_JOIN", player: event.player });
          break;
        case "PLAYER_LEAVE":
          dispatch({ type: "PLAYER_LEAVE", playerId: event.playerId });
          break;
        case "PLAYER_UPDATE":
          dispatch({ type: "PLAYER_UPDATE", playerId: event.playerId, patch: event.patch });
          break;
        case "ANSWER":
          // O reducer é quem valida fase, jogador e alternativa.
          dispatch({
            type: "ANSWER",
            playerId: event.playerId,
            optionIndex: event.optionIndex,
          });
          break;
        case "REQUEST_STATE":
          // Celular acabou de abrir: manda o estado corrente.
          channel.broadcast({ type: "STATE", state: stateRef.current });
          break;
        default:
          break;
      }
    });

    return () => {
      unsubscribe();
      channel.close();
      channelRef.current = null;
    };
  }, [pin]);

  // Toda mudança de estado é persistida e reemitida — fonte única da verdade.
  useEffect(() => {
    savePartyState(state);
    channelRef.current?.broadcast({ type: "STATE", state });
  }, [state]);

  const hostDispatch = useCallback((action: PartyAction) => dispatch(action), []);

  const closeParty = useCallback(() => {
    channelRef.current?.broadcast({ type: "PARTY_CLOSED" });
  }, []);

  return { state, dispatch: hostDispatch, closeParty };
}
