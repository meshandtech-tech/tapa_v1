/**
 * Da foto do servidor para o `PartyState` que as telas já conhecem.
 *
 * Existe para que a migração NÃO tocasse na UX: `TelefoneSemFioPlayer`,
 * `AdvogadoDoDiaboHost` e todo o resto continuam recebendo exatamente a mesma
 * forma de estado de antes. O que mudou foi de onde ela vem — de um
 * `useReducer` no celular do host para uma linha de Postgres.
 */
import { getSupabase } from "../../lib/supabase";
import { DRAWINGS_BUCKET } from "../../lib/storage";
import { chainIndexFor, stepType } from "../../games/drawing/routing";
import { createPartyState } from "../partyReducer";
import type {
  CustomTopic,
  DrawingAssignment,
  DrawingChain,
  DrawingPage,
  DrawingState,
  MatchTopic,
  PartyState,
  Player,
} from "../types";
import type {
  RoomSnapshot,
  SnapshotAssignment,
  SnapshotChain,
  SnapshotPage,
  SnapshotTopic,
} from "./snapshot";

/** Caminho no bucket vira URL pública. `null` quando não há imagem. */
export function publicUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const supabase = getSupabase();
  if (!supabase) return null;
  return supabase.storage.from(DRAWINGS_BUCKET).getPublicUrl(path).data.publicUrl ?? null;
}

/**
 * Os traços voltam do banco como jsonb e o replay espera texto.
 *
 * A conversão vive aqui, num lugar só, para o formato serializado continuar
 * sendo detalhe de `strokes.ts` e não vazar para as telas.
 */
