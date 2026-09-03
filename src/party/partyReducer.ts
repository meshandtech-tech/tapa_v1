import type { DrawingPrompt } from "../data/drawingPrompts";
import { getDeck } from "../data/questions";
import { DRAWING_TELEPHONE_CONFIG } from "../games/drawing/config";
import { stepType } from "../games/drawing/routing";
import { IMPROV_SLIDES_CONFIG } from "../games/slides/config";
import {
  createSlidesState,
  currentPresenter as slidesPresenter,
  everyonePresented as slidesEveryonePresented,
  rememberSlides,
  roundAverage as slidesAverage,
  slideProgress,
} from "../games/slides/slides";
import {
  comparisonPageIndex,
  createDrawingState,
  drawingScores,
  fillMissingPages,
  recordPage,
} from "../games/drawing/state";
import {
  buildTopicPool,
  createDevilState,
  currentPresenter,
  drawCandidates,
  everyonePresented,
  roundAverage,
} from "../games/advogadoDoDiabo";
import { roundOutcome, sequentialOrder } from "../games/quemErraPaga";
import { DEFAULT_GAME_ID, getGame, phaseDuration } from "../games/registry";
import { currentMatchPlayers, isCurrentMatchParticipant } from "../games/participants";
import { DEFAULT_THEME_ID, nextThemeId } from "../theme/presets";
import {
  MAX_CUSTOM_TOPICS,
  MAX_PLAYERS,
  NICKNAME_MAX_LENGTH,
  PLAYER_COLORS,
  type Difficulty,
  type GameId,
  type PartyPhase,
  type PartyState,
  type PartySettings,
  type Player,
  type CustomTopic,
  type DevilState,
  type MatchTopic,
  type DrawingState,
  type SlidesState,
  type SubmissionStatus,
  type ThemeId,
  type ThemeMode,
} from "./types";

/**
 * Guarda a lista de teses do host mesmo antes do jogo começar — o `devil`
 * ainda não existe no lobby, mas o host já pode escrever.
 */
function withCustomTopics(state: PartyState, customTopics: CustomTopic[]): DevilState {
  if (state.devil) return { ...state.devil, customTopics };
  return {
    order: [], index: -1, pool: [], candidates: [], winner: 0,
    customTopics, votes: {}, scores: {}, disclaimerAccepted: false,
  };
}

export function createPartyState(
  pin: string,
  now = Date.now(),
  settings: Partial<PartySettings> = {},
): PartyState {
  return {
    version: 1,
    pin,
    phase: "LOBBY",
    players: [],
    settings: {
      gameId: DEFAULT_GAME_ID,
      difficulty: "medium",
      themeId: DEFAULT_THEME_ID,
      themeMode: "manual",
      ...settings,
    },
    round: 0,
    createdAt: now,
    quiz: null,
    devil: null,
    drawing: null,
    slides: null,
    hostPlayerId: null,
    phaseDeadline: 0,
    pausedAt: null,
  };
}

/** Teto real da sala: o menor entre o limite do jogo e o da plataforma. */
export function roomCapacity(gameId: GameId): number {
  return Math.min(getGame(gameId).maxPlayers, MAX_PLAYERS);
}

export type PartyAction =
  | { type: "HYDRATE"; state: PartyState }
  | { type: "PLAYER_JOIN"; player: Player }
  | { type: "PLAYER_LEAVE"; playerId: string }
  | { type: "PLAYER_UPDATE"; playerId: string; patch: Partial<Omit<Player, "id">> }
  /** Um jogador assume o comando da sala. Só pega se estiver vago. */
  | { type: "CLAIM_HOST"; playerId: string }
  | { type: "SET_GAME"; gameId: GameId }
  | { type: "SET_DIFFICULTY"; difficulty: Difficulty }
  | { type: "SET_THEME"; themeId?: ThemeId; themeMode?: ThemeMode }
  | { type: "SCORE"; playerId: string; delta: number }
  /** `order` e `now` vêm do host: o reducer continua puro e testável. */
  | {
      type: "START_GAME";
      order?: number[];
      now?: number;
      /** Só para o jogo de desenho — sorteados pela autoridade. */
      seatOrder?: string[];
      prompts?: DrawingPrompt[];
      chainIds?: string[];
      matchId?: string;
    }
  | { type: "ANSWER"; playerId: string; optionIndex: number; now?: number }
  | {
      type: "ADVANCE";
      forfeit?: boolean;
      now?: number;
      punishmentIndex?: number;
      /** Slides da próxima apresentação — sorteados pela autoridade. */
      slideIds?: string[];
      slidePoolSize?: number;
    }
  /** Ninguém topou a prenda: sorteia outra sem sair da roleta. */
  | { type: "REROLL_PUNISHMENT"; punishmentIndex: number }
  /** Nota de 1 a 5 para a apresentação da rodada. */
  | { type: "VOTE"; playerId: string; rating: number }
  /** O grupo topa a tese que saiu; sem isto o host pode pedir outra. */
  | { type: "REROLL_TOPIC" }
  | { type: "ACCEPT_DISCLAIMER" }
  | { type: "ADD_CUSTOM_TOPIC"; topic: CustomTopic }
  | { type: "EDIT_CUSTOM_TOPIC"; id: string; text: string; aboutPlayerId?: string }
  | { type: "REMOVE_CUSTOM_TOPIC"; id: string }
  /** Entrega de um desenho. `url` vazio = branco, ou upload que não foi. */
  | {
      type: "SUBMIT_DRAWING";
      playerId: string;
      url: string | null;
      strokes?: string;
      status?: SubmissionStatus;
    }
  | { type: "SUBMIT_GUESS"; playerId: string; text: string }
  /** Liga ou desliga o avanço automático do slideshow da revelação. */
  | { type: "SET_REVEAL_AUTOPLAY"; autoPlay: boolean; now?: number }
  /** O host bancou que o palpite valia, mesmo sem casar na comparação. */
  | { type: "COUNT_AS_MATCH"; chainId: string }
  /** Emergência do host: corta o slide corrente e vai para o seguinte. */
  | { type: "SKIP_SLIDE"; now?: number }
  /** Troca slides que não carregaram, antes de a apresentação começar. */
  | { type: "REPLACE_SLIDES"; slideIds: string[] }
  | { type: "PAUSE"; now?: number }
  | { type: "RESUME"; now?: number }
  | { type: "RESET_TO_LOBBY" };

