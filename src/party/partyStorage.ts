import { isGameId } from "../games/registry";
import { isThemeId } from "../theme/presets";
import { isValidPin } from "./pin";
import {
  DIFFICULTIES,
  type PartyPhase,
  type PartyState,
  type Player,
  type DevilState,
  type QuizState,
} from "./types";

const PHASES: readonly PartyPhase[] = [
  "LOBBY",
  "GAME_INTRO",
  "ROUND_ACTIVE",
  "REVEAL_ANSWER",
  "FORFEIT_WHEEL",
  "LEADERBOARD",
  "GAME_OVER",
];

const stateKey = (pin: string) => `tapa:party:${pin}:state`;
const playerKey = (pin: string) => `tapa:party:${pin}:me`;

function isPlayer(value: unknown): value is Player {
  if (!value || typeof value !== "object") return false;
  const player = value as Partial<Player>;
  return (
    typeof player.id === "string" &&
    player.id.length > 0 &&
    typeof player.nickname === "string" &&
    typeof player.color === "string" &&
    typeof player.avatarSeed === "string" &&
    Number.isFinite(player.score) &&
    Number.isFinite(player.joinedAt)
  );
}

/** `null` é válido: a party só ganha quiz quando o jogo começa. */
function isQuizState(value: unknown): value is QuizState | null {
  if (value === null || value === undefined) return true;
  if (typeof value !== "object") return false;
  const quiz = value as Partial<QuizState>;
  return (
    Array.isArray(quiz.order) &&
    quiz.order.every((index) => Number.isInteger(index) && index >= 0) &&
    (quiz.punishmentIndex === null || Number.isInteger(quiz.punishmentIndex)) &&
    !!quiz.answers &&
    typeof quiz.answers === "object" &&
    Object.values(quiz.answers).every((option) => Number.isInteger(option))
  );
}

/** `null` é válido: só existe depois que o Advogado do Diabo começa. */
function isDevilState(value: unknown): value is DevilState | null {
  if (value === null || value === undefined) return true;
  if (typeof value !== "object") return false;
  const devil = value as Partial<DevilState>;
  const strings = (list: unknown) =>
    Array.isArray(list) && list.every((item) => typeof item === "string");
  return (
    strings(devil.order) &&
    strings(devil.usedTopics) &&
    strings(devil.candidates) &&
    Number.isInteger(devil.index) &&
    Number.isInteger(devil.winner) &&
    Array.isArray(devil.customTopics) &&
    devil.customTopics.every(
      (topic) => !!topic && typeof topic.id === "string" && typeof topic.text === "string",
    ) &&
    !!devil.votes && typeof devil.votes === "object" &&
    Object.values(devil.votes).every((nota) => Number.isInteger(nota)) &&
    !!devil.scores && typeof devil.scores === "object" &&
    Object.values(devil.scores).every((nota) => Number.isFinite(nota)) &&
    typeof devil.disclaimerAccepted === "boolean"
  );
}

/**
 * Só devolve estado se TUDO validar. Dado corrompido no localStorage vira
 * `null` e a party recomeça limpa, em vez de quebrar a tela no meio da festa.
 */
export function parsePartyState(raw: string | null): PartyState | null {
  if (!raw) return null;
  try {
    const candidate = JSON.parse(raw) as Partial<PartyState>;
    if (
      candidate.version !== 1 ||
      !isValidPin(candidate.pin) ||
      !candidate.phase ||
      !PHASES.includes(candidate.phase) ||
      !Array.isArray(candidate.players) ||
      !candidate.players.every(isPlayer) ||
      !candidate.settings ||
      !isGameId(candidate.settings.gameId) ||
      !DIFFICULTIES.includes(candidate.settings.difficulty) ||
      !isThemeId(candidate.settings.themeId) ||
      (candidate.settings.themeMode !== "manual" && candidate.settings.themeMode !== "auto") ||
      !Number.isInteger(candidate.round) ||
      candidate.round! < 0 ||
      !Number.isFinite(candidate.createdAt) ||
      !isQuizState(candidate.quiz) ||
      !isDevilState(candidate.devil) ||
      (candidate.hostPlayerId !== null && typeof candidate.hostPlayerId !== "string") ||
      !Number.isFinite(candidate.phaseDeadline) ||
      (candidate.pausedAt !== null && !Number.isFinite(candidate.pausedAt))
    ) {
      return null;
    }
    return candidate as PartyState;
  } catch {
    return null;
  }
}

export function loadPartyState(pin: string): PartyState | null {
  if (typeof localStorage === "undefined") return null;
  return parsePartyState(localStorage.getItem(stateKey(pin)));
}

export function savePartyState(state: PartyState): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(stateKey(state.pin), JSON.stringify(state));
  } catch {
    // Cota estourada não pode derrubar a party.
  }
}

export function clearPartyState(pin: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(stateKey(pin));
  localStorage.removeItem(playerKey(pin));
}

/** Identidade do jogador NESTE dispositivo — sobrevive a um F5 no celular. */
export function loadLocalPlayer(pin: string): Player | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(playerKey(pin)) ?? "null");
    return isPlayer(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveLocalPlayer(pin: string, player: Player): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(playerKey(pin), JSON.stringify(player));
  } catch {
    // idem
  }
}
