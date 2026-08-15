import { getDeck } from "../data/questions";
import { roundOutcome, sequentialOrder } from "../games/quemErraPaga";
import { DEFAULT_GAME_ID, getGame, phaseDuration } from "../games/registry";
import { DEFAULT_THEME_ID, nextThemeId } from "../theme/presets";
import {
  MAX_PLAYERS,
  NICKNAME_MAX_LENGTH,
  PLAYER_COLORS,
  type Difficulty,
  type GameId,
  type PartyPhase,
  type PartyState,
  type PartySettings,
  type Player,
  type ThemeId,
  type ThemeMode,
} from "./types";

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
  | { type: "START_GAME"; order?: number[]; now?: number }
  | { type: "ANSWER"; playerId: string; optionIndex: number }
  | { type: "ADVANCE"; forfeit?: boolean; now?: number; punishmentIndex?: number }
  /** Ninguém topou a prenda: sorteia outra sem sair da roleta. */
  | { type: "REROLL_PUNISHMENT"; punishmentIndex: number }
  | { type: "PAUSE"; now?: number }
  | { type: "RESUME"; now?: number }
  | { type: "RESET_TO_LOBBY" };

/**
 * Transições legais. Fora daqui, o reducer devolve o estado atual.
 * Nada aqui lança: durante uma festa, um estado inesperado tem de virar
 * "nada acontece", nunca uma tela branca.
 */
const TRANSITIONS: Record<PartyPhase, readonly PartyPhase[]> = {
  LOBBY: ["GAME_INTRO"],
  GAME_INTRO: ["ROUND_ACTIVE"],
  ROUND_ACTIVE: ["REVEAL_ANSWER"],
  REVEAL_ANSWER: ["FORFEIT_WHEEL", "LEADERBOARD"],
  FORFEIT_WHEEL: ["LEADERBOARD"],
  LEADERBOARD: ["ROUND_ACTIVE", "GAME_OVER"],
  GAME_OVER: [],
};

export function canTransition(from: PartyPhase, to: PartyPhase): boolean {
  return TRANSITIONS[from].includes(to);
}

export function canStart(state: PartyState): boolean {
  const game = getGame(state.settings.gameId);
  return state.phase === "LOBBY" && state.players.length >= game.minPlayers;
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

function joinPlayer(state: PartyState, player: Player): PartyState {
  // Reconexão: o mesmo id reentrando atualiza em vez de duplicar.
  const existing = state.players.findIndex((item) => item.id === player.id);
  if (existing >= 0) {
    const players = [...state.players];
    players[existing] = { ...players[existing], ...player, score: players[existing].score };
    return ensureHost({ ...state, players });
  }

  if (state.phase !== "LOBBY") return state;
  if (state.players.length >= roomCapacity(state.settings.gameId)) return state;

  const nickname = sanitizeNickname(player.nickname);
  if (!nickname || isNicknameTaken(state.players, nickname)) return state;

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
): PartyState {
  const duration = phaseDuration(state.settings.gameId, phase);
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

function advance(
  state: PartyState,
  forfeit: boolean,
  now: number,
  punishmentIndex: number,
): PartyState {
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
      const game = getGame(state.settings.gameId);
      const deck = getDeck(state.settings.difficulty);
      return enterPhase(state, "GAME_INTRO", action.now ?? Date.now(), {
        round: 0,
        quiz: {
          order: action.order ?? sequentialOrder(deck.length, game.rounds),
          answers: {},
          punishmentIndex: null,
        },
      });
    }

    case "ANSWER": {
      if (state.phase !== "ROUND_ACTIVE" || !state.quiz) return state;
      if (!state.players.some((player) => player.id === action.playerId)) return state;
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

    case "ADVANCE":
      // Pausado, o relógio não corre — mas o host ainda pode pular na mão.
      return advance(
        state,
        action.forfeit ?? false,
        action.now ?? Date.now(),
        action.punishmentIndex ?? 0,
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
  return [...state.players].sort(
    (a, b) => b.score - a.score || a.joinedAt - b.joinedAt,
  );
}