/**
 * Transições legais. Fora daqui, o reducer devolve o estado atual.
 * Nada aqui lança: durante uma festa, um estado inesperado tem de virar
 * "nada acontece", nunca uma tela branca.
 */
const TRANSITIONS: Partial<Record<PartyPhase, readonly PartyPhase[]>> = {
  // Quem Erra, Paga
  LOBBY: ["GAME_INTRO"],
  GAME_INTRO: ["ROUND_ACTIVE", "TOPIC_SPIN", "DRAW_STEP", "PLAYER_SPIN"],
  ROUND_ACTIVE: ["REVEAL_ANSWER"],
  REVEAL_ANSWER: ["FORFEIT_WHEEL", "LEADERBOARD"],
  FORFEIT_WHEEL: ["LEADERBOARD"],
  LEADERBOARD: ["ROUND_ACTIVE", "GAME_OVER"],
  // Advogado do Diabo
  TOPIC_SPIN: ["TOPIC_REVEAL"],
  TOPIC_REVEAL: ["PLAYER_SPIN", "TOPIC_SPIN"], // TOPIC_SPIN = o grupo pediu outra tese
  PLAYER_SPIN: ["PLAYER_REVEAL"],
  PLAYER_REVEAL: ["PREPARATION"],
  PREPARATION: ["COUNTDOWN", "TOPIC_SPIN"],
  // O Apresentação Improvisada reaproveita as fases do Advogado do Diabo: são
  // as mesmas batidas (sorteia quem, revela, prepara, conta, apresenta, vota).
  COUNTDOWN: ["PRESENTATION"],
  PRESENTATION: ["VOTING"],
  VOTING: ["SCORE_REVEAL"],
  SCORE_REVEAL: ["TOPIC_SPIN", "PLAYER_SPIN", "GAME_OVER"],
  // Telefone Sem Fio de Desenho
  DRAW_STEP: ["PASSING"],
  GUESS_STEP: ["PASSING"],
  PASSING: ["DRAW_STEP", "GUESS_STEP", "REVEAL_INTRO"],
  REVEAL_INTRO: ["REVEAL_PAGE"],
  REVEAL_PAGE: ["REVEAL_PAGE", "GAME_OVER"],
  GAME_OVER: [],
};

export function canTransition(from: PartyPhase, to: PartyPhase): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

/**
 * Dá para começar? Vale no lobby E no fim de jogo — "jogar de novo" não
 * deveria obrigar o grupo a voltar ao lobby antes.
 */
export function canStart(state: PartyState): boolean {
  const game = getGame(state.settings.gameId);
  const podeIniciar = state.phase === "LOBBY" || state.phase === "GAME_OVER";
  return podeIniciar && state.players.length >= game.minPlayers;
}

/** Primeira cor livre da paleta; volta ao início se a sala estiver cheia de cores. */
export function nextAvailableColor(players: readonly Player[]): string {
  const taken = new Set(players.map((player) => player.color));
  return PLAYER_COLORS.find((color) => !taken.has(color)) ?? PLAYER_COLORS[0];
}

export function isNicknameTaken(players: readonly Player[], nickname: string, selfId?: string): boolean {
  const normalized = nickname.trim().toLowerCase();
  return players.some(
    (player) => player.id !== selfId && player.nickname.trim().toLowerCase() === normalized,
  );
}

function sanitizeNickname(nickname: string): string {
  return nickname.trim().slice(0, NICKNAME_MAX_LENGTH);
}

/**
 * Garante que a sala SEMPRE tenha um host: o primeiro da fila assume.
 *
 * A versão anterior dependia de um token no localStorage de quem criou a sala,
 * o que não funciona na vida real — a sala é criada no computador e as pessoas
 * entram pelo celular, que é outro aparelho com outro localStorage. Resultado:
 * ninguém reivindicava o papel, ninguém tinha controles e o jogo não começava.
 */
