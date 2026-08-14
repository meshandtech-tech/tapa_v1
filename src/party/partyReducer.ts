import { DEFAULT_GAME_ID, getGame } from "../games/registry";
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
      difficulty: "medio",
      themeId: DEFAULT_THEME_ID,
      themeMode: "manual",
      maxPlayers: getGame(DEFAULT_GAME_ID).maxPlayers,
      ...settings,
    },
    round: 0,
    createdAt: now,
  };
}

/**
 * Lotação válida para um jogo: nunca abaixo do mínimo que ele exige, nunca
 * acima do que ele suporta. Trocar de jogo passa por aqui — sem isso, sair de
 * um jogo de até 10 para um de até 8 deixaria a sala com um teto impossível.
 */
export function clampCapacity(gameId: GameId, desired: number): number {
  const game = getGame(gameId);
  if (!Number.isFinite(desired)) return game.maxPlayers;
  return Math.min(game.maxPlayers, Math.max(game.minPlayers, Math.round(desired)));
}

export type PartyAction =
  | { type: "HYDRATE"; state: PartyState }
  | { type: "PLAYER_JOIN"; player: Player }
  | { type: "PLAYER_LEAVE"; playerId: string }
  | { type: "PLAYER_UPDATE"; playerId: string; patch: Partial<Omit<Player, "id">> }
  | { type: "SET_GAME"; gameId: GameId }
  | { type: "SET_DIFFICULTY"; difficulty: Difficulty }
  | { type: "SET_THEME"; themeId?: ThemeId; themeMode?: ThemeMode }
  | { type: "SET_MAX_PLAYERS"; maxPlayers: number }
  | { type: "SCORE"; playerId: string; delta: number }
  | { type: "START_GAME" }
  | { type: "ADVANCE"; forfeit?: boolean }
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

function joinPlayer(state: PartyState, player: Player): PartyState {
  // Reconexão: o mesmo id reentrando atualiza em vez de duplicar.
  const existing = state.players.findIndex((item) => item.id === player.id);
  if (existing >= 0) {
    const players = [...state.players];
    players[existing] = { ...players[existing], ...player, score: players[existing].score };
    return { ...state, players };
  }

  if (state.phase !== "LOBBY") return state;
  // O teto é o do host, nunca acima do limite absoluto da plataforma.
  if (state.players.length >= Math.min(state.settings.maxPlayers, MAX_PLAYERS)) {
    return state;
  }

  const nickname = sanitizeNickname(player.nickname);
  if (!nickname || isNicknameTaken(state.players, nickname)) return state;

  return {
    ...state,
    players: [...state.players, { ...player, nickname, score: 0 }],
  };
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

function advance(state: PartyState, forfeit: boolean): PartyState {
  const game = getGame(state.settings.gameId);

  switch (state.phase) {
    case "GAME_INTRO":
      return {
        ...state,
        phase: "ROUND_ACTIVE",
        round: 1,
        settings: rotateTheme(state.settings),
      };
    case "ROUND_ACTIVE":
      return { ...state, phase: "REVEAL_ANSWER" };
    case "REVEAL_ANSWER":
      return {
        ...state,
        phase: game.hasForfeit && forfeit ? "FORFEIT_WHEEL" : "LEADERBOARD",
      };
    case "FORFEIT_WHEEL":
      return { ...state, phase: "LEADERBOARD" };
    case "LEADERBOARD":
      return state.round >= game.rounds
        ? { ...state, phase: "GAME_OVER" }
        : {
            ...state,
            phase: "ROUND_ACTIVE",
            round: state.round + 1,
            settings: rotateTheme(state.settings),
          };
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
      return {
        ...state,
        players: state.players.filter((player) => player.id !== action.playerId),
      };

    case "PLAYER_UPDATE":
      return updatePlayer(state, action.playerId, action.patch);

    case "SET_GAME": {
      if (state.phase !== "LOBBY") return state;
      return {
        ...state,
        settings: {
          ...state.settings,
          gameId: action.gameId,
          // O teto atual pode não caber no jogo novo.
          maxPlayers: clampCapacity(action.gameId, state.settings.maxPlayers),
        },
      };
    }

    case "SET_MAX_PLAYERS": {
      if (state.phase !== "LOBBY") return state;
      const maxPlayers = clampCapacity(state.settings.gameId, action.maxPlayers);
      // Não dá para encolher a sala abaixo de quem já entrou.
      if (maxPlayers < state.players.length) return state;
      return { ...state, settings: { ...state.settings, maxPlayers } };
    }

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

    case "START_GAME":
      return canStart(state) ? { ...state, phase: "GAME_INTRO", round: 0 } : state;

    case "ADVANCE":
      return advance(state, action.forfeit ?? false);

    case "RESET_TO_LOBBY":
      return {
        ...state,
        phase: "LOBBY",
        round: 0,
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
