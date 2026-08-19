import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { getDeck } from "../data/questions";
import { punishments } from "../data/punishments";
import {
  drawDifferentPunishment,
  drawOrder,
  drawPunishment,
} from "../games/quemErraPaga";
import { phaseCompleteEarly, submitGrace } from "../games/completion";
import { drawPrompts } from "../data/drawingPrompts";
import { randomId, shuffle } from "../games/drawing/random";
import { activeSlides } from "../games/slides/library";
import { pickSlides } from "../games/slides/slides";
import { getGame } from "../games/registry";
import { createPartyChannel, type HostCommand, type PartyChannel } from "./channel";
import { createPartyState, partyReducer, type PartyAction } from "./partyReducer";
import {
  loadLocalPlayer,
  loadPartyState,
  ownsRoom,
  saveLocalPlayer,
  savePartyState,
} from "./partyStorage";
import { useNow } from "./useNow";
import { useWakeLock } from "./useWakeLock";
import type { PartyState } from "./types";

export type PartyConnection = "connecting" | "connected" | "closed";

/** De quanto em quanto a autoridade reemite o estado, mesmo parada. */
const HEARTBEAT_MS = 3000;
/** Silêncio que faz o próximo da fila assumir. Generoso: assumir à toa é pior. */
const TAKEOVER_MS = 9000;

/**
 * Completa um comando do host com o que só a autoridade pode decidir: relógio
 * e sorteios. Assim dois aparelhos nunca divergem sobre pergunta ou prenda.
 */