function ensureHost(state: PartyState): PartyState {
  if (state.hostPlayerId && state.players.some((p) => p.id === state.hostPlayerId)) {
    return state;
  }
  return { ...state, hostPlayerId: state.players[0]?.id ?? null };
}

/** Este jogador faz parte da PARTIDA em curso (e não só da sala)? */
function isMatchParticipant(state: PartyState, playerId: string): boolean {
  return (
    state.drawing?.seatOrder.includes(playerId) ||
    state.devil?.order.includes(playerId) ||
    state.slides?.order.includes(playerId) ||
    false
  );
}

function joinPlayer(state: PartyState, player: Player): PartyState {
  // Reconexão: o mesmo id reentrando atualiza em vez de duplicar.
  const existing = state.players.findIndex((item) => item.id === player.id);
  if (existing >= 0) {
    const players = [...state.players];
    players[existing] = { ...players[existing], ...player, score: players[existing].score };
    return ensureHost({ ...state, players });
  }

  const nickname = sanitizeNickname(player.nickname);
  if (!nickname) return state;

  /**
   * Quem JÁ ESTAVA na partida volta sempre, em qualquer fase.
   *
   * Este é o bug do playtest: a pessoa recarregava a página, saía do roster, e
   * ao voltar era tratada como estranha — recusada por "a partida já começou",
   * para sempre, enquanto o assento dela continuava na mesa segurando todos os
   * passos até o prazo estourar. Participar da partida é um fato do
   * `seatOrder`, e ele é congelado no início justamente para sobreviver a isso.
   */
  if (isMatchParticipant(state, player.id)) {
    return ensureHost({
      ...state,
      players: [...state.players, { ...player, nickname }],
    });
  }

  // Entrada NOVA. Vale em qualquer fase enquanto houver vaga: pertencer à
  // SALA e participar da PARTIDA corrente são coisas separadas. Quem chega no
  // meio fica na sala e entra na próxima partida.
  if (state.players.length >= roomCapacity(state.settings.gameId)) return state;
  if (isNicknameTaken(state.players, nickname)) return state;

  return ensureHost({
    ...state,
    players: [...state.players, { ...player, nickname, score: 0 }],
  });
}

/**
 * Tira um jogador da sala. Se era o host, o comando passa para quem entrou
 * primeiro — sem isso a sala ficaria sem ninguém podendo pausar ou pular.
 */
function leavePlayer(state: PartyState, playerId: string): PartyState {
  /**
   * Quem está NA PARTIDA não sai do roster por ter sumido.
   *
   * `PLAYER_LEAVE` é disparado ao desmontar a tela — ou seja, também num F5,
   * numa troca de aba ou num soluço de rede. Apagar a pessoa nesses casos era
   * o que fazia ela perder o lugar, o apelido e os pontos no meio do jogo.
   * Durante a partida isto vira presença, não exclusão; sair de verdade só
   * acontece no lobby.
   */
  if (isMatchParticipant(state, playerId)) return state;

  const players = state.players.filter((player) => player.id !== playerId);
  if (players.length === state.players.length) return state;
  return ensureHost({ ...state, players });
}

function updatePlayer(
  state: PartyState,
  playerId: string,
  patch: Partial<Omit<Player, "id">>,
): PartyState {
  const index = state.players.findIndex((player) => player.id === playerId);
  if (index < 0) return state;

  const nickname =
    patch.nickname === undefined ? undefined : sanitizeNickname(patch.nickname);
  if (nickname !== undefined && (!nickname || isNicknameTaken(state.players, nickname, playerId))) {
    return state;
  }

  const players = [...state.players];
  players[index] = { ...players[index], ...patch, ...(nickname ? { nickname } : {}) };
  return { ...state, players };
}

/**
 * Cor da próxima rodada. No modo `auto` o preset gira; no `manual` fica onde o
 * host deixou. Fica no reducer — e não num efeito de UI — para que a cor da
 * rodada seja estado puro: determinística, testável e igual na TV e nos celulares.
 */
function rotateTheme(settings: PartySettings): PartySettings {
  if (settings.themeMode !== "auto") return settings;
  return { ...settings, themeId: nextThemeId(settings.themeId) };
}

/**
 * Entra numa fase e arma o prazo dela.
 *
 * É o único lugar que escreve `phase`, justamente para que NENHUMA fase possa
 * ser criada sem prazo — se isso acontecesse, o jogo pararia ali esperando um
 * clique que ninguém vai dar.
 */
function enterPhase(
  state: PartyState,
  phase: PartyPhase,
  now: number,
  patch: Partial<PartyState> = {},
  /**
   * Sobrepõe a duração declarada no registry. Existe por causa da revelação:
   * a MESMA fase espera o host ou anda sozinha, conforme o auto-play.
   */
  duracao?: number,
): PartyState {
  const duration = duracao ?? phaseDuration(state.settings.gameId, phase);
  return {
    ...state,
    ...patch,
    phase,
    // Fase sem duração declarada (LOBBY, GAME_OVER) espera decisão humana.
    phaseDeadline: duration > 0 ? now + duration : 0,
    pausedAt: null,
  };
}

