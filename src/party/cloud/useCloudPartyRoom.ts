import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isSupabaseConfigured } from "../../lib/supabase";
import { drawPrompts } from "../../data/drawingPrompts";
import { getDeck } from "../../data/questions";
import { drawOrder } from "../../games/quemErraPaga";
import { activeSlides } from "../../games/slides/library";
import { buildTopicPool } from "../../games/advogadoDoDiabo";
import { punishments } from "../../data/punishments";
import { getGame } from "../../games/registry";
import { serializeStrokes } from "../../games/drawing/strokes";
import * as api from "./api";
import { expectedPhaseEnd } from "./commandExpectation";
import { useCloudRoom } from "./useCloudRoom";
import type { HostCommand } from "../channel";
import type { PartyState, Player } from "../types";

/**
 * A mesma interface do `usePartyRoom`, servida pela nuvem.
 *
 * Expor a interface antiga é deliberado: nenhuma tela de jogo precisou mudar
 * para a migração acontecer. O que mudou foi de onde vem o estado — de um
 * `useReducer` no celular do host para o Postgres — e para onde vão as
 * intenções: RPC em vez de broadcast.
 */
/**
 * Quanto tempo o host espera antes de a tela admitir que não começou.
 *
 * Generoso de propósito: `start_match` numa sala de 10 leva ~200ms, mas no 5G
 * de um bar a viagem de ida e volta pode custar bem mais que isso.
 */
const INIT_TIMEOUT_MS = 12000;

