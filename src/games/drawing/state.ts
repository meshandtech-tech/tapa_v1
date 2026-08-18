import type { DrawingPrompt } from "../../data/drawingPrompts";
import { answersMatch } from "./matching";
import { chainIndexFor, contributionStepCount, stepType, type StepType } from "./routing";
import type {
  DrawingChain,
  DrawingPage,
  DrawingPageDraw,
  DrawingState,
  PartyState,
  Player,
} from "../../party/types";

/**
 * Funções puras do Telefone Sem Fio de Desenho.
 *
 * Nenhuma sorteia nada: quem sorteia é a autoridade, e o resultado entra como
 * argumento. É o que mantém o reducer testável e garante que dois aparelhos
 * nunca discordem sobre qual tema saiu para qual caderno.
 */

/**
 * Páginas de um caderno na revelação: o tema, uma por contribuição, e o
 * confronto final entre o que era e o que virou.
 */
export function pagesPerChain(stepCount: number): number {
  return stepCount + 2;
}

/** Índice da página de confronto — a última, onde a sala ri. */
export function comparisonPageIndex(stepCount: number): number {
  return pagesPerChain(stepCount) - 1;
}

export function createDrawingState(
  players: readonly Player[],
  seatOrder: readonly string[],
  prompts: readonly DrawingPrompt[],
  chainIds: readonly string[],
  matchId: string,
): DrawingState {
  const stepCount = contributionStepCount(players.length);
  const chains: DrawingChain[] = seatOrder.map((playerId, indice) => ({
    id: chainIds[indice] ?? `${matchId}-${indice}`,
    ownerPlayerId: playerId,
    promptId: prompts[indice]?.id ?? "",
    originalPrompt: prompts[indice]?.text ?? "",
    acceptedAnswers: [...(prompts[indice]?.acceptedAnswers ?? [])],
    pages: [],
  }));

  return {
    matchId,
    seatOrder: [...seatOrder],
    stepIndex: 0,
    stepCount,
    chains,
    usedPromptIds: prompts.map((prompt) => prompt.id),
    submitted: [],
    revealChainIndex: 0,
    revealPageIndex: 0,
    revealAutoPlay: false,
    manualMatches: [],
  };
}

export interface DrawingAssignment {
  chainIndex: number;
  chain: DrawingChain;
  stepIndex: number;
  stepType: StepType;
  /**
   * A ÚNICA coisa que esta pessoa pode ver. Nunca o caderno inteiro: a graça
   * do jogo é justamente não saber de onde aquilo veio.
   */
  previous:
    | { kind: "prompt"; text: string }
    | { kind: "drawing"; page: DrawingPageDraw }
    | { kind: "guess"; text: string }
    | null;
}

/**
 * O que este jogador tem de fazer agora.
 *
 * Derivado do estado, nunca pedido pelo cliente — ninguém escolhe "quero o
 * caderno 4". Fora de uma fase de contribuição devolve `null`.
 */
export function assignmentFor(state: PartyState, playerId: string): DrawingAssignment | null {
  const drawing = state.drawing;
  if (!drawing) return null;
  if (state.phase !== "DRAW_STEP" && state.phase !== "GUESS_STEP") return null;

  const seatIndex = drawing.seatOrder.indexOf(playerId);
  if (seatIndex < 0) return null;

  const total = drawing.seatOrder.length;
  const chainIndex = chainIndexFor(seatIndex, drawing.stepIndex, total);
  const chain = drawing.chains[chainIndex];
  if (!chain) return null;

  return {
    chainIndex,
    chain,
    stepIndex: drawing.stepIndex,
    stepType: stepType(drawing.stepIndex),
    previous: previousContent(chain, drawing.stepIndex),
  };
}

/** O que a página anterior deixou para esta pessoa interpretar. */
function previousContent(chain: DrawingChain, stepIndex: number): DrawingAssignment["previous"] {
  // Passo 0: o dono desenha o próprio tema secreto.
  if (stepIndex === 0) return { kind: "prompt", text: chain.originalPrompt };

  const anterior = chain.pages[stepIndex - 1];
  if (!anterior) return null;
  if (anterior.type === "drawing") return { kind: "drawing", page: anterior };
  return { kind: "guess", text: anterior.text };
}