/** Abre uma rodada: zera as respostas e gira a cor, se o modo for automático. */
function startRound(state: PartyState, round: number, now: number): PartyState {
  return enterPhase(state, "ROUND_ACTIVE", now, {
    round,
    settings: rotateTheme(state.settings),
    quiz: state.quiz ? { ...state.quiz, answers: {}, punishmentIndex: null } : null,
  });
}

/** +1 para cada acerto. Aplicado uma única vez, ao revelar a resposta. */
function applyScores(state: PartyState): PartyState {
  const { correct } = roundOutcome(state);
  if (correct.length === 0) return state;
  const winners = new Set(correct.map((player) => player.id));
  return {
    ...state,
    players: state.players.map((player) =>
      winners.has(player.id) ? { ...player, score: player.score + 1 } : player,
    ),
  };
}

/**
 * Fluxo do "Advogado do Diabo".
 *
 * O tema sai ANTES do apresentador: a sala lê a tese, reage, e só então
 * descobre quem terá que defendê-la.
 */
function advanceDevil(state: PartyState, now: number): PartyState {
  const devil = state.devil;
  if (!devil) return state;
  const proxima = getGame(state.settings.gameId).flow[state.phase];

  switch (state.phase) {
    case "GAME_INTRO":
    case "SCORE_REVEAL": {
      // Acabou a fila: ninguém apresenta duas vezes.
      if (state.phase === "SCORE_REVEAL" && everyonePresented(state)) {
        return enterPhase(state, "GAME_OVER", now);
      }
      const candidates = drawCandidates(state);
      return enterPhase(state, "TOPIC_SPIN", now, {
        devil: { ...devil, candidates, winner: pickWinner(candidates.length), votes: {} },
      });
    }

    case "TOPIC_SPIN": {
      const escolhido = devil.candidates[devil.winner];
      if (!escolhido) return enterPhase(state, "TOPIC_REVEAL", now);
      // Sai do acervo já aqui: se o grupo pedir outro, este não volta — nem
      // nesta rodada nem nesta partida.
      return enterPhase(state, "TOPIC_REVEAL", now, {
        devil: { ...devil, pool: markTopicUsed(devil.pool, escolhido, now) },
      });
    }

    case "TOPIC_REVEAL":
      // Só agora a fila anda — o apresentador desta rodada fica definido.
      return enterPhase(state, "PLAYER_SPIN", now, {
        devil: { ...devil, index: devil.index + 1 },
        round: state.round + 1,
      });

    case "PRESENTATION":
      return enterPhase(state, "VOTING", now, { devil: { ...devil, votes: {} } });

    case "VOTING": {
      const media = roundAverage(state);
      const apresentador = currentPresenter(state);
      return enterPhase(state, "SCORE_REVEAL", now, {
        devil:
          apresentador && media !== null
            ? { ...devil, scores: { ...devil.scores, [apresentador.id]: media } }
            : devil,
      });
    }

    default:
      return proxima ? enterPhase(state, proxima, now) : state;
  }
}

/**
 * Fluxo do Telefone Sem Fio de Desenho.
 *
 * Corre praticamente sozinho: cada passo fecha quando todo mundo entregou ou
 * quando o prazo vence, sem ninguém apertar nada. O host só volta a mandar na
 * revelação, que é onde o grupo está rindo e o ritmo tem de ser humano.
 */
function advanceDrawing(state: PartyState, now: number): PartyState {
  const drawing = state.drawing;
  if (!drawing) return state;

  switch (state.phase) {
    case "GAME_INTRO":
      return enterPhase(state, "DRAW_STEP", now, {
        drawing: { ...drawing, stepIndex: 0, submitted: [] },
        round: 1,
      });

    case "DRAW_STEP":
    case "GUESS_STEP":
      // Quem não entregou vira página em branco. Um desenho vazio no meio do
      // caderno é parte do caos; travar a sala esperando não é.
      return enterPhase(state, "PASSING", now, { drawing: fillMissingPages(drawing) });

    case "PASSING": {
      const proximo = drawing.stepIndex + 1;
      if (proximo >= drawing.stepCount) {
        return enterPhase(state, "REVEAL_INTRO", now, {
          drawing: { ...drawing, revealChainIndex: 0, revealPageIndex: 0 },
        });
      }
      return enterPhase(
        state,
        stepType(proximo) === "draw" ? "DRAW_STEP" : "GUESS_STEP",
        now,
        { drawing: { ...drawing, stepIndex: proximo, submitted: [] }, round: proximo + 1 },
      );
    }

    case "REVEAL_INTRO":
      return enterRevealPage(state, drawing, 0, 0, now);

    case "REVEAL_PAGE": {
      if (drawing.revealPageIndex < comparisonPageIndex(drawing.stepCount)) {
        return enterRevealPage(
          state, drawing, drawing.revealChainIndex, drawing.revealPageIndex + 1, now,
        );
      }
      const proximoCaderno = drawing.revealChainIndex + 1;
      if (proximoCaderno < drawing.chains.length) {
        return enterRevealPage(state, drawing, proximoCaderno, 0, now);
      }
      return enterPhase(applyDrawingScores(state, drawing), "GAME_OVER", now);
    }

    default:
      return state;
  }
}