function enrichCommand(
  command: HostCommand,
  state: PartyState,
  playerId: string,
): PartyAction {
  const now = Date.now();
  switch (command.type) {
    case "START_GAME": {
      if (state.settings.gameId === "improv-slides") {
        // Ordem de apresentação sorteada uma vez, aqui, e congelada no estado.
        return { type: "START_GAME", now, seatOrder: shuffle(state.players.map((p) => p.id)) };
      }
      if (state.settings.gameId === "drawing-telephone") {
        // Tudo o que é sorteio acontece AQUI, uma vez, na autoridade: ordem da
        // mesa, temas e os ids dos cadernos. O reducer só recebe o resultado.
        const seatOrder = shuffle(state.players.map((player) => player.id));
        return {
          type: "START_GAME",
          now,
          seatOrder,
          prompts: drawPrompts(seatOrder.length, state.drawing?.usedPromptIds ?? []),
          // Id imprevisível por caderno: é ele que vira caminho no Storage, e
          // índice sequencial deixaria as URLs dos outros chutáveis.
          chainIds: seatOrder.map(() => randomId()),
          matchId: randomId(),
        };
      }
      const game = getGame(state.settings.gameId);
      const deck = getDeck(state.settings.difficulty);
      return { type: "START_GAME", now, order: drawOrder(deck.length, game.rounds) };
    }
    case "ADVANCE":
      return buildAdvance(state);
    case "SKIP_SLIDE":
      return { type: "SKIP_SLIDE", now };
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

/**
 * Monta um ADVANCE completo.
 *
 * Existe porque o avanço acontece em dois lugares — comando do host e relógio
 * do auto-host — e os dois precisam carregar o mesmo sorteio. Duplicar isso já
 * seria a chance de um caminho sortear e o outro não.
 */
function buildAdvance(state: PartyState): PartyAction {
  const now = Date.now();
  if (state.settings.gameId === "improv-slides") {
    const pool = activeSlides.map((slide) => slide.id);
    return {
      type: "ADVANCE",
      now,
      slideIds: pickSlides(pool, state.slides?.usedSlideIds ?? []),
      slidePoolSize: pool.length,
    };
  }
  return { type: "ADVANCE", now, punishmentIndex: drawPunishment(punishments.length) };
}

function initRoomState(pin: string): PartyState {
  const saved = loadPartyState(pin);
  if (!saved || saved.pin !== pin) return createPartyState(pin);
  if (!saved.hostPlayerId && saved.players.length > 0) {
    return { ...saved, hostPlayerId: saved.players[0].id };
  }
  return saved;
}

/**
 * A sala inteira num hook só — UM canal, sempre jogador, e o reducer rodando
 * quando ESTE aparelho é a autoridade.
 *
 * Antes a autoridade morava na tela da TV, o que tornava a TV obrigatória: sem
 * ela não existia estado nenhum e ninguém conseguia jogar. Agora ela vive no
 * aparelho de quem criou a sala, então uma mesa de bar só com celulares
 * funciona igual, e a TV vira um display opcional.
 */
export function usePartyRoom(pin: string, options: { spectator?: boolean } = {}) {
  const spectator = options.spectator ?? false;

  const [local, dispatch] = useReducer(partyReducer, pin, initRoomState);
  const [remote, setRemote] = useState<PartyState | null>(null);
  // Espectador (a TV) nunca comanda, mesmo que este aparelho tenha criado a sala.
  const [authority, setAuthority] = useState(() => !spectator && ownsRoom(pin));
  const [connection, setConnection] = useState<PartyConnection>(
    !spectator && ownsRoom(pin) ? "connected" : "connecting",
  );
  const [me, setMe] = useState(() => (spectator ? null : loadLocalPlayer(pin)));

  const state = authority ? local : remote;

  const channelRef = useRef<PartyChannel | null>(null);
  const meRef = useRef(me);
  meRef.current = me;
  const stateRef = useRef(state);
  stateRef.current = state;
  const authorityRef = useRef(authority);
  authorityRef.current = authority;
  /** Quando chegou o último STATE de outro aparelho. Base do revezamento. */
  const lastStateAt = useRef(Date.now());

  useEffect(() => {
    const channel = createPartyChannel(pin);
    channelRef.current = channel;

    const unsubscribe = channel.subscribe((event) => {
      // ---- Quando SOU a autoridade: aplico as intenções que chegam. ----
      if (authorityRef.current) {
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
            // O relógio é o da autoridade: o celular não decide se deu tempo.
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
          case "SUBMIT_DRAWING":
            dispatch({
              type: "SUBMIT_DRAWING",
              playerId: event.playerId,
              url: event.url,
              ...(event.strokes ? { strokes: event.strokes } : {}),
              ...(event.status ? { status: event.status } : {}),
            });
            break;
          case "SUBMIT_GUESS":
            dispatch({ type: "SUBMIT_GUESS", playerId: event.playerId, text: event.text });
            break;
          case "CLAIM_HOST":
            dispatch({ type: "CLAIM_HOST", playerId: event.playerId });
            break;
          case "HOST_ACTION": {
            const atual = stateRef.current;
            if (!atual || atual.hostPlayerId !== event.playerId) break;
            dispatch(enrichCommand(event.command, atual, event.playerId));
            break;
          }
          case "REQUEST_STATE":
            if (stateRef.current) channel.broadcast({ type: "STATE", state: stateRef.current });
            break;
          default:
            break;
        }
        return;
      }

      // ---- Quando NÃO sou: só escuto. ----
      if (event.type === "STATE") {
        lastStateAt.current = Date.now();
        setRemote(event.state);
        setConnection("connected");
        // Reconexão após F5: se ainda estou no roster do outro lado, reentro.
        const current = meRef.current;
        if (current && !event.state.players.some((player) => player.id === current.id)) {
          channel.broadcast({ type: "PLAYER_JOIN", player: current });
        }
        return;
      }
      if (event.type === "PARTY_CLOSED") {
        setConnection("closed");
        setRemote(null);
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

  // Autoridade persiste e transmite a cada mudança — fonte única da verdade.
  useEffect(() => {
    if (!authority) return;
    savePartyState(local);
    channelRef.current?.broadcast({ type: "STATE", state: local });
  }, [authority, local]);

  /**
   * Batimento: reemite o estado mesmo sem mudança. Serve para os outros
   * saberem que a autoridade continua viva — é o que permite detectar que ela
   * sumiu sem inventar um servidor.
   */
  useEffect(() => {
    if (!authority) return;
    const timer = window.setInterval(() => {
      const atual = stateRef.current;
      if (atual) channelRef.current?.broadcast({ type: "STATE", state: atual });
    }, HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [authority]);

  const meInParty = state?.players.find((player) => player.id === me?.id) ?? null;
  const isHost = !!meInParty && state?.hostPlayerId === meInParty.id;

  /**
   * Assumir o comando. Dois caminhos:
   * 1. Virei `hostPlayerId` (o anterior saiu e o reducer me promoveu).
   * 2. A autoridade sumiu e eu sou o primeiro da fila.
   *
   * Espectador nunca assume: a TV é só display.
   */
  const now = useNow(!authority && !spectator);
  useEffect(() => {
    if (authority || spectator || !remote || !meInParty) return;

    const souOHost = remote.hostPlayerId === meInParty.id;
    const sumiu =
      now - lastStateAt.current > TAKEOVER_MS && remote.players[0]?.id === meInParty.id;
    if (!souOHost && !sumiu) return;

    // Hidrata com o último estado conhecido ANTES de assumir, senão a partida
    // recomeçaria do zero na mão do novo host.
    dispatch({ type: "HYDRATE", state: remote });
    setAuthority(true);
  }, [authority, spectator, remote, meInParty, now]);

  /**
   * Auto-host: a autoridade toca a partida sozinha. Fecha a fase quando o
   * prazo vence ou (na rodada) quando todo mundo já respondeu.
   */
  const running = authority && !!state && state.phaseDeadline > 0 && state.pausedAt === null;
  const clock = useNow(running);
  // A folga existe para o desenho: o traço já estava pronto, só a rede que
  // demorou a subir a imagem. Ver `submitGrace`.
  const venceu = running && !!state && clock >= state.phaseDeadline + submitGrace(state);
  const todosResponderam = authority && !!state && phaseCompleteEarly(state);

  // Mantém a tela acesa enquanto este aparelho comanda uma fase cronometrada:
  // celular bloqueado congela os temporizadores e a partida trava para todos.
  useWakeLock(running);

  useEffect(() => {
    if (!running || (!venceu && !todosResponderam)) return;
    // Respiro curto: sem ele a revelação entra no mesmo quadro do último toque.
    const timer = window.setTimeout(() => {
      const atual = stateRef.current;
      if (atual) dispatch(buildAdvance(atual));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [running, venceu, todosResponderam]);

  /**
   * Rede de segurança: sala com gente e sem host (estado antigo, ou o host caiu
   * antes de alguém assumir). O primeiro da fila reivindica.
   */
  useEffect(() => {
    if (authority || !meInParty || !state || state.hostPlayerId) return;
    if (state.players[0]?.id !== meInParty.id) return;
    channelRef.current?.broadcast({ type: "CLAIM_HOST", playerId: meInParty.id });
  }, [authority, meInParty, state]);

  /** Manda uma intenção, ou aplica direto se eu já sou a autoridade. */
  const send = useCallback((action: PartyAction, remoteEvent: () => void) => {
    if (authorityRef.current) dispatch(action);
    else remoteEvent();
  }, []);

  const join = useCallback(
    (player: PartyState["players"][number]) => {
      setMe(player);
      saveLocalPlayer(pin, player);
      send({ type: "PLAYER_JOIN", player }, () =>
        channelRef.current?.broadcast({ type: "PLAYER_JOIN", player }),
      );
    },
    [pin, send],
  );

  const updateMe = useCallback(
    (patch: Partial<Omit<PartyState["players"][number], "id">>) => {
      const current = meRef.current;
      if (!current) return;
      const updated = { ...current, ...patch };
      setMe(updated);
      saveLocalPlayer(pin, updated);
      send({ type: "PLAYER_UPDATE", playerId: current.id, patch }, () =>
        channelRef.current?.broadcast({ type: "PLAYER_UPDATE", playerId: current.id, patch }),
      );
    },
    [pin, send],
  );

  const answer = useCallback(
    (optionIndex: number) => {
      const current = meRef.current;
      if (!current) return;
      send({ type: "ANSWER", now: Date.now(), playerId: current.id, optionIndex }, () =>
        channelRef.current?.broadcast({ type: "ANSWER", playerId: current.id, optionIndex }),
      );
    },
    [send],
  );

  const vote = useCallback(
    (rating: number) => {
      const current = meRef.current;
      if (!current) return;
      send({ type: "VOTE", playerId: current.id, rating }, () =>
        channelRef.current?.broadcast({ type: "VOTE", playerId: current.id, rating }),
      );
    },
    [send],
  );

  /**
   * Entrega do desenho. Sobe o ENDEREÇO da imagem, nunca a imagem — e vai uma
   * vez só: `recordPage` no reducer ignora a segunda, então dedo batendo duas
   * vezes no botão não vira duas páginas.
   */
  const submitDrawing = useCallback(
    (payload: { url: string | null; strokes?: string; status?: "submitted" | "timeout" | "failed" }) => {
      const current = meRef.current;
      if (!current) return;
      send(
        { type: "SUBMIT_DRAWING", playerId: current.id, ...payload },
        () => channelRef.current?.broadcast({
          type: "SUBMIT_DRAWING", playerId: current.id, ...payload,
        }),
      );
    },
    [send],
  );

  const submitGuess = useCallback(
    (text: string) => {
      const current = meRef.current;
      if (!current) return;
      send({ type: "SUBMIT_GUESS", playerId: current.id, text }, () =>
        channelRef.current?.broadcast({ type: "SUBMIT_GUESS", playerId: current.id, text }),
      );
    },
    [send],
  );

  /** Troca slides que não carregaram. Só a autoridade decide de verdade. */
  const replaceSlides = useCallback((slideIds: string[]) => {
    if (authorityRef.current) dispatch({ type: "REPLACE_SLIDES", slideIds });
  }, []);

  const sendHostCommand = useCallback(
    (command: HostCommand) => {
      const current = meRef.current;
      if (!current) return;
      const atual = stateRef.current;
      if (authorityRef.current && atual) {
        dispatch(enrichCommand(command, atual, current.id));
        return;
      }
      channelRef.current?.broadcast({ type: "HOST_ACTION", playerId: current.id, command });
    },
    [],
  );

  const closeParty = useCallback(() => {
    channelRef.current?.broadcast({ type: "PARTY_CLOSED" });
  }, []);

  return {
    state,
    me,
    meInParty,
    isHost,
    isAuthority: authority,
    connection,
    join,
    updateMe,
    answer,
    vote,
    submitDrawing,
    submitGuess,
    replaceSlides,
    sendHostCommand,
    closeParty,
  };
}
