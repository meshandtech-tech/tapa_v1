import { isGameId } from "../games/registry";
import { isThemeId } from "../theme/presets";
import { isValidPin } from "./pin";
import {
  DIFFICULTIES,
  type PartyPhase,
  type PartyState,
  type Player,
  type DevilState,
  type DrawingState,
  type QuizState,
  type SlidesState,
} from "./types";

/**
 * Toda fase válida. Precisa acompanhar `PartyPhase`: uma fase esquecida aqui
 * faz o estado ser rejeitado ao recarregar, e um F5 no meio do jogo derruba a
 * sala inteira sem nenhum erro visível. Foi exatamente o que aconteceu quando
 * as fases do Advogado do Diabo entraram e esta lista ficou para trás.
 */
const PHASES: readonly PartyPhase[] = [
  "LOBBY",
  "GAME_INTRO",
  "LEADERBOARD",
  "GAME_OVER",
  "ROUND_ACTIVE",
  "REVEAL_ANSWER",
  "FORFEIT_WHEEL",
  "TOPIC_SPIN",
  "TOPIC_REVEAL",
  "PLAYER_SPIN",
  "PLAYER_REVEAL",
  "PREPARATION",
  "COUNTDOWN",
  "PRESENTATION",
  "VOTING",
  "SCORE_REVEAL",
  "DRAW_STEP",
  "GUESS_STEP",
  "PASSING",
  "REVEAL_INTRO",
  "REVEAL_PAGE",
];

const stateKey = (pin: string) => `tapa:party:${pin}:state`;
const playerKey = (pin: string) => `tapa:party:${pin}:me`;
const ownerKey = (pin: string) => `tapa:party:${pin}:owner`;

/**
 * Marca ESTE aparelho como dono da sala — quem criou é quem comanda.
 *
 * Uma tentativa anterior de token falhou porque a sala nascia no computador e
 * as pessoas entravam pelo celular, aparelhos diferentes com storages
 * diferentes. Aqui a causa some: criar e entrar acontecem no MESMO aparelho,
 * porque criar já leva direto para a tela de jogador.
 */
export function markRoomOwner(pin: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(ownerKey(pin), "1");
  } catch {
    // Sem o token o aparelho vira jogador comum e outro assume. Chato, não fatal.
  }
}

export function ownsRoom(pin: string): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(ownerKey(pin)) === "1";
}

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
    (quiz.participantIds === undefined || (
      Array.isArray(quiz.participantIds) &&
      quiz.participantIds.every((id) => typeof id === "string")
    )) &&
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
  // Um tema é válido quando carrega a identidade inteira: sem `source`, uma
  // tese do host e uma do sistema voltariam do localStorage indistinguíveis.
  const temas = (list: unknown) =>
    Array.isArray(list) &&
    list.every(
      (item) =>
        !!item &&
        typeof item === "object" &&
        typeof (item as { id?: unknown }).id === "string" &&
        ((item as { source?: unknown }).source === "custom" ||
          (item as { source?: unknown }).source === "default") &&
        typeof (item as { text?: unknown }).text === "string",
    );

  return (
    strings(devil.order) &&
    temas(devil.pool) &&
    temas(devil.candidates) &&
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

/** `null` é válido: só existe depois que o jogo de desenho começa. */
function isDrawingState(value: unknown): value is DrawingState | null {
  if (value === null || value === undefined) return true;
  if (typeof value !== "object") return false;
  const drawing = value as Partial<DrawingState>;
  const strings = (list: unknown) =>
    Array.isArray(list) && list.every((item) => typeof item === "string");

  const paginaValida = (page: unknown) => {
    if (!page || typeof page !== "object") return false;
    const item = page as { type?: string; playerId?: string; url?: unknown; text?: unknown };
    if (typeof item.playerId !== "string") return false;
    if (item.type === "drawing") return item.url === null || typeof item.url === "string";
    if (item.type === "guess") return typeof item.text === "string";
    return false;
  };

  return (
    typeof drawing.matchId === "string" &&
    strings(drawing.seatOrder) &&
    strings(drawing.usedPromptIds) &&
    strings(drawing.submitted) &&
    strings(drawing.manualMatches) &&
    Number.isInteger(drawing.stepIndex) &&
    Number.isInteger(drawing.stepCount) &&
    Number.isInteger(drawing.revealChainIndex) &&
    Number.isInteger(drawing.revealPageIndex) &&
    typeof drawing.revealAutoPlay === "boolean" &&
    Array.isArray(drawing.chains) &&
    drawing.chains.every(
      (chain) =>
        !!chain &&
        typeof chain.id === "string" &&
        typeof chain.ownerPlayerId === "string" &&
        typeof chain.originalPrompt === "string" &&
        Array.isArray(chain.pages) &&
        chain.pages.every(paginaValida),
    )
  );
}

/** `null` é válido: só existe depois que o Pitch no Escuro começa. */
function isSlidesState(value: unknown): value is SlidesState | null {
  if (value === null || value === undefined) return true;
  if (typeof value !== "object") return false;
  const slides = value as Partial<SlidesState>;
  const strings = (list: unknown) =>
    Array.isArray(list) && list.every((item) => typeof item === "string");
  return (
    strings(slides.order) &&
    strings(slides.slideIds) &&
    strings(slides.usedSlideIds) &&
    Number.isInteger(slides.index) &&
    typeof slides.instructionsSeen === "boolean" &&
    !!slides.votes && typeof slides.votes === "object" &&
    Object.values(slides.votes).every((nota) => Number.isInteger(nota)) &&
    !!slides.scores && typeof slides.scores === "object" &&
    Object.values(slides.scores).every((nota) => Number.isFinite(nota))
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
      !isDrawingState(candidate.drawing) ||
      !isSlidesState(candidate.slides) ||
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
  localStorage.removeItem(ownerKey(pin));
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