/** Uma página do slideshow. Espera o host, ou anda sozinha no auto-play. */
function enterRevealPage(
  state: PartyState,
  drawing: DrawingState,
  chainIndex: number,
  pageIndex: number,
  now: number,
): PartyState {
  return enterPhase(
    state,
    "REVEAL_PAGE",
    now,
    { drawing: { ...drawing, revealChainIndex: chainIndex, revealPageIndex: pageIndex } },
    drawing.revealAutoPlay ? DRAWING_TELEPHONE_CONFIG.revealPageMs : 0,
  );
}

/**
 * Placar final: um ponto por caderno cuja palavra chegou inteira do outro lado.
 *
 * Recalculado dos cadernos, nunca somado ao longo da revelação — assim rever
 * uma página, ou o host validar um palpite na mão, não pontua duas vezes.
 */
function applyDrawingScores(state: PartyState, drawing: DrawingState): PartyState {
  const pontos = drawingScores(drawing);
  return {
    ...state,
    players: state.players.map((player) => ({ ...player, score: pontos[player.id] ?? 0 })),
  };
}

/**
 * Fluxo do "Apresentação Improvisada".
 *
 * Reaproveita as fases do Advogado do Diabo porque as batidas são as mesmas:
 * sorteia quem vai, revela, prepara, conta 3-2-1, apresenta, vota, mostra a
 * nota. O que muda é a duração de cada uma e o que aparece na tela.
 *
 * Os cinco slides são sorteados já na entrada do PLAYER_SPIN, e não na
 * preparação: assim existem uns oito segundos de sorteio e revelação para os
 * aparelhos pré-carregarem as imagens. Quando a preparação começa, tudo já
 * está na memória — que era o requisito.
 */
function advanceSlides(state: PartyState, now: number, action: PartyAction): PartyState {
  const slides = state.slides;
  if (!slides) return state;
  const sorteados = action.type === "ADVANCE" ? (action.slideIds ?? []) : [];
  const tamanhoAcervo = action.type === "ADVANCE" ? (action.slidePoolSize ?? 0) : 0;

  switch (state.phase) {
    case "GAME_INTRO":
    case "SCORE_REVEAL": {
      // Fila esgotada: ninguém apresenta duas vezes antes de todos irem uma.
      if (state.phase === "SCORE_REVEAL" && slidesEveryonePresented(state)) {
        return enterPhase(state, "GAME_OVER", now);
      }
      return enterPhase(state, "PLAYER_SPIN", now, {
        slides: {
          ...slides,
          index: slides.index + 1,
          slideIds: sorteados,
          usedSlideIds: rememberSlides(slides.usedSlideIds, sorteados, tamanhoAcervo),
          votes: {},
          instructionsSeen: true,
        },
        round: state.round + 1,
      });
    }

    case "PRESENTATION":
      return enterPhase(state, "VOTING", now, { slides: { ...slides, votes: {} } });

    case "VOTING": {
      const media = slidesAverage(state);
      const apresentador = slidesPresenter(state);
      return enterPhase(state, "SCORE_REVEAL", now, {
        slides:
          apresentador && media !== null
            ? { ...slides, scores: { ...slides.scores, [apresentador.id]: media } }
            : slides,
      });
    }

    default: {
      const proxima = getGame(state.settings.gameId).flow[state.phase];
      return proxima ? enterPhase(state, proxima, now) : state;
    }
  }
}

/** Marca um tema como usado, sem tocar no resto do acervo. */
function markTopicUsed(
  pool: readonly MatchTopic[], alvo: MatchTopic, now: number,
): MatchTopic[] {
  const iso = new Date(now).toISOString();
  return pool.map((topic) =>
    topic.id === alvo.id && topic.source === alvo.source
      ? { ...topic, usedAt: topic.usedAt ?? iso }
      : topic,
  );
}

/** Idem, para o tema que o host recusou. */
function markTopicRejected(
  pool: readonly MatchTopic[], alvo: MatchTopic, now: number,
): MatchTopic[] {
  const iso = new Date(now).toISOString();
  return pool.map((topic) =>
    topic.id === alvo.id && topic.source === alvo.source
      ? { ...topic, rejectedAt: topic.rejectedAt ?? iso, usedAt: topic.usedAt ?? iso }
      : topic,
  );
}

function pickWinner(total: number): number {
  if (total <= 0) return 0;
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return buffer[0] % total;
  }
  return Math.floor(Math.random() * total);
}