function strokesToString(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

function toPage(page: SnapshotPage): DrawingPage {
  if (page.kind === "drawing") {
    const strokes = strokesToString(page.strokes);
    return {
      type: "drawing",
      playerId: page.playerId,
      url: publicUrl(page.storagePath),
      ...(strokes ? { strokes } : {}),
      status: page.status,
    };
  }
  return {
    type: "guess",
    playerId: page.playerId,
    text: page.text,
    status: page.status,
  };
}

function toChain(chain: SnapshotChain): DrawingChain {
  const pages: DrawingPage[] = [];
  // O índice na lista é o PASSO em que a página foi feita — buraco no meio
  // (alguém que não entregou e ainda não foi preenchido) tem de continuar
  // sendo um buraco, não empurrar as páginas seguintes para trás.
  for (const page of chain.pages) pages[page.stepIndex] = toPage(page);

  return {
    id: chain.id,
    ownerPlayerId: chain.ownerPlayerId,
    promptId: "",
    originalPrompt: chain.originalPrompt,
    acceptedAnswers: chain.acceptedAnswers ?? [],
    pages,
  };
}

/**
 * A tarefa do passo, vinda pronta do servidor.
 *
 * ESTA função é a correção do travamento de 10 jogadores. `room_snapshot`
 * devolve `chains: []` fora da revelação — de propósito: o caderno alheio é o
 * segredo do jogo. A projeção montava `drawing.chains` só a partir dele, e
 * `assignmentFor` procurava o caderno nessa lista vazia e devolvia `null`.
 * Com `null`, `TelefoneSemFioPlayer` renderiza a tela de espera — então os dez
 * celulares mostravam "Desenho enviado / 0 / 10 prontos" sem ninguém ter
 * desenhado, ninguém conseguia entregar, e o passo só fechava por prazo com
 * dez páginas em branco. O dado sempre esteve na foto, em `assignment`; nada
 * no cliente o lia.
 *
 * Repare que este é um caderno de UMA página: a que esta pessoa pode ver. O
 * resto do caderno continua sem sair do servidor.
 */
function toAssignment(
  bruto: SnapshotAssignment,
  playerId: string,
  seatOrder: readonly string[],
): DrawingAssignment {
  const passo = bruto.stepIndex;
  const assento = seatOrder.indexOf(playerId);
  const total = seatOrder.length;

  const pages: DrawingPage[] = [];
  let previous: DrawingAssignment["previous"] = null;

  if (passo === 0) {
    // Passo 0: a pessoa desenha o próprio tema secreto.
    previous = { kind: "prompt", text: bruto.prompt ?? "" };
  } else if (bruto.previous) {
    const pagina = toPage({
      stepIndex: passo - 1,
      kind: bruto.previous.kind,
      // Quem fez a página anterior não é dito de propósito: saber de quem veio
      // é meia resposta. O servidor também não manda.
      playerId: "",
      storagePath: bruto.previous.storagePath,
      strokes: bruto.previous.strokes,
      text: bruto.previous.text,
      status: bruto.previous.status,
    });
    pages[passo - 1] = pagina;
    previous =
      pagina.type === "drawing"
        ? { kind: "drawing", page: pagina }
        : { kind: "guess", text: pagina.text };
  }
  // `previous` continua `null` quando o vizinho entregou folha em branco.
  // É estado VÁLIDO: a tela de palpite pede um chute assim mesmo. Tratar isto
  // como erro travaria a corrente exatamente onde ela deve seguir.

  return {
    playerId,
    chainIndex: assento >= 0 && total > 0 ? chainIndexFor(assento, passo, total) : 0,
    chain: {
      id: bruto.chainId,
      // O dono e o tema original do caderno SÓ aparecem na revelação — vê-los
      // agora entregaria a piada inteira.
      ownerPlayerId: "",
      promptId: "",
      originalPrompt: passo === 0 ? (bruto.prompt ?? "") : "",
      acceptedAnswers: [],
      pages,
    },
    stepIndex: passo,
    stepType: stepType(passo),
    previous,
  };
}

function toTopic(topic: SnapshotTopic): MatchTopic {
  return {
    id: topic.id,
    source: topic.source,
    text: topic.text,
    position: topic.position,
    usedAt: topic.usedAt,
    rejectedAt: topic.rejectedAt,
    presenterId: topic.presenterId,
  };
}

function toPlayer(p: RoomSnapshot["players"][number]): Player {
  return {
    id: p.id,
    nickname: p.nickname,
    color: p.color,
    avatarSeed: p.avatarSeed,
    score: p.score,
    joinedAt: Date.parse(p.joinedAt) || 0,
  };
}

/**
 * Monta o `PartyState` a partir da foto.
 *
 * Repare que nada aqui é decidido: fase, prazo e progresso vêm prontos do
 * banco. Esta função só troca a forma — se ela começar a calcular regra, a
 * autoridade voltou a se espalhar pelos clientes, que era o defeito original.
 */
export function projectSnapshot(snapshot: RoomSnapshot): PartyState {
  const { room, match } = snapshot;
  const base = createPartyState(room.pin, Date.parse(room.closedAt ?? "") || Date.now());

  const raw = (room.settings ?? {}) as Record<string, unknown>;
  // Votos, notas e respostas vêm PRONTOS do servidor, já com o segredo
  // aplicado. Antes eram `{}` fixo aqui, e por isso o host via "faltam 7
  // votos" para sempre e a revelação do quiz dizia que ninguém acertou.
  const votes = snapshot.votes ?? {};
  const scores = snapshot.scores ?? {};
  const answers = snapshot.answers ?? {};
  const settings = raw as Partial<PartyState["settings"]>;
  // As teses do host moram em `rooms.settings` (jsonb): são configuração da
  // sala, escritas no lobby, e não estado da partida.
  const customTopics = Array.isArray(raw.customTopics)
    ? (raw.customTopics as PartyState["devil"] extends null ? never : CustomTopic[])
    : [];
  const players = snapshot.players.map(toPlayer);

  const chains = snapshot.chains.map(toChain);
  const topics = snapshot.topics.map(toTopic);

  // As fatias da roleta, na MESMA ordem que o servidor sorteou. Casa
  // `source:id` de volta com o tema — é o que garante que a fatia que venceu
  // visualmente e o tema exibido sejam sempre o mesmo item.
  const candidates: MatchTopic[] = (match?.topicCandidates ?? [])
    .map((chave) => topics.find((t) => `${t.source}:${t.id}` === chave))
    .filter((t): t is MatchTopic => !!t);

  const drawing: DrawingState | null =
    match && room.gameId === "drawing-telephone"
      ? {
          matchId: match.id,
          seatOrder: match.seatOrder,
          stepIndex: match.stepIndex,
          stepCount: match.stepCount,
          chains,
          usedPromptIds: [],
          submitted: match.submittedPlayerIds,
          /**
           * Sempre definido no caminho da nuvem — `null` inclusive.
           *
           * `undefined` significaria "não há autoridade, derive dos cadernos",
           * e derivar aqui é impossível: os cadernos não vêm. `null` é a
           * autoridade dizendo "esta pessoa não tem tarefa agora" — a TV, ou
           * quem entrou depois de a partida começar.
           */
          assignment:
            snapshot.assignment && snapshot.me.playerId
              ? toAssignment(snapshot.assignment, snapshot.me.playerId, match.seatOrder)
              : null,
          revealChainIndex: match.revealChainIndex,
          revealPageIndex: match.revealPageIndex,
          revealAutoPlay: match.revealAutoplay,
          manualMatches: snapshot.chains
            .filter((c) => c.countedAsMatch)
            .map((c) => c.id),
        }
      : null;

  return {
    ...base,
    pin: room.pin,
    phase: room.phase,
    players,
    settings: {
      ...base.settings,
      ...settings,
      gameId: room.gameId,
    },
    round: room.round,
    hostPlayerId: room.hostPlayerId,
    // `0` = fase sem prazo, esperando decisão humana. Mesma convenção de antes.
    phaseDeadline: room.phaseEndsAt ? Date.parse(room.phaseEndsAt) : 0,
    pausedAt: room.pausedAt ? Date.parse(room.pausedAt) : null,
    drawing,
    devil:
      match && room.gameId === "advogado-do-diabo"
        ? {
            order: match.seatOrder,
            index: match.presenterIndex,
            pool: topics,
            candidates,
            winner: match.topicWinner,
            customTopics,
            votes,
            scores,
            // Vem da sala, não fixo: com `true` fixo o aviso do Advogado do
            // Diabo nunca aparecia.
            disclaimerAccepted: raw.disclaimerAccepted === true,
          }
        : null,
    slides:
      match && room.gameId === "improv-slides"
        ? {
            order: match.seatOrder,
            index: match.presenterIndex,
            slideIds: match.slideIds,
            usedSlideIds: match.usedSlideIds ?? [],
            votes,
            scores,
            instructionsSeen: raw.instructionsSeen === true,
          }
        : null,
    quiz:
      match && room.gameId === "quem-erra-paga"
        ? {
            participantIds: match.seatOrder,
            order: match.questionOrder,
            answers,
            punishmentIndex: match.punishmentIndex,
          }
        : null,
  };
}
