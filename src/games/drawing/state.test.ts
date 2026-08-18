import { describe, expect, it } from "vitest";
import type { DrawingPrompt } from "../../data/drawingPrompts";
import { createPartyState, partyReducer, type PartyAction } from "../../party/partyReducer";
import type { PartyState, Player } from "../../party/types";
import {
  assignmentFor,
  chainSurvived,
  createDrawingState,
  drawingScores,
  everyoneSubmitted,
  finalGuess,
  pagesPerChain,
} from "./state";
import { contributionStepCount, stepType } from "./routing";
import { DRAWING_TELEPHONE_CONFIG } from "./config";

const PIN = "123456";

function jogadores(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    nickname: `Jogador ${i}`,
    color: "#ff5c8a",
    avatarSeed: `s${i}`,
    score: 0,
    joinedAt: i,
  }));
}

function temas(n: number): DrawingPrompt[] {
  return Array.from({ length: n }, (_, i) => ({ id: `t${i}`, text: `Tema ${i}` }));
}

/** Sala pronta para começar, com o jogo de desenho escolhido. */
function salaCheia(n: number): PartyState {
  let state = createPartyState(PIN, 0, { gameId: "drawing-telephone" });
  for (const player of jogadores(n)) {
    state = partyReducer(state, { type: "PLAYER_JOIN", player });
  }
  return state;
}

function comecar(n: number, now = 1000): PartyState {
  const state = partyReducer(salaCheia(n), {
    type: "START_GAME",
    now,
    seatOrder: jogadores(n).map((p) => p.id),
    prompts: temas(n),
    chainIds: jogadores(n).map((_, i) => `c${i}`),
    matchId: "m1",
  });
  // GAME_INTRO -> DRAW_STEP
  return partyReducer(state, { type: "ADVANCE", now });
}

/** Avança até a primeira fase de palpite, com todos os desenhos entregues. */
function naFaseDePalpite(n: number): PartyState {
  let state = comecar(n);
  for (const player of state.players) {
    state = partyReducer(state, { type: "SUBMIT_DRAWING", playerId: player.id, url: "u" });
  }
  state = partyReducer(state, { type: "ADVANCE", now: 5000 });
  return partyReducer(state, { type: "ADVANCE", now: 5100 });
}

/** Toca a partida inteira até o fim, com todo mundo entregando sempre. */
function jogarAteRevelacao(n: number, entrega?: (state: PartyState, playerId: string) => PartyAction) {
  let state = comecar(n);
  let relogio = 2000;

  while (state.phase === "DRAW_STEP" || state.phase === "GUESS_STEP" || state.phase === "PASSING") {
    if (state.phase === "PASSING") {
      state = partyReducer(state, { type: "ADVANCE", now: (relogio += 100) });
      continue;
    }
    const tipo = state.phase === "DRAW_STEP" ? "draw" : "guess";
    for (const player of state.players) {
      state = partyReducer(
        state,
        entrega?.(state, player.id) ??
          (tipo === "draw"
            ? { type: "SUBMIT_DRAWING", playerId: player.id, url: `u/${player.id}` }
            : { type: "SUBMIT_GUESS", playerId: player.id, text: `palpite ${player.id}` }),
      );
    }
    state = partyReducer(state, { type: "ADVANCE", now: (relogio += 100) });
  }
  return state;
}

describe("criação da partida", () => {
  it("congela a ordem e dá um tema por caderno", () => {
    const state = comecar(6);
    expect(state.drawing!.seatOrder).toHaveLength(6);
    expect(state.drawing!.chains).toHaveLength(6);
    expect(new Set(state.drawing!.chains.map((c) => c.promptId)).size).toBe(6);
    expect(state.phase).toBe("DRAW_STEP");
  });

  it("cada caderno começa com o dono no assento certo", () => {
    const state = comecar(5);
    state.drawing!.chains.forEach((chain, i) => {
      expect(chain.ownerPlayerId).toBe(state.drawing!.seatOrder[i]);
    });
  });

  // Deriva do config em vez de fixar um número: o mínimo é ajustável de
  // propósito, e um 3 cravado aqui quebraria toda vez que ele mudasse.
  it("não começa com uma pessoa a menos que o mínimo", () => {
    const faltando = DRAWING_TELEPHONE_CONFIG.minPlayers - 1;
    const state = partyReducer(salaCheia(faltando), { type: "START_GAME", now: 1 });
    expect(state.phase).toBe("LOBBY");
  });
});