/** Já dá para seguir sem esperar o relógio? */
export function everyoneSubmitted(drawing: DrawingState): boolean {
  return drawing.seatOrder.every((playerId) => drawing.submitted.includes(playerId));
}

/** Quantos entregaram, para o "6 / 8 PRONTOS" da tela de espera. */
export function submissionProgress(drawing: DrawingState): { done: number; total: number } {
  return { done: drawing.submitted.length, total: drawing.seatOrder.length };
}

/** O último palpite do caderno — a frase que sobreviveu ao passa-a-passa. */
export function finalGuess(chain: DrawingChain): string | null {
  for (let i = chain.pages.length - 1; i >= 0; i -= 1) {
    const page = chain.pages[i];
    if (page.type === "guess") return page.text;
  }
  return null;
}

/**
 * O tema sobreviveu à corrente?
 *
 * `manualMatches` é a palavra final do host: a comparação automática resolve
 * acento e pontuação, mas nunca vai casar "carro" com "automóvel", e brigar
 * com a mesa sobre isso seria pior que um botão.
 */
export function chainSurvived(chain: DrawingChain, manualMatches: readonly string[]): boolean {
  if (manualMatches.includes(chain.id)) return true;
  const ultimo = finalGuess(chain);
  if (!ultimo) return false;
  return answersMatch(ultimo, chain.originalPrompt, chain.acceptedAnswers);
}

/**
 * Um ponto para o dono do caderno cuja palavra chegou inteira do outro lado.
 *
 * Calculado dos cadernos toda vez, em vez de somado ao longo da revelação:
 * assim rever uma página não pontua duas vezes.
 */
export function drawingScores(drawing: DrawingState): Record<string, number> {
  const pontos: Record<string, number> = {};
  for (const playerId of drawing.seatOrder) pontos[playerId] = 0;
  for (const chain of drawing.chains) {
    if (chainSurvived(chain, drawing.manualMatches)) {
      pontos[chain.ownerPlayerId] = (pontos[chain.ownerPlayerId] ?? 0) + 1;
    }
  }
  return pontos;
}

/**
 * Preenche quem não entregou, para a corrente não parar num aparelho que
 * travou. Um desenho em branco no meio do caderno é parte do caos.
 */
export function fillMissingPages(drawing: DrawingState): DrawingState {
  const tipo = stepType(drawing.stepIndex);
  const total = drawing.seatOrder.length;
  const chains = drawing.chains.map((chain) => ({ ...chain, pages: [...chain.pages] }));

  drawing.seatOrder.forEach((playerId, seatIndex) => {
    const chainIndex = chainIndexFor(seatIndex, drawing.stepIndex, total);
    const chain = chains[chainIndex];
    // Já tem página deste passo: esta pessoa entregou.
    if (!chain || chain.pages.length > drawing.stepIndex) return;
    chain.pages[drawing.stepIndex] =
      tipo === "draw"
        ? { type: "drawing", playerId, url: null, status: "timeout" }
        : { type: "guess", playerId, text: "", status: "timeout" };
  });

  return { ...drawing, chains, submitted: [...drawing.seatOrder] };
}

/** Guarda uma contribuição. Devolve o estado intacto se não puder aceitar. */
export function recordPage(
  drawing: DrawingState,
  playerId: string,
  page: DrawingPage,
): DrawingState {
  // Entrega dupla (dedo batendo duas vezes) não pode virar duas páginas.
  if (drawing.submitted.includes(playerId)) return drawing;

  const seatIndex = drawing.seatOrder.indexOf(playerId);
  if (seatIndex < 0) return drawing;

  const chainIndex = chainIndexFor(seatIndex, drawing.stepIndex, drawing.seatOrder.length);
  const chain = drawing.chains[chainIndex];
  if (!chain || chain.pages.length > drawing.stepIndex) return drawing;

  const chains = [...drawing.chains];
  const pages = [...chain.pages];
  pages[drawing.stepIndex] = page;
  chains[chainIndex] = { ...chain, pages };

  return { ...drawing, chains, submitted: [...drawing.submitted, playerId] };
}
