/**
 * A TELA, renderizada de verdade.
 *
 * Este arquivo existe por causa de uma pergunta justa: por que confiar nos
 * testes agora, se antes eles estavam todos verdes enquanto dez pessoas
 * olhavam para um celular travado?
 *
 * A resposta é o que este arquivo faz de diferente. Os testes de antes falavam
 * com o Postgres e conferiam o que o Postgres respondia — e o Postgres estava
 * certo o tempo todo: ele mandava a tarefa de cada jogador em `assignment`,
 * como sempre mandou. O defeito estava DEPOIS dele, no navegador, onde
 * `projectSnapshot` jogava esse campo fora. Nenhum teste executava uma linha
 * de código de cliente, então nenhum teste podia ver o bug.
 *
 * Aqui o componente é montado e o HTML é lido. Se a pessoa não recebe canvas,
 * este teste falha — que é exatamente o que a mesa viveu na festa.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TelefoneSemFioPlayer } from "./TelefoneSemFioPlayer";
import { projectSnapshot } from "../../party/cloud/projection";
import type { RoomSnapshot } from "../../party/cloud/snapshot";
import type { Player } from "../../party/types";

const JOGADORES = 10;
const ids = Array.from({ length: JOGADORES }, (_, i) => `p${i}`);

/** Uma foto como o `room_snapshot` devolve DE VERDADE durante o jogo. */
function fotoEmJogo(fase: "DRAW_STEP" | "GUESS_STEP", stepIndex: number, meId: string): RoomSnapshot {
  return {
    room: {
      id: "room-1", pin: "123456", gameId: "drawing-telephone", phase: fase,
      phaseEndsAt: new Date(Date.now() + 90000).toISOString(), pausedAt: null,
      round: stepIndex + 1,
      settings: { difficulty: "medium", themeId: "punch", themeMode: "manual" },
      hostPlayerId: "p0", closedAt: null,
    },
    me: { playerId: meId, submitted: false },
    players: ids.map((id, i) => ({
      id, nickname: `Jogador${i}`, color: "#ff5c8a", avatarSeed: `s${i}`,
      score: 0, joinedAt: new Date(1000 + i).toISOString(),
      lastSeenAt: new Date(2000 + i).toISOString(),
    })),
    match: {
      id: "match-1", gameId: "drawing-telephone", seatOrder: ids,
      stepIndex, stepCount: JOGADORES, submittedPlayerIds: [],
      presenterIndex: -1, revealChainIndex: 0, revealPageIndex: 0,
      revealAutoplay: false, questionOrder: [], slideIds: [], usedSlideIds: [],
      punishmentIndex: null, topicCandidates: [], topicWinner: 0,
    },
    assignment: stepIndex === 0
      ? { chainId: "c0", stepIndex: 0, prompt: "girafa de bicicleta", previous: null }
      : {
          chainId: "c3", stepIndex,
          prompt: null,
          previous: {
            kind: "drawing", text: "", storagePath: null,
            strokes: { v: 2, g: 2048, s: [[0, 28, 0, 10, 10, 900, 900]] },
            status: "submitted",
          },
        },
    votes: {}, scores: {}, answers: {}, topics: [],
    // Vazio: é assim que o servidor responde fora da revelação, de propósito.
    chains: [],
    serverTime: new Date().toISOString(),
  };
}

function montar(snap: RoomSnapshot): string {
  const state = projectSnapshot(snap);
  const me: Player = {
    id: snap.me.playerId!, nickname: "Eu", color: "#ff5c8a",
    avatarSeed: "s0", score: 0, joinedAt: 0,
  };
  return renderToStaticMarkup(
    <TelefoneSemFioPlayer
      pin="123456"
      state={state}
      me={me}
      secondsLeft={90}
      onSubmitDrawing={() => true}
      onSubmitGuess={() => true}
    />,
  );
}

describe("a tela do jogador com a foto que o servidor manda de verdade", () => {
  it("abre o canvas de desenho no passo 0, para os dez", () => {
    for (const id of ids) {
      const html = montar(fotoEmJogo("DRAW_STEP", 0, id));

      // O que a pessoa TEM de ver: a palavra secreta e as ferramentas.
      expect(html).toContain("girafa de bicicleta");
      expect(html).toContain("Enviar desenho");
      expect(html).toContain("Sua palavra secreta");

      // E o que ela NÃO pode ver. Esta linha é o playtest inteiro: eram estas
      // palavras na tela dos dez celulares, antes de alguém ter desenhado.
      expect(html).not.toContain("Esperando a galera");
      expect(html).not.toContain("Desenho enviado");
    }
  });

  it("abre o campo de palpite no passo 1, com o desenho do vizinho", () => {
    const html = montar(fotoEmJogo("GUESS_STEP", 1, "p4"));
    expect(html).toContain("O que é isso?");
    expect(html).toContain("Enviar palpite");
    expect(html).not.toContain("Esperando a galera");
  });

  it("quem entregou vê a espera — e só então", () => {
    const snap = fotoEmJogo("DRAW_STEP", 0, "p0");
    snap.match!.submittedPlayerIds = ["p0", "p1"];
    const html = montar(snap);
    expect(html).toContain("Desenho enviado");
    expect(html).toContain("Esperando a galera");
  });

  it("sem tarefa nenhuma, diz a verdade em vez de fingir espera", () => {
    const snap = fotoEmJogo("DRAW_STEP", 0, "p0");
    snap.assignment = null;
    const html = montar(snap);

    // A regra que o playtest comprou caro: "esperando a galera" é para depois
    // de entregar. Quem não recebeu tarefa vê que o caderno está a caminho —
    // e o cartão rebusca a foto sozinho, com fim.
    expect(html).toContain("Preparando seu caderno");
    expect(html).not.toContain("Esperando a galera");
  });
});