function advance(
  state: PartyState,
  forfeit: boolean,
  now: number,
  punishmentIndex: number,
  action: PartyAction,
): PartyState {
  if (state.settings.gameId === "improv-slides") return advanceSlides(state, now, action);
  if (state.settings.gameId === "advogado-do-diabo") return advanceDevil(state, now);
  if (state.settings.gameId === "drawing-telephone") return advanceDrawing(state, now);
  const game = getGame(state.settings.gameId);
  // A ordem sorteada manda no total de rodadas: o deck pode ser menor que
  // `game.rounds`, e aí a partida acaba junto com as perguntas.
  const totalRounds = state.quiz?.order.length ?? game.rounds;

  switch (state.phase) {
    case "GAME_INTRO":
      return startRound(state, 1, now);

    case "ROUND_ACTIVE":
      // Pontua ao revelar — depois disso as respostas viram histórico da rodada.
      return enterPhase(applyScores(state), "REVEAL_ANSWER", now);

    case "REVEAL_ANSWER": {
      // Quem não respondeu conta como erro; a prenda é a mesma para todos.
      const alguemErrou = state.quiz ? roundOutcome(state).wrong.length > 0 : forfeit;
      if (!game.hasForfeit || !alguemErrou) return enterPhase(state, "LEADERBOARD", now);
      return enterPhase(state, "FORFEIT_WHEEL", now, {
        quiz: state.quiz ? { ...state.quiz, punishmentIndex } : null,
      });
    }

    case "FORFEIT_WHEEL":
      return enterPhase(state, "LEADERBOARD", now);

    case "LEADERBOARD":
      return state.round >= totalRounds
        ? enterPhase(state, "GAME_OVER", now)
        : startRound(state, state.round + 1, now);

    default:
      // LOBBY avança só via START_GAME; GAME_OVER é terminal.
      return state;
  }
}