describe("atribuição", () => {
  it("no passo 0 cada um recebe o próprio tema", () => {
    const state = comecar(6);
    for (const player of state.players) {
      const tarefa = assignmentFor(state, player.id)!;
      expect(tarefa.stepType).toBe("draw");
      expect(tarefa.previous).toEqual({ kind: "prompt", text: tarefa.chain.originalPrompt });
      expect(tarefa.chain.ownerPlayerId).toBe(player.id);
    }
  });

  /** A regra que sustenta o jogo: só a página imediatamente anterior. */
  it("mostra só a página anterior, nunca o caderno inteiro", () => {
    let state = comecar(6);
    for (const player of state.players) {
      state = partyReducer(state, {
        type: "SUBMIT_DRAWING", playerId: player.id, url: `u/${player.id}`,
      });
    }
    state = partyReducer(state, { type: "ADVANCE", now: 5000 });
    state = partyReducer(state, { type: "ADVANCE", now: 5100 });

    expect(state.phase).toBe("GUESS_STEP");
    for (const player of state.players) {
      const tarefa = assignmentFor(state, player.id)!;
      expect(tarefa.previous!.kind).toBe("drawing");
      // O caderno tem tema e desenho, mas a pessoa só recebe o desenho.
      expect(JSON.stringify(tarefa.previous)).not.toContain(tarefa.chain.originalPrompt);
      expect(tarefa.chain.ownerPlayerId).not.toBe(player.id);
    }
  });

  it("ninguém recebe atribuição fora de uma fase de contribuição", () => {
    const state = comecar(6);
    const parado = { ...state, phase: "PASSING" as const };
    expect(assignmentFor(parado, "p0")).toBeNull();
  });
});

describe("entrega", () => {
  it("entrega dupla não vira duas páginas", () => {
    let state = comecar(4);
    const antes = JSON.stringify(state.drawing!.chains);
    state = partyReducer(state, { type: "SUBMIT_DRAWING", playerId: "p0", url: "a" });
    const depois = JSON.stringify(state.drawing!.chains);
    // Segundo toque no mesmo botão: não muda nada.
    state = partyReducer(state, { type: "SUBMIT_DRAWING", playerId: "p0", url: "OUTRO" });
    expect(JSON.stringify(state.drawing!.chains)).toBe(depois);
    expect(depois).not.toBe(antes);
    expect(state.drawing!.submitted).toEqual(["p0"]);
  });

  it("recusa quem não está na partida", () => {
    let state = comecar(4);
    state = partyReducer(state, { type: "SUBMIT_DRAWING", playerId: "intruso", url: "a" });
    expect(state.drawing!.submitted).toHaveLength(0);
  });

  it("recusa palpite vazio", () => {
    const state = naFaseDePalpite(4);
    expect(state.phase).toBe("GUESS_STEP");
    const vazio = partyReducer(state, { type: "SUBMIT_GUESS", playerId: "p0", text: "   " });
    expect(vazio.drawing!.submitted).toHaveLength(0);

    // E aceita o mesmo palpite com conteúdo, já sem espaço nas pontas.
    const cheio = partyReducer(state, { type: "SUBMIT_GUESS", playerId: "p0", text: "  gato  " });
    expect(cheio.drawing!.submitted).toEqual(["p0"]);
    const pagina = cheio.drawing!.chains.flatMap((c) => c.pages).find((pg) => pg.type === "guess");
    expect(pagina && pagina.type === "guess" && pagina.text).toBe("gato");
  });

  it("quem não entrega vira página em branco e a corrente segue", () => {
    let state = comecar(4);
    // Só um entrega; o prazo vence para os outros três.
    state = partyReducer(state, { type: "SUBMIT_DRAWING", playerId: "p0", url: "a" });
    state = partyReducer(state, { type: "ADVANCE", now: 9000 });

    expect(state.phase).toBe("PASSING");
    for (const chain of state.drawing!.chains) {
      expect(chain.pages).toHaveLength(1);
    }
    const embranco = state.drawing!.chains.flatMap((c) => c.pages).filter((p) => p.status === "timeout");
    expect(embranco).toHaveLength(3);
  });
});

describe.each([4, 5, 6, 7, 8, 9, 10])("partida completa com %i jogadores", (n) => {
  const passos = contributionStepCount(n);
  const state = jogarAteRevelacao(n);

  it("chega na revelação", () => {
    expect(state.phase).toBe("REVEAL_INTRO");
  });

  it("todo caderno tem exatamente um passo por contribuição", () => {
    for (const chain of state.drawing!.chains) {
      expect(chain.pages).toHaveLength(passos);
    }
  });

  it("desenho e palpite alternam, e a última página é escrita", () => {
    for (const chain of state.drawing!.chains) {
      chain.pages.forEach((page, i) => {
        expect(page.type).toBe(stepType(i) === "draw" ? "drawing" : "guess");
      });
      expect(chain.pages[chain.pages.length - 1].type).toBe("guess");
    }
  });

  it("cada pessoa contribui uma vez por caderno, no máximo", () => {
    for (const chain of state.drawing!.chains) {
      const autores = chain.pages.map((page) => page.playerId);
      expect(new Set(autores).size).toBe(autores.length);
    }
  });

  it("todo mundo contribui em todos os passos", () => {
    for (let passo = 0; passo < passos; passo += 1) {
      const autores = state.drawing!.chains.map((chain) => chain.pages[passo].playerId);
      expect(new Set(autores).size).toBe(n);
    }
  });
});

