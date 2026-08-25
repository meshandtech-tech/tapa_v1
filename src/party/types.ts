import type { GameId } from "../games/registry";
import type { ThemeMode } from "../theme/context";
import type { ThemeId } from "../theme/presets";

export type { GameId, ThemeId, ThemeMode };

export type Difficulty = "easy" | "medium" | "hard";

export const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard"];

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: "Fácil",
  medium: "Médio",
  hard: "Difícil",
};

/**
 * Ciclo de vida de uma party. A ordem aqui é a ordem real do jogo.
 */
/**
 * Fases da party. `LOBBY`, `GAME_INTRO`, `LEADERBOARD` e `GAME_OVER` são
 * comuns a todos os jogos; as demais pertencem a um jogo específico e o
 * registry declara quais transições cada um permite.
 */
export type PartyPhase =
  // Comuns
  | "LOBBY"
  | "GAME_INTRO"
  | "LEADERBOARD"
  | "GAME_OVER"
  // Quem Erra, Paga
  | "ROUND_ACTIVE"
  | "REVEAL_ANSWER"
  | "FORFEIT_WHEEL"
  // Advogado do Diabo
  | "TOPIC_SPIN"
  | "TOPIC_REVEAL"
  | "PLAYER_SPIN"
  | "PLAYER_REVEAL"
  | "PREPARATION"
  | "COUNTDOWN"
  | "PRESENTATION"
  | "VOTING"
  | "SCORE_REVEAL"
  // Telefone Sem Fio de Desenho
  | "DRAW_STEP"
  | "GUESS_STEP"
  /** "Passando os cadernos..." — respiro curto entre um passo e o seguinte. */
  | "PASSING"
  | "REVEAL_INTRO"
  | "REVEAL_PAGE";

/**
 * Cores de identidade dos jogadores — marcadores de fanzine.
 * Sempre usadas com borda preta grossa, então funcionam sobre qualquer tema.
 */
export const PLAYER_COLORS: readonly string[] = [
  "#ff5c8a",
  "#ffb703",
  "#3ddc97",
  "#4cc9f0",
  "#b892ff",
  "#ff8c42",
  "#06d6a0",
  "#ef476f",
  "#8ecae6",
  "#c9ff4c",
];

/** Teto absoluto da plataforma. Nenhum jogo nem host passa disto. */
export const MAX_PLAYERS = 10;
export const NICKNAME_MAX_LENGTH = 14;

export interface Player {
  id: string;
  nickname: string;
  color: string;
  /** Semente do avatar Open Peeps. Determinística: mesmo seed, mesmo rosto. */
  avatarSeed: string;
  score: number;
  joinedAt: number;
}

export interface PartySettings {
  gameId: GameId;
  difficulty: Difficulty;
  /**
   * Tema da party. Vive no estado — e não no localStorage de cada aparelho —
   * porque a TV e os celulares têm de mostrar a MESMA cor. O host é a
   * autoridade; o `STATE` broadcast leva a cor para todo mundo.
   */
  themeId: ThemeId;
  /** `auto` gira o preset a cada entrada em ROUND_ACTIVE. */
  themeMode: ThemeMode;
}

/**
 * Estado do "Quem Erra, Paga". Todo mundo responde a MESMA pergunta ao mesmo
 * tempo — não há rodízio de turno.
 *
 * O prazo da rodada NÃO mora aqui: virou `phaseDeadline` no estado da party,
 * porque toda fase passou a ter prazo próprio (auto-host).
 */
export interface QuizState {
  /** Ordem sorteada das perguntas desta partida (índices no deck). */
  order: number[];
  /** Resposta da rodada corrente: id do jogador → índice da alternativa. */
  answers: Record<string, number>;
  /** Prenda sorteada para quem errou. Definida ao entrar em FORFEIT_WHEEL. */
  punishmentIndex: number | null;
}

/** Tese escrita pelo host, opcionalmente dedicada a alguém da sala. */
export interface CustomTopic {
  id: string;
  text: string;
  /** Id do jogador a quem o tema se refere. Opcional. */
  aboutPlayerId?: string;
}

export const MAX_CUSTOM_TOPICS = 10;

/**
 * Um tema dentro do acervo de UMA partida.
 *
 * `id` sozinho não identifica: uma tese escrita pelo host e uma do sistema são
 * itens DISTINTOS mesmo que o texto coincida. Identidade é o par
 * (`source`, `id`) — e é ela que a roleta devolve, nunca o número da fatia.
 * Era exatamente essa confusão que fazia a mesa ver "caiu no mesmo número" e
 * receber outro tema.
 */
export interface MatchTopic {
  id: string;
  source: "custom" | "default";
  text: string;
  /** Ordem sorteada no início da partida. É ela que decide quem sai primeiro. */
  position: number;
  /** Já saiu na roleta. Não volta nesta partida. */
  usedAt: string | null;
  /** O host recusou. Também não volta. */
  rejectedAt: string | null;
  presenterId: string | null;
}

/** Tema ainda disponível: nem usado, nem recusado. */
export function isTopicAvailable(topic: MatchTopic): boolean {
  return topic.usedAt === null && topic.rejectedAt === null;
}

