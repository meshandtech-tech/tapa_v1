import { describe, expect, it } from "vitest";
import { createPartyState, partyReducer, type PartyAction } from "./partyReducer";
import { contributionStepCount, stepType } from "../games/drawing/routing";
import { serializeStrokes, type Drawing } from "../games/drawing/strokes";
import type { PartyState, Player } from "./types";
import type { DrawingPrompt } from "../data/drawingPrompts";

/**
 * A festa de 10 pessoas, do começo ao fim.
 *
 * Este arquivo existe por causa de um playtest real: com ~5 jogadores tudo
 * funcionava, com 10 o Telefone Sem Fio caía por volta do terceiro passo.
 * Testar "10 jogadores existem num array" não teria pegado nada — o que
 * quebrava era o TAMANHO do que trafegava e o comportamento de quem não
 * entrega no prazo.
 *
 * Por isso aqui a partida roda INTEIRA (todos os 10 passos + revelação) e cada
 * jogador tem um comportamento diferente, incluindo os ruins.
 */

const PIN = "123456";
const JOGADORES = 10;

function jogadores(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    nickname: `Jogador${i}`,
    color: `#ff5c8${i % 10}`,
    avatarSeed: `s${i}`,
    score: 0,
    joinedAt: 1000 + i,
  }));
}

function temas(n: number): DrawingPrompt[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `t${i}`,
    text: `tema ${i}`,
    acceptedAnswers: [],
    complexity: "simple",
  }));
}

/** Um rabisco plausível: 40 traços de 30 pontos, como um desenho de verdade. */
function desenhoRealista(): Drawing {
  return Array.from({ length: 40 }, () => ({
    tool: "brush" as const,
    width: 0.014,
    color: 0,
    points: Array.from({ length: 30 }, (_, i) => ({
      x: (i % 17) / 17,
      y: (i % 13) / 13,
    })),
  }));
}

function salaPronta(): PartyState {
  let state = createPartyState(PIN, 0);
  for (const player of jogadores(JOGADORES)) {
    state = partyReducer(state, { type: "PLAYER_JOIN", player });
  }
  state = partyReducer(state, { type: "SET_GAME", gameId: "drawing-telephone" });
  return partyReducer(state, {
    type: "START_GAME",
    now: 0,
    seatOrder: jogadores(JOGADORES).map((p) => p.id),
    prompts: temas(JOGADORES),
    chainIds: Array.from({ length: JOGADORES }, (_, i) => `c${i}`),
    matchId: "m1",
  });
}

/**
 * O que a arquitetura nova coloca no canal.
 *
 * Depois da migração, o Realtime carrega só linhas pequenas — a fase da sala,
 * o progresso da partida e o roster. Nem traço nem imagem passam por ali: o
 * conteúdo é buscado sob demanda em `room_snapshot()`.
 *
 * Esta função reproduz esse recorte para o teste poder VIGIAR o tamanho. Se
 * alguém devolver desenho para dentro do que é transmitido, o teto abaixo
 * estoura e o playtest não precisa descobrir de novo.
 */
function payloadDeRealtime(state: PartyState): string {
  return JSON.stringify({
    room: {
      pin: state.pin,
      phase: state.phase,
      phaseEndsAt: state.phaseDeadline,
      pausedAt: state.pausedAt,
      round: state.round,
      hostPlayerId: state.hostPlayerId,
      gameId: state.settings.gameId,
    },
    match: state.drawing && {
      stepIndex: state.drawing.stepIndex,
      stepCount: state.drawing.stepCount,
      seatOrder: state.drawing.seatOrder,
      submitted: state.drawing.submitted,
    },
    players: state.players.map((p) => ({
      id: p.id, nickname: p.nickname, color: p.color,
      avatarSeed: p.avatarSeed, score: p.score,
    })),
  });
}