export function partyReducer(state: PartyState, action: PartyAction): PartyState {
  switch (action.type) {
    case "HYDRATE":
      return action.state;

    case "PLAYER_JOIN":
      return joinPlayer(state, action.player);

    case "PLAYER_LEAVE":
      return leavePlayer(state, action.playerId);

    case "PLAYER_UPDATE":
      return updatePlayer(state, action.playerId, action.patch);

    // Primeiro a chegar leva. Não há disputa: quem criou a sala guarda um
    // token local e reivindica assim que entra.
    case "CLAIM_HOST": {
      if (state.hostPlayerId && state.hostPlayerId !== action.playerId) return state;
      if (!state.players.some((player) => player.id === action.playerId)) return state;
      return { ...state, hostPlayerId: action.playerId };
    }

    case "SET_GAME":
      if (state.phase !== "LOBBY") return state;
      return { ...state, settings: { ...state.settings, gameId: action.gameId } };

    case "SET_DIFFICULTY":
      if (state.phase !== "LOBBY") return state;
      return { ...state, settings: { ...state.settings, difficulty: action.difficulty } };

    // Sem trava de fase: o host pode trocar a cor da festa a qualquer momento.
    case "SET_THEME":
      return {
        ...state,
        settings: {
          ...state.settings,
          ...(action.themeId ? { themeId: action.themeId } : {}),
          ...(action.themeMode ? { themeMode: action.themeMode } : {}),
        },
      };

    case "SCORE": {
      const index = state.players.findIndex((player) => player.id === action.playerId);
      if (index < 0 || !Number.isFinite(action.delta)) return state;
      const players = [...state.players];
      players[index] = {
        ...players[index],
        score: Math.max(0, players[index].score + action.delta),
      };
      return { ...state, players };
    }

    case "START_GAME": {
      if (!canStart(state)) return state;
      const now = action.now ?? Date.now();
      // Partida nova, placar zerado — senão "jogar de novo" começa viciado
      // com os pontos da anterior.
      const players = state.players.map((player) => ({ ...player, score: 0 }));

      if (state.settings.gameId === "advogado-do-diabo") {
        // Os temas do host sobrevivem a um "jogar de novo".
        return enterPhase(state, "GAME_INTRO", now, {
          players,
          round: 0,
          quiz: null,
          drawing: null,
          slides: null,
          devil: createDevilState(
            players,
            state.devil?.customTopics ?? [],
            // Acervo finito, sorteado UMA vez e congelado para a partida toda.
            buildTopicPool(state.devil?.customTopics ?? [], state.settings.difficulty),
          ),
        });
      }

      if (state.settings.gameId === "improv-slides") {
        return enterPhase(state, "GAME_INTRO", now, {
          players,
          round: 0,
          quiz: null,
          devil: null,
          drawing: null,
          // A ordem chega sorteada da autoridade; sem ela, a de entrada serve.
          slides: createSlidesState(players, action.seatOrder ?? []),
        });
      }

      if (state.settings.gameId === "drawing-telephone") {
        // Ordem sorteada UMA vez e congelada: recalcular quando alguém
        // reconecta embaralharia a partida inteira no meio.
        const seatOrder = action.seatOrder ?? players.map((player) => player.id);
        return enterPhase(state, "GAME_INTRO", now, {
          players,
          round: 0,
          quiz: null,
          devil: null,
          slides: null,
          drawing: createDrawingState(
            players,
            seatOrder,
            action.prompts ?? [],
            action.chainIds ?? [],
            action.matchId ?? String(now),
          ),
        });
      }

      const game = getGame(state.settings.gameId);
      const deck = getDeck(state.settings.difficulty);
      return enterPhase(state, "GAME_INTRO", now, {
        players,
        round: 0,
        devil: null,
        drawing: null,
        slides: null,
        quiz: {
          participantIds: players.map((player) => player.id),
          order: action.order ?? sequentialOrder(deck.length, game.rounds),
          answers: {},
          punishmentIndex: null,
        },
      });
    }

    case "ANSWER": {
      if (state.phase !== "ROUND_ACTIVE" || !state.quiz) return state;
      // Resposta atrasada não entra. A TV avança com um respiro depois do
      // prazo, e sem esta trava esse respiro viraria tempo extra.
      if (state.phaseDeadline > 0 && (action.now ?? 0) > state.phaseDeadline) return state;
      if (!isCurrentMatchParticipant(state, action.playerId)) return state;
      // Resposta é definitiva: sem trocar depois de ver a cara dos outros.
      if (state.quiz.answers[action.playerId] !== undefined) return state;
      if (!Number.isInteger(action.optionIndex)) return state;
      if (action.optionIndex < 0 || action.optionIndex > 3) return state;
      return {
        ...state,
        quiz: {
          ...state.quiz,
          answers: { ...state.quiz.answers, [action.playerId]: action.optionIndex },
        },
      };
    }

    // Válvula de escape: se ninguém topa a prenda, roda de novo em vez de
    // travar a festa numa discussão. Só vale enquanto a roleta está na tela.
    case "REROLL_PUNISHMENT": {
      if (state.phase !== "FORFEIT_WHEEL" || !state.quiz) return state;
      if (!Number.isInteger(action.punishmentIndex)) return state;
      return {
        ...state,
        quiz: { ...state.quiz, punishmentIndex: action.punishmentIndex },
      };
    }

    case "VOTE": {
      if (state.phase !== "VOTING") return state;
      if (!Number.isInteger(action.rating) || action.rating < 1 || action.rating > 5) return state;
      if (!isCurrentMatchParticipant(state, action.playerId)) return state;

      // Mesmas regras nos dois jogos que votam: quem apresenta não se avalia,
      // e ninguém vota duas vezes.
      if (state.settings.gameId === "improv-slides") {
        if (!state.slides) return state;
        if (slidesPresenter(state)?.id === action.playerId) return state;
        if (state.slides.votes[action.playerId] !== undefined) return state;
        return {
          ...state,
          slides: {
            ...state.slides,
            votes: { ...state.slides.votes, [action.playerId]: action.rating },
          },
        };
      }

      if (!state.devil) return state;
      // Quem apresenta não vota em si mesmo, e ninguém vota duas vezes.
      if (currentPresenter(state)?.id === action.playerId) return state;
      if (state.devil.votes[action.playerId] !== undefined) return state;
      if (!state.players.some((player) => player.id === action.playerId)) return state;
      if (!Number.isInteger(action.rating) || action.rating < 1 || action.rating > 5) return state;
      return {
        ...state,
        devil: {
          ...state.devil,
          votes: { ...state.devil.votes, [action.playerId]: action.rating },
        },
      };
    }

    /**
     * O grupo recusou a tese. Troca o TEMA e mantém o apresentador — quem foi
     * sorteado não é punido por uma tese que a mesa achou pesada demais.
     */
    case "REROLL_TOPIC": {
      if (!state.devil) return state;
      if (state.phase !== "TOPIC_REVEAL" && state.phase !== "PREPARATION") return state;
      const agora = Date.now();
      // O tema recusado sai do acervo ANTES de sortear de novo: é o que
      // garante que o reroll nunca devolva exatamente o mesmo tema.
      const recusado = state.devil.candidates[state.devil.winner];
      const pool = recusado
        ? markTopicRejected(state.devil.pool, recusado, agora)
        : state.devil.pool;

      const candidates = drawCandidates({ ...state, devil: { ...state.devil, pool } });
      if (candidates.length === 0) return state;
      // Em TOPIC_REVEAL o apresentador ainda não foi definido; da PREPARATION
      // em diante já foi, e a fila precisa recuar — senão o próximo
      // TOPIC_REVEAL incrementa de novo e pula a vez de alguém.
      const jaEscolheu = state.phase !== "TOPIC_REVEAL";
      return enterPhase(state, "TOPIC_SPIN", agora, {
        devil: {
          ...state.devil,
          pool,
          candidates,
          winner: pickWinner(candidates.length),
          index: jaEscolheu ? state.devil.index - 1 : state.devil.index,
        },
        round: jaEscolheu ? Math.max(0, state.round - 1) : state.round,
      });
    }

    case "ACCEPT_DISCLAIMER":
      if (!state.devil) return state;
      return { ...state, devil: { ...state.devil, disclaimerAccepted: true } };

    case "ADD_CUSTOM_TOPIC": {
      if (state.phase !== "LOBBY") return state;
      const atuais = state.devil?.customTopics ?? [];
      if (atuais.length >= MAX_CUSTOM_TOPICS) return state;
      if (!action.topic.text.trim()) return state;
      const lista = [...atuais, { ...action.topic, text: action.topic.text.trim() }];
      return { ...state, devil: withCustomTopics(state, lista) };
    }

    case "EDIT_CUSTOM_TOPIC": {
      if (state.phase !== "LOBBY" || !state.devil) return state;
      if (!action.text.trim()) return state;
      const lista = state.devil.customTopics.map((topic) =>
        topic.id === action.id
          ? { ...topic, text: action.text.trim(), aboutPlayerId: action.aboutPlayerId }
          : topic,
      );
      return { ...state, devil: withCustomTopics(state, lista) };
    }

    case "REMOVE_CUSTOM_TOPIC": {
      if (state.phase !== "LOBBY" || !state.devil) return state;
      const lista = state.devil.customTopics.filter((topic) => topic.id !== action.id);
      return { ...state, devil: withCustomTopics(state, lista) };
    }

    /**
     * Entrega de desenho. A trava contra entrega dupla vive no `recordPage`:
     * dedo batendo duas vezes no botão não pode virar duas páginas.
     */
    case "SUBMIT_DRAWING": {
      if (state.phase !== "DRAW_STEP" || !state.drawing) return state;
      return {
        ...state,
        drawing: recordPage(state.drawing, action.playerId, {
          type: "drawing",
          playerId: action.playerId,
          url: action.url,
          ...(action.strokes ? { strokes: action.strokes } : {}),
          status: action.status ?? "submitted",
        }),
      };
    }

    case "SUBMIT_GUESS": {
      if (state.phase !== "GUESS_STEP" || !state.drawing) return state;
      const texto = action.text.trim().slice(0, 60);
      if (!texto) return state;
      return {
        ...state,
        drawing: recordPage(state.drawing, action.playerId, {
          type: "guess",
          playerId: action.playerId,
          text: texto,
          status: "submitted",
        }),
      };
    }

    /**
     * Ligar o auto-play tem de rearmar a página corrente, senão o slideshow
     * ficaria parado esperando um toque que o host acabou de dispensar.
     */
    case "SET_REVEAL_AUTOPLAY": {
      if (!state.drawing) return state;
      const drawing = { ...state.drawing, revealAutoPlay: action.autoPlay };
      if (state.phase !== "REVEAL_PAGE") return { ...state, drawing };
      const now = action.now ?? Date.now();
      return enterPhase(
        state, "REVEAL_PAGE", now, { drawing },
        action.autoPlay ? DRAWING_TELEPHONE_CONFIG.revealPageMs : 0,
      );
    }

    case "COUNT_AS_MATCH": {
      if (!state.drawing) return state;
      if (state.drawing.manualMatches.includes(action.chainId)) return state;
      if (!state.drawing.chains.some((chain) => chain.id === action.chainId)) return state;
      return {
        ...state,
        drawing: {
          ...state.drawing,
          manualMatches: [...state.drawing.manualMatches, action.chainId],
        },
      };
    }

    /**
     * Imagem que não carregou sai ANTES de alguém apresentar.
     *
     * Vale até o fim da preparação. O preload começa no sorteio, mas uma rede
     * móvel lenta pode descobrir a falha alguns segundos depois. Preservamos a
     * posição de todo slide bom e ainda bloqueamos qualquer troca assim que a
     * contagem regressiva da apresentação começa.
     */
    case "REPLACE_SLIDES": {
      if (!state.slides) return state;
      if (!["PLAYER_SPIN", "PLAYER_REVEAL", "PREPARATION"].includes(state.phase)) return state;
      if (action.slideIds.length !== IMPROV_SLIDES_CONFIG.slidesPerPresentation) return state;
      return { ...state, slides: { ...state.slides, slideIds: [...action.slideIds] } };
    }

    /**
     * Emergência do host: corta o slide corrente.
     *
     * Puxa o prazo da fase para trás pelo que faltava do slide — como o slide
     * no ar é derivado do prazo, encurtar o prazo é literalmente pular o
     * slide, sem existir um "índice de slide" para sair de sincronia.
     */
    case "SKIP_SLIDE": {
      if (state.phase !== "PRESENTATION" || !state.slides) return state;
      const now = action.now ?? Date.now();
      const { remainingMs } = slideProgress(state, now);
      return { ...state, phaseDeadline: state.phaseDeadline - remainingMs };
    }

    case "ADVANCE":
      // Pausado, o relógio não corre — mas o host ainda pode pular na mão.
      return advance(
        state,
        action.forfeit ?? false,
        action.now ?? Date.now(),
        action.punishmentIndex ?? 0,
        action,
      );

    case "PAUSE": {
      if (state.pausedAt !== null || state.phaseDeadline === 0) return state;
      return { ...state, pausedAt: action.now ?? Date.now() };
    }

    // Empurra o prazo pelo tempo que ficou parado. Sem isso, despausar depois
    // de um minuto faria a fase vencer na hora.
    case "RESUME": {
      if (state.pausedAt === null) return state;
      const parado = (action.now ?? Date.now()) - state.pausedAt;
      return {
        ...state,
        pausedAt: null,
        phaseDeadline: state.phaseDeadline + Math.max(0, parado),
      };
    }

    case "RESET_TO_LOBBY":
      return {
        ...state,
        phase: "LOBBY",
        round: 0,
        quiz: null,
        drawing: null,
        slides: null,
        // Preserva as teses escritas pelo host ao voltar para o lobby.
        devil: state.devil ? withCustomTopics(state, state.devil.customTopics) : null,
        phaseDeadline: 0,
        pausedAt: null,
        players: state.players.map((player) => ({ ...player, score: 0 })),
      };

    default:
      return state;
  }
}

/** Ranking por pontuação, desempatando por quem entrou primeiro. */
export function leaderboard(state: PartyState): Player[] {
  return currentMatchPlayers(state).sort(
    (a, b) => b.score - a.score || a.joinedAt - b.joinedAt,
  );
}