/** Estado do "Advogado do Diabo". */
export interface DevilState {
  /** Ordem de apresentação, sorteada no início. Cada um apresenta uma vez. */
  order: string[];
  /** Posição em `order`. -1 = ainda não começou nenhuma rodada. */
  index: number;
  /**
   * O acervo FINITO da partida, congelado no início e já embaralhado.
   *
   * Diminui — 10, 9, 8... Antes o acervo era re-sorteado a cada rodada a
   * partir de custom + sistema, e por isso um tema podia voltar e o número da
   * fatia não queria dizer nada de uma rodada para a outra.
   */
  pool: MatchTopic[];
  /** As fatias da roleta desta rodada, com identidade estável. */
  candidates: MatchTopic[];
  /** Índice do vencedor dentro de `candidates`. */
  winner: number;
  /** Teses escritas pelo host, misturadas com prioridade às do sistema. */
  customTopics: CustomTopic[];
  /** Votos da rodada corrente: id de quem votou → nota de 1 a 5. */
  votes: Record<string, number>;
  /** Nota final de cada apresentador, já calculada. */
  scores: Record<string, number>;
  /** O grupo já aceitou o aviso inicial? */
  disclaimerAccepted: boolean;
}

/** Como a contribuição chegou. `timeout` e `failed` seguem valendo página. */
export type SubmissionStatus = "submitted" | "timeout" | "failed";

export interface DrawingPageDraw {
  type: "drawing";
  playerId: string;
  /** Endereço no Storage. `null` = entregou em branco ou o envio falhou. */
  url: string | null;
  /**
   * Traços serializados. Só preenchido quando não há Storage — dev local sem
   * Supabase, ou upload que falhou de vez. É o que impede a corrente de
   * quebrar por causa de wi-fi ruim.
   */
  strokes?: string;
  status: SubmissionStatus;
}

export interface DrawingPageGuess {
  type: "guess";
  playerId: string;
  text: string;
  status: SubmissionStatus;
}

/** Uma página do caderno. O índice na lista é o passo em que foi feita. */
export type DrawingPage = DrawingPageDraw | DrawingPageGuess;

/** Um caderno. Nasce com um tema secreto e vai passando de mão em mão. */
export interface DrawingChain {
  /** Aleatório de propósito: vira o caminho no Storage, e índice seria chutável. */
  id: string;
  ownerPlayerId: string;
  promptId: string;
  originalPrompt: string;
  acceptedAnswers: string[];
  pages: DrawingPage[];
}

/**
 * Estado do Telefone Sem Fio de Desenho.
 *
 * `seatOrder` é embaralhado UMA vez e congelado até a partida acabar: quem
 * recebe qual caderno sai de `(corrente + passo) % N`, então nada precisa ser
 * guardado sobre atribuições — elas se recalculam a partir daqui. Recalcular a
 * ordem quando alguém reconecta embaralharia a partida inteira no meio.
 */
export interface DrawingState {
  matchId: string;
  seatOrder: string[];
  stepIndex: number;
  /** Total de contribuições. Par sempre, para terminar em frase escrita. */
  stepCount: number;
  chains: DrawingChain[];
  usedPromptIds: string[];
  /** Quem já entregou o passo corrente. É a trava contra entrega dupla. */
  submitted: string[];
  revealChainIndex: number;
  revealPageIndex: number;
  /** O host ligou o avanço automático do slideshow? */
  revealAutoPlay: boolean;
  /** Cadernos que o host validou na mão ("carro" e "automóvel"). */
  manualMatches: string[];
}

/**
 * Estado do "Apresentação Improvisada".
 *
 * Repare no que NÃO existe aqui: nenhum campo de slide corrente nem de quando
 * ele começou. A fase `PRESENTATION` já tem `phaseDeadline`, e o slide no ar é
 * a divisão do tempo decorrido — ver `slideProgress`. Guardar um segundo
 * relógio seria mais uma coisa para manter sincronizada entre aparelhos, e dois
 * relógios divergem.
 */
export interface SlidesState {
  /** Ordem de apresentação, sorteada no início. Cada um apresenta uma vez. */
  order: string[];
  /** Posição em `order`. -1 = ainda não começou nenhuma apresentação. */
  index: number;
  /** Os cinco slides desta apresentação, na ordem em que vão aparecer. */
  slideIds: string[];
  /** Memória curta do que já saiu, para dar variedade sem esgotar o acervo. */
  usedSlideIds: string[];
  /** Votos da rodada: id de quem votou -> nota de 1 a 5. */
  votes: Record<string, number>;
  /** Nota final de cada apresentador, já calculada. */
  scores: Record<string, number>;
  /** O grupo já leu as instruções? */
  instructionsSeen: boolean;
}

export interface PartyState {
  version: 1;
  pin: string;
  phase: PartyPhase;
  players: Player[];
  settings: PartySettings;
  /** Rodada atual, base 1. Vale 0 enquanto a party está no lobby. */
  round: number;
  createdAt: number;
  /** Preenchido em START_GAME; volta a null ao retornar ao lobby. */
  quiz: QuizState | null;
  /** Idem, para o "Advogado do Diabo". Só um dos dois vive por vez. */
  devil: DevilState | null;
  /** Idem, para o Telefone Sem Fio de Desenho. */
  drawing: DrawingState | null;
  /** Idem, para o Apresentação Improvisada. */
  slides: SlidesState | null;
  /**
   * Quem manda na sala. O host é um jogador como os outros — joga, pontua —
   * e só ganha um painel de controles no próprio celular.
   * `null` enquanto ninguém reivindicou.
   */
  hostPlayerId: string | null;
  /**
   * Instante em que a fase atual expira e o jogo segue sozinho.
   * `0` = fase sem prazo (LOBBY e GAME_OVER esperam decisão humana).
   */
  phaseDeadline: number;
  /** Instante em que o host pausou. `null` = correndo. */
  pausedAt: number | null;
}