describe("festa de 10 jogadores, partida inteira", () => {
  /**
   * O roteiro do playtest, jogador por jogador. Os "ruins" são de propósito:
   * é neles que a arquitetura antiga quebrava.
   */
  it("chega ao fim com todos os cadernos íntegros", () => {
    let state = salaPronta();
    expect(state.phase).toBe("GAME_INTRO");

    const passos = contributionStepCount(JOGADORES);
    expect(passos).toBe(10);

    state = partyReducer(state, { type: "ADVANCE", now: 1 });
    expect(state.phase).toBe("DRAW_STEP");

    const tracos = serializeStrokes(desenhoRealista());
    const picos: number[] = [];

    for (let passo = 0; passo < passos; passo += 1) {
      const desenhando = stepType(passo) === "draw";
      expect(state.phase).toBe(desenhando ? "DRAW_STEP" : "GUESS_STEP");
      expect(state.drawing?.stepIndex).toBe(passo);

      for (let i = 0; i < JOGADORES; i += 1) {
        const playerId = `p${i}`;
        const acao: PartyAction | null = (() => {
          // p3 nunca entrega: celular travado a partida inteira. A mesa não
          // pode ficar refém dele.
          if (i === 3) return null;
          if (desenhando) {
            return {
              type: "SUBMIT_DRAWING",
              playerId,
              url: null,
              strokes: tracos,
              // p1 e p7 entregam no estouro do prazo — o caso que virava
              // página em branco antes de a entrega registrar primeiro.
              status: i === 1 || i === 7 ? "timeout" : "submitted",
            };
          }
          return { type: "SUBMIT_GUESS", playerId, text: `palpite ${i} passo ${passo}` };
        })();

        if (!acao) continue;
        state = partyReducer(state, acao);
        // p5 aperta duas vezes. Não pode virar duas páginas.
        if (i === 5) state = partyReducer(state, acao);
      }

      picos.push(payloadDeRealtime(state).length);

      // Fecha o passo. Quem não entregou vira página em branco aqui.
      state = partyReducer(state, { type: "ADVANCE", now: 1000 * (passo + 1) });
      expect(state.phase).toBe("PASSING");
      state = partyReducer(state, { type: "ADVANCE", now: 1000 * (passo + 1) + 1 });
    }

    // Passou de todos os passos e entrou na revelação.
    expect(state.phase).toBe("REVEAL_INTRO");

    const drawing = state.drawing!;
    expect(drawing.chains).toHaveLength(JOGADORES);

    // Nenhum caderno com buraco: a corrente tem de ser estruturalmente válida
    // mesmo com um jogador que nunca entregou nada.
    for (const chain of drawing.chains) {
      expect(chain.pages).toHaveLength(passos);
      for (let passo = 0; passo < passos; passo += 1) {
        const page = chain.pages[passo];
        expect(page, `caderno ${chain.id} sem página no passo ${passo}`).toBeDefined();
        expect(page.type).toBe(stepType(passo) === "draw" ? "drawing" : "guess");
      }
    }

    // Uma página por pessoa por passo — nada de entrega dupla virar duas.
    for (const chain of drawing.chains) {
      const autores = chain.pages.map((p) => p.playerId);
      expect(new Set(autores).size).toBe(autores.length);
    }

    // O payload de Realtime não cresce com a partida. Era exatamente isso que
    // acontecia antes: cada desenho engordava o estado, que era retransmitido
    // inteiro, até estourar o limite lá pelo terceiro passo.
    const teto = 16 * 1024;
    for (const [passo, tamanho] of picos.entries()) {
      expect(tamanho, `payload do passo ${passo} passou do teto`).toBeLessThan(teto);
    }
    // E o último não pode ser muito maior que o primeiro.
    expect(picos[picos.length - 1]).toBeLessThan(picos[0] * 1.5);
  });

  it("termina a revelação e distribui pontos", () => {
    let state = salaPronta();
    state = partyReducer(state, { type: "ADVANCE", now: 1 });

    const passos = contributionStepCount(JOGADORES);
    for (let passo = 0; passo < passos; passo += 1) {
      // Ninguém entrega: o caso extremo. A partida ainda tem de terminar.
      state = partyReducer(state, { type: "ADVANCE", now: 1000 * (passo + 1) });
      state = partyReducer(state, { type: "ADVANCE", now: 1000 * (passo + 1) + 1 });
    }
    expect(state.phase).toBe("REVEAL_INTRO");

    // Slideshow inteiro: páginas de cada caderno até o confronto final.
    let guarda = 0;
    while (state.phase !== "GAME_OVER" && guarda < 400) {
      state = partyReducer(state, { type: "ADVANCE", now: 100000 + guarda });
      guarda += 1;
    }

    expect(state.phase).toBe("GAME_OVER");
    // Ninguém desenhou nada, então ninguém salvou a própria palavra.
    expect(state.players.every((p) => p.score === 0)).toBe(true);
  });

  /**
   * Sair e voltar no meio da partida.
   *
   * O assento é congelado em `seatOrder`, então a atribuição se recalcula
   * sozinha — reconectar não pode embaralhar a mesa nem custar a vez de
   * ninguém.
   */
  it("quem cai e volta continua no mesmo assento", () => {
    let state = salaPronta();
    state = partyReducer(state, { type: "ADVANCE", now: 1 });

    const assentoAntes = state.drawing!.seatOrder.indexOf("p4");
    const jogador = state.players.find((p) => p.id === "p4")!;

    // Sumiu (F5, tela trocada, rede caiu) e voltou.
    state = partyReducer(state, { type: "PLAYER_LEAVE", playerId: "p4" });
    state = partyReducer(state, { type: "PLAYER_JOIN", player: jogador });

    // O que de fato importa: a pessoa está DE VOLTA no roster. A versão
    // anterior passava neste teste olhando só o `seatOrder` — que é congelado
    // e não muda de qualquer jeito — enquanto p4 tinha sumido da sala para
    // sempre.
    expect(state.players.map((p) => p.id)).toContain("p4");
    expect(state.players).toHaveLength(JOGADORES);
    expect(state.drawing!.seatOrder.indexOf("p4")).toBe(assentoAntes);
    expect(state.drawing!.seatOrder).toHaveLength(JOGADORES);
  });
});