export function useCloudPartyRoom(pin: string, options: { spectator?: boolean } = {}) {
  /**
   * A TV também usa a nuvem.
   *
   * Ela estava EXCLUÍDA daqui e caía no caminho local, esperando um `STATE`
   * que ninguém emite mais desde a migração — `/host/:pin` ficava em
   * "procurando a sala" para sempre. O espectador não entra na sala: só lê.
   * Funciona porque `room_snapshot` é SECURITY DEFINER e devolve fase e roster
   * mesmo para quem não é membro; `me.playerId` vem `null`, que é exatamente
   * o que a TV quer.
   */
  const ativo = isSupabaseConfigured;
  const spectator = options.spectator ?? false;
  const { roomId, snapshot, state, connection, authError, refresh } =
    useCloudRoom(ativo ? pin : "", { spectator });

  const meId = snapshot?.me.playerId ?? null;
  const meInParty: Player | null = useMemo(
    () => state?.players.find((p) => p.id === meId) ?? null,
    [state, meId],
  );
  const isHost = !!meInParty && state?.hostPlayerId === meInParty.id;

  /**
   * Host é permissão, não servidor — mas fases manuais ainda precisam de
   * alguém com essa permissão. Se o aparelho do host sumir por 31 segundos,
   * os demais disputam `claim_host`; o lock do banco entrega a permissão para
   * um só. Presença normal a cada 15s rearma este timer e impede troca falsa.
   */
  const hostLastSeenAt = snapshot?.players.find(
    (player) => player.id === snapshot.room.hostPlayerId,
  )?.lastSeenAt;
  useEffect(() => {
    if (spectator || !roomId || !meId || isHost || !hostLastSeenAt) return;

    const staleAt = Date.parse(hostLastSeenAt) + 31_000;
    const timer = window.setTimeout(() => {
      void api.claimHost(roomId).then(() => refresh());
    }, Math.max(0, staleAt - api.serverNow()));

    return () => window.clearTimeout(timer);
  }, [hostLastSeenAt, isHost, meId, refresh, roomId, spectator]);

  const join = useCallback(
    async (player: Player) => {
      const resultado = await api.joinRoom(
        pin, player.nickname, player.color, player.avatarSeed,
      );
      if (resultado?.room_id) await refresh();
    },
    [pin, refresh],
  );

  const updateMe = useCallback(
    async (patch: Partial<Omit<Player, "id">>) => {
      if (!roomId) return;
      await api.updateMe(roomId, {
        nickname: patch.nickname,
        avatarSeed: patch.avatarSeed,
        color: patch.color,
      });
    },
    [roomId],
  );

  const answer = useCallback(
    (optionIndex: number) => {
      if (roomId) void api.submitAnswer(roomId, optionIndex);
    },
    [roomId],
  );

  const vote = useCallback(
    (rating: number) => {
      if (roomId) void api.submitVote(roomId, rating);
    },
    [roomId],
  );

  /**
   * A entrega do desenho.
   *
   * `strokes` chega como texto serializado e vai para o banco como jsonb —
   * numa LINHA de `contributions`, nunca dentro do estado da sala. É a
   * diferença entre um desenho custar 5 kB uma vez e custar 5 kB a cada
   * retransmissão do estado inteiro, que era o que estourava o canal.
   */
  const submitDrawing = useCallback(
    (payload: { url: string | null; strokes?: string; status?: string }) => {
      if (!roomId) return;
      let strokes: unknown = null;
      if (payload.strokes) {
        try {
          strokes = JSON.parse(payload.strokes);
        } catch {
          strokes = null;
        }
      }
      void api.submitContribution(roomId, {
        storagePath: null,
        strokes,
        status: payload.status ?? "submitted",
      });
    },
    [roomId],
  );

  /** Chega depois do upload. A página já existe; a imagem só a melhora. */
  const attachDrawing = useCallback(
    (storagePath: string, stepIndex: number) => {
      if (roomId) void api.attachDrawing(roomId, stepIndex, storagePath);
    },
    [roomId],
  );

  const submitGuess = useCallback(
    (text: string) => {
      if (roomId) void api.submitContribution(roomId, { text, status: "submitted" });
    },
    [roomId],
  );

  /** Imagem que não carregou sai ANTES de alguém apresentar. */
  const replaceSlides = useCallback(
    (slideIds: string[]) => {
      if (roomId) void api.replaceSlides(roomId, slideIds);
    },
    [roomId],
  );

  /**
   * Começar a partida — com começo, meio e FIM visíveis.
   *
   * Antes isto era um `void api.startMatch(...)` solto no meio do switch. Se a
   * chamada estourasse — não é o host, gente de menos, sala em fase errada —
   * o erro morria num `console.error` e a tela do host ficava idêntica. Ele
   * apertava "Começar" de novo, e de novo, e a festa concluía que o app tinha
   * travado. Era indistinguível de botão lento.
   *
   * Agora o host vê "COMEÇANDO...", e se em `INIT_TIMEOUT_MS` a sala não tiver
   * saído do lobby, vê que não deu e pode tentar de novo. `start_match` é uma
   * transação só: ou a partida nasceu inteira, ou não nasceu — não existe
   * partida meio-criada para limpar.
   */
  const [initState, setInitState] = useState<"idle" | "starting" | "failed">("idle");
  const [initError, setInitError] = useState<string | null>(null);
  const initTimer = useRef<number | null>(null);

  const startMatch = useCallback(async () => {
    if (!roomId || !state) return;
    const jogadores = state.players.length;
    const gameId = state.settings.gameId;
    const deck = getDeck(state.settings.difficulty);
    const game = getGame(gameId);
    // Sorteia UMA vez e reaproveita: sortear de novo para o gabarito daria
    // uma ordem diferente da das perguntas.
    const ordem = gameId === "quem-erra-paga" ? drawOrder(deck.length, game.rounds) : [];

    setInitState("starting");
    setInitError(null);

    const sala = await api.startMatch(roomId, {
      prompts: gameId === "drawing-telephone" ? drawPrompts(jogadores, []) : [],
      topics:
        gameId === "advogado-do-diabo"
          ? buildTopicPool(
              state.devil?.customTopics ?? [], state.settings.difficulty,
            ).map((t) => ({ id: t.id, source: t.source, text: t.text }))
          : [],
      questionOrder: ordem,
      // `-1` para a pegadinha (`correctAnswer: null`): nenhuma alternativa
      // está certa, então nenhum índice pode casar.
      correct: ordem.map((indice) => deck[indice]?.correctAnswer ?? -1),
      slideIds: gameId === "improv-slides" ? activeSlides.map((slide) => slide.id) : [],
      // O acervo de prendas mora no TS; o banco só precisa do tamanho para
      // sortear sem perguntar nada ao cliente.
      punishmentCount: punishments.length,
    });

    if (!sala) {
      setInitState("failed");
      setInitError(api.lastRpcFailure()?.message ?? "a chamada não voltou");
      return;
    }
    await refresh();
  }, [roomId, state, refresh]);

  /**
   * A sala saiu do lobby: deu certo, independente de quem apertou.
   *
   * Fecha o estado pelo FATO (a fase mudou), e não pela resposta da chamada —
   * assim o host que recarregou a página no meio do começo também sai da tela
   * de espera.
   */
  const faseAtual = state?.phase;
  useEffect(() => {
    if (initState === "idle") return;
    if (faseAtual && faseAtual !== "LOBBY") {
      setInitState("idle");
      setInitError(null);
    }
  }, [faseAtual, initState]);

  /** Espera sem fim é proibida, aqui como em qualquer outro lugar. */
  useEffect(() => {
    if (initState !== "starting") return;
    initTimer.current = window.setTimeout(() => {
      setInitState("failed");
      setInitError("o servidor não respondeu a tempo");
    }, INIT_TIMEOUT_MS);
    return () => {
      if (initTimer.current) window.clearTimeout(initTimer.current);
    };
  }, [initState]);

  /**
   * Comandos do host.
   *
   * Vira chamada de RPC, e o BANCO confere se quem mandou é mesmo o host.
   * Antes essa checagem era feita no cliente (`usePartyRoom`), o que a tornava
   * apenas um aviso — qualquer aparelho podia mandar.
   */
  const sendHostCommand = useCallback(
    (command: HostCommand) => {
      if (!roomId || !state) return;

      switch (command.type) {
        case "SET_GAME":
          void api.setSettings(roomId, command.gameId, null);
          return;
        case "SET_DIFFICULTY":
          void api.setSettings(roomId, null, {
            ...state.settings, difficulty: command.difficulty,
          });
          return;
        case "SET_THEME":
          void api.setSettings(roomId, null, {
            ...state.settings,
            ...(command.themeId ? { themeId: command.themeId } : {}),
            ...(command.themeMode ? { themeMode: command.themeMode } : {}),
          });
          return;

        case "START_GAME":
          void startMatch();
          return;

        case "ADVANCE":
          // `force`: o host pulando na mão dispensa o prazo, mas o
          // compare-and-set continua valendo.
          void api.advancePhase(
            roomId, state.phase,
            expectedPhaseEnd(snapshot, state),
            true,
          );
          return;
        case "REROLL_TOPIC":
          void api.rerollTopic(roomId);
          return;
        case "REROLL_PUNISHMENT":
          void api.rerollPunishment(roomId);
          return;
        case "COUNT_AS_MATCH":
          void api.countAsMatch(roomId, command.chainId);
          return;
        case "SET_REVEAL_AUTOPLAY":
          void api.setRevealAutoplay(roomId, command.autoPlay);
          return;
        case "PAUSE":
          void api.pauseRoom(roomId, true);
          return;
        case "RESUME":
          void api.pauseRoom(roomId, false);
          return;
        case "RESET_TO_LOBBY":
          void api.resetToLobby(roomId);
          return;

        // Teses do host moram em `rooms.settings`: são configuração da sala,
        // escritas no lobby, e não estado da partida.
        case "ADD_CUSTOM_TOPIC": {
          const atuais = state.devil?.customTopics ?? [];
          void api.setSettings(roomId, null, {
            ...state.settings, customTopics: [...atuais, command.topic],
          });
          return;
        }
        case "EDIT_CUSTOM_TOPIC": {
          const atuais = state.devil?.customTopics ?? [];
          void api.setSettings(roomId, null, {
            ...state.settings,
            customTopics: atuais.map((t) =>
              t.id === command.id
                ? { ...t, text: command.text, aboutPlayerId: command.aboutPlayerId }
                : t,
            ),
          });
          return;
        }
        case "REMOVE_CUSTOM_TOPIC": {
          const atuais = state.devil?.customTopics ?? [];
          void api.setSettings(roomId, null, {
            ...state.settings, customTopics: atuais.filter((t) => t.id !== command.id),
          });
          return;
        }
        default:
          return;
      }
    },
    [roomId, snapshot, state, startMatch],
  );

  const closeParty = useCallback(async () => {
    if (roomId) await api.closeRoom(roomId);
  }, [roomId]);

  /**
   * Sair de verdade, por decisão da pessoa.
   *
   * Diferente de sumir a rede: `leave_room` carimba `left_at`, e a vaga é
   * devolvida. A RPC existia desde a primeira migração e nada a chamava, então
   * quem saía continuava ocupando lugar na contagem de capacidade.
   */
  const leaveParty = useCallback(async () => {
    if (roomId) await api.leaveRoom(roomId);
  }, [roomId]);

  return {
    enabled: ativo,
    state: state as PartyState | null,
    me: meInParty,
    meInParty,
    isHost,
    // Não existe mais "o aparelho que manda". Mantido só para as telas que
    // ainda perguntam; sempre falso na nuvem, e é essa a mudança.
    isAuthority: false,
    connection: connection === "offline" ? "connecting" : connection,
    authError,
    snapshot,
    /** `starting` enquanto o banco monta a partida; `failed` quando não deu. */
    initState,
    initError,
    /** "Tentar de novo" do host. Idempotente: `start_match` só age no lobby. */
    retryStart: startMatch,
    /**
     * Pedir a foto de novo, na mão.
     *
     * Existe para as telas que podem ficar sem o que renderizar — a tarefa do
     * passo que não chegou, por exemplo. Sem isto a única saída era esperar um
     * evento de Realtime que talvez não venha, que é o formato de todo
     * travamento que já tivemos.
     */
    refresh,
    join,
    updateMe,
    answer,
    vote,
    submitDrawing,
    attachDrawing,
    submitGuess,
    replaceSlides,
    sendHostCommand,
    closeParty,
    leaveParty,
  };
}