describe("revelação e placar", () => {
  it("percorre todos os cadernos, página por página, e termina no placar", () => {
    let state = jogarAteRevelacao(4);
    const total = state.drawing!.chains.length * pagesPerChain(state.drawing!.stepCount);

    let relogio = 50_000;
    let voltas = 0;
    while (state.phase !== "GAME_OVER" && voltas < total + 10) {
      state = partyReducer(state, { type: "ADVANCE", now: (relogio += 100) });
      voltas += 1;
    }
    expect(state.phase).toBe("GAME_OVER");
    // Uma entrada em REVEAL_PAGE por página, mais a saída do REVEAL_INTRO.
    expect(voltas).toBe(total + 1);
  });

  it("auto-play arma prazo na página; desligado, espera o host", () => {
    let state = jogarAteRevelacao(4);
    state = partyReducer(state, { type: "ADVANCE", now: 50_000 });
    expect(state.phase).toBe("REVEAL_PAGE");
    expect(state.phaseDeadline).toBe(0);

    state = partyReducer(state, { type: "SET_REVEAL_AUTOPLAY", autoPlay: true, now: 51_000 });
    expect(state.phaseDeadline).toBeGreaterThan(51_000);

    state = partyReducer(state, { type: "SET_REVEAL_AUTOPLAY", autoPlay: false, now: 52_000 });
    expect(state.phaseDeadline).toBe(0);
  });

  it("o host pode bancar um palpite que a máquina não casou", () => {
    const state = jogarAteRevelacao(4);
    const chain = state.drawing!.chains[0];
    expect(chainSurvived(chain, [])).toBe(false);

    const bancado = partyReducer(state, { type: "COUNT_AS_MATCH", chainId: chain.id });
    expect(chainSurvived(bancado.drawing!.chains[0], bancado.drawing!.manualMatches)).toBe(true);
    expect(drawingScores(bancado.drawing!)[chain.ownerPlayerId]).toBe(1);
  });

  it("pontua o dono do caderno cuja palavra chegou inteira", () => {
    let state = comecar(4);
    // Todo mundo adivinha exatamente o tema do caderno que recebeu.
    let relogio = 2000;
    while (state.phase !== "REVEAL_INTRO") {
      if (state.phase === "PASSING") {
        state = partyReducer(state, { type: "ADVANCE", now: (relogio += 100) });
        continue;
      }
      for (const player of state.players) {
        const tarefa = assignmentFor(state, player.id)!;
        state = partyReducer(
          state,
          state.phase === "DRAW_STEP"
            ? { type: "SUBMIT_DRAWING", playerId: player.id, url: "u" }
            : { type: "SUBMIT_GUESS", playerId: player.id, text: tarefa.chain.originalPrompt },
        );
      }
      state = partyReducer(state, { type: "ADVANCE", now: (relogio += 100) });
    }

    const pontos = drawingScores(state.drawing!);
    expect(Object.values(pontos).every((valor) => valor === 1)).toBe(true);
  });
});

describe("a corrente determinística do exemplo", () => {
  /**
   * O caso que o produto pede de nome: a revelação tem de reproduzir a ordem
   * cronológica exata, com a autoria certa em cada página.
   */
  it("reproduz CACHORRO PILOTANDO MOTO -> ... -> HOMEM A CAVALO", () => {
    const players = jogadores(4);
    const drawing = createDrawingState(
      players,
      players.map((p) => p.id),
      [{ id: "t0", text: "Cachorro pilotando moto" }, ...temas(3)],
      ["c0", "c1", "c2", "c3"],
      "m1",
    );
    drawing.chains[0].pages = [
      { type: "drawing", playerId: "p0", url: "desenho-a", status: "submitted" },
      { type: "guess", playerId: "p1", text: "Urso de bicicleta", status: "submitted" },
      { type: "drawing", playerId: "p2", url: "desenho-b", status: "submitted" },
      { type: "guess", playerId: "p3", text: "Homem a cavalo", status: "submitted" },
    ];

    const chain = drawing.chains[0];
    expect(chain.originalPrompt).toBe("Cachorro pilotando moto");
    expect(chain.pages.map((p) => `${p.playerId}:${p.type}`)).toEqual([
      "p0:drawing", "p1:guess", "p2:drawing", "p3:guess",
    ]);
    expect(finalGuess(chain)).toBe("Homem a cavalo");
    expect(chainSurvived(chain, [])).toBe(false);
    expect(drawingScores(drawing)["p0"]).toBe(0);
  });
});

describe("everyoneSubmitted", () => {
  it("só é verdade quando falta ninguém", () => {
    let state = comecar(4);
    expect(everyoneSubmitted(state.drawing!)).toBe(false);
    for (const player of state.players) {
      state = partyReducer(state, { type: "SUBMIT_DRAWING", playerId: player.id, url: "u" });
    }
    expect(everyoneSubmitted(state.drawing!)).toBe(true);
  });
});
