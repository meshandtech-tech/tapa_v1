import { useCallback, useEffect, useReducer, useRef } from "react";
import { getDeck } from "../data/questions";
import { punishments } from "../data/punishments";
import {
  drawDifferentPunishment,
  drawOrder,
  drawPunishment,
  everyoneAnswered,
} from "../games/quemErraPaga";
import { getGame } from "../games/registry";
import { createPartyChannel, type HostCommand, type PartyChannel } from "./channel";
import { createPartyState, partyReducer, type PartyAction } from "./partyReducer";
import { loadPartyState, savePartyState } from "./partyStorage";
import { useNow } from "./useNow";
import type { PartyState } from "./types";

/**
 * Completa um comando do host com o que só a TV pode decidir: relógio e
 * sorteios. Assim dois aparelhos nunca divergem sobre a pergunta ou a prenda.
 */
function enrichCommand(
  command: HostCommand,
  state: PartyState,
  playerId: string,
): PartyAction {
  const now = Date.now();
  switch (command.type) {
    case "START_GAME": {
      const game = getGame(state.settings.gameId);
      const deck = getDeck(state.settings.difficulty);
      return { type: "START_GAME", now, order: drawOrder(deck.length, game.rounds) };
    }
    case "ADVANCE":
      return { type: "ADVANCE", now, punishmentIndex: drawPunishment(punishments.length) };
    case "REROLL_PUNISHMENT":
      return {
        type: "REROLL_PUNISHMENT",
        punishmentIndex: drawDifferentPunishment(
          punishments.length,
          state.quiz?.punishmentIndex ?? null,
        ),
      };
    // O voto do host é um voto como o de qualquer um.
    case "VOTE":
      return { type: "VOTE", playerId, rating: command.rating };
    case "PAUSE":
      return { type: "PAUSE", now };
    case "RESUME":
      return { type: "RESUME", now };
    default:
      return command;
  }
}

function initHostState(pin: string): PartyState {
  // F5 na TV não pode matar a sala: reidrata do localStorage quando possível.
  const saved = loadPartyState(pin);
  if (!saved || saved.pin !== pin) return createPartyState(pin);
  // Salas criadas antes da correção do host ficaram salvas com hostPlayerId
  // null — sem isso elas continuariam travadas, sem ninguém para começar.
  if (!saved.hostPlayerId && saved.players.length > 0) {
    return { ...saved, hostPlayerId: saved.players[0].id };
  }
  return saved;
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
          // O reducer valida fase, jogador, alternativa e atraso. O relógio é
          // o da TV: o celular não decide se chegou a tempo.
          dispatch({
            type: "ANSWER",
            now: Date.now(),
            playerId: event.playerId,
            optionIndex: event.optionIndex,
          });
          break;
        case "VOTE":
          dispatch({ type: "VOTE", playerId: event.playerId, rating: event.rating });
          break;
        case "CLAIM_HOST":
          dispatch({ type: "CLAIM_HOST", playerId: event.playerId });
          break;
        case "HOST_ACTION": {
          // Só o host manda. E os valores não-determinísticos (sorteios,
          // relógio) são preenchidos AQUI — nunca vêm do celular.
          const atual = stateRef.current;
          if (atual.hostPlayerId !== event.playerId) break;
          dispatch(enrichCommand(event.command, atual, event.playerId));
          break;
        }
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

  /**
   * Auto-host: a TV toca a partida sozinha.
   *
   * Duas condições fecham uma fase — o prazo vencer, ou (na rodada) todo mundo
   * já ter respondido. É isto que dispensa alguém preso clicando "avançar", e
   * é por isso que o host pode ser um jogador como os outros.
   */
  const running = state.phaseDeadline > 0 && state.pausedAt === null;
  const now = useNow(running);
  const acabou = running && now >= state.phaseDeadline;
  const todosResponderam = state.phase === "ROUND_ACTIVE" && everyoneAnswered(state);

  useEffect(() => {
    if (!running || (!acabou && !todosResponderam)) return;
    // Respiro curto: sem ele a revelação entra no mesmo quadro do último clique.
    const timer = window.setTimeout(() => {
      dispatch({
        type: "ADVANCE",
        now: Date.now(),
        punishmentIndex: drawPunishment(punishments.length),
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [running, acabou, todosResponderam]);

  const hostDispatch = useCallback((action: PartyAction) => dispatch(action), []);

  const closeParty = useCallback(() => {
    channelRef.current?.broadcast({ type: "PARTY_CLOSED" });
  }, []);

  return { state, dispatch: hostDispatch, closeParty };
}
