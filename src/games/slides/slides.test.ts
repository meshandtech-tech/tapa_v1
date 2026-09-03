import { describe, expect, it } from "vitest";
import { createPartyState, partyReducer } from "../../party/partyReducer";
import type { PartyState, Player } from "../../party/types";
import { IMPROV_SLIDES_CONFIG, PRESENTATION_TOTAL_MS, SLIDE_DURATION_MS } from "./config";
import {
  currentPresenter,
  eligibleVoters,
  everyonePresented,
  pickSlides,
  rememberSlides,
  replaceFailedSlides,
  roundAverage,
  slideProgress,
  slidesRanking,
  votesIn,
} from "./slides";

const PIN = "4321";
const POR_APRESENTACAO = IMPROV_SLIDES_CONFIG.slidesPerPresentation;

function jogadores(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`, nickname: `Jogador ${i}`, color: "#ff5c8a",
    avatarSeed: `s${i}`, score: 0, joinedAt: i,
  }));
}

const acervo = (n: number) => Array.from({ length: n }, (_, i) => `img-${i}`);

function salaCheia(n: number): PartyState {
  let state = createPartyState(PIN, 0, { gameId: "improv-slides" });
  for (const player of jogadores(n)) state = partyReducer(state, { type: "PLAYER_JOIN", player });
  return state;
}

/** Começa a partida e para no GAME_INTRO (as instruções esperam o host). */
function comecar(n: number): PartyState {
  return partyReducer(salaCheia(n), {
    type: "START_GAME", now: 1000, seatOrder: jogadores(n).map((p) => p.id),
  });
}

/** Um ADVANCE já com os slides sorteados, como a autoridade manda. */
function avancar(state: PartyState, now: number, pool = acervo(30)): PartyState {
  return partyReducer(state, {
    type: "ADVANCE",
    now,
    slideIds: pickSlides(pool, state.slides?.usedSlideIds ?? []),
    slidePoolSize: pool.length,
  });
}

describe("sorteio dos slides", () => {
  it("dá exatamente cinco, sem repetir na mesma apresentação", () => {
    for (let i = 0; i < 200; i += 1) {
      const escolhidos = pickSlides(acervo(30), []);
      expect(escolhidos).toHaveLength(POR_APRESENTACAO);
      expect(new Set(escolhidos).size).toBe(POR_APRESENTACAO);
    }
  });

  it("prefere o que ainda não saiu", () => {
    const pool = acervo(10);
    const usados = ["img-0", "img-1", "img-2", "img-3", "img-4"];
    for (let i = 0; i < 50; i += 1) {
      expect(pickSlides(pool, usados).sort()).toEqual(["img-5", "img-6", "img-7", "img-8", "img-9"]);
    }
  });

  /**
   * A regra que cede: com acervo curto, repetir imagem é melhor do que
   * entregar quatro slides. Nunca repetir DENTRO da apresentação continua
   * valendo — essa não cede.
   */
  it("reaproveita quando o acervo é menor que a apresentação inteira", () => {
    const pool = acervo(6);
    const escolhidos = pickSlides(pool, ["img-0", "img-1", "img-2", "img-3", "img-4", "img-5"]);
    expect(escolhidos).toHaveLength(POR_APRESENTACAO);
    expect(new Set(escolhidos).size).toBe(POR_APRESENTACAO);
  });

  it("não inventa slide quando o acervo é minúsculo", () => {
    expect(pickSlides(acervo(3), [])).toHaveLength(3);
    expect(pickSlides([], [])).toHaveLength(0);
  });

  it("a memória de usados nunca engole o acervo inteiro", () => {
    let usados: string[] = [];
    for (let i = 0; i < 40; i += 1) usados = rememberSlides(usados, pickSlides(acervo(12), usados), 12);
    // Sempre sobra pelo menos uma apresentação de onde tirar.
    expect(usados.length).toBeLessThanOrEqual(12 - POR_APRESENTACAO);
  });

  it("troca só as posições quebradas e nunca sorteia a URL que falhou de novo", () => {
    const atuais = ["a", "b", "c", "d", "e"];
    const trocados = replaceFailedSlides(atuais, ["b", "d"], [...atuais, "f", "g"], () => 0);

    expect(trocados).not.toBeNull();
    expect(trocados![0]).toBe("a");
    expect(trocados![2]).toBe("c");
    expect(trocados![4]).toBe("e");
    expect(trocados).toHaveLength(POR_APRESENTACAO);
    expect(new Set(trocados).size).toBe(POR_APRESENTACAO);
    expect(trocados).not.toContain("b");
    expect(trocados).not.toContain("d");
  });

  it("não envia lista incompleta quando não há reservas suficientes", () => {
    expect(replaceFailedSlides(["a", "b", "c", "d", "e"], ["b", "d"], ["a", "b", "c", "d", "e", "f"]))
      .toBeNull();
  });
});

describe("slideProgress — o slide sai do prazo da fase", () => {
  const base = { ...createPartyState(PIN, 0, { gameId: "improv-slides" }), phase: "PRESENTATION" as const };
  const emT = (ms: number) => ({ ...base, phaseDeadline: 100_000 + PRESENTATION_TOTAL_MS, pausedAt: null });

  it("anda um slide a cada 20 segundos", () => {
    const state = emT(0);
    const inicio = state.phaseDeadline - PRESENTATION_TOTAL_MS;
    for (let i = 0; i < POR_APRESENTACAO; i += 1) {
      const meio = inicio + i * SLIDE_DURATION_MS + 5_000;
      expect(slideProgress(state, meio).index).toBe(i);
      expect(slideProgress(state, meio).remainingMs).toBe(15_000);
    }
  });

  it("vira exatamente na fronteira", () => {
    const state = emT(0);
    const inicio = state.phaseDeadline - PRESENTATION_TOTAL_MS;
    expect(slideProgress(state, inicio + 19_999).index).toBe(0);
    expect(slideProgress(state, inicio + 20_000).index).toBe(1);
  });

  it("não passa do quinto slide nem antes do primeiro", () => {
    const state = emT(0);
    const inicio = state.phaseDeadline - PRESENTATION_TOTAL_MS;
    expect(slideProgress(state, inicio - 5_000).index).toBe(0);
    expect(slideProgress(state, inicio + PRESENTATION_TOTAL_MS + 9_999).index).toBe(POR_APRESENTACAO - 1);
    expect(slideProgress(state, inicio + PRESENTATION_TOTAL_MS - 1).isLast).toBe(true);
  });

  // Pausa de emergência do host: o relógio congela onde parou, em todo aparelho.
  it("congela enquanto pausado", () => {
    const state = emT(0);
    const inicio = state.phaseDeadline - PRESENTATION_TOTAL_MS;
    const pausado = { ...state, pausedAt: inicio + 25_000 };
    expect(slideProgress(pausado, inicio + 90_000).index).toBe(1);
    expect(slideProgress(pausado, inicio + 90_000).remainingMs).toBe(15_000);
  });
});

describe("rodízio de apresentadores", () => {
  it("cada um apresenta uma vez, e só depois pode repetir", () => {
    for (const n of [3, 5, 8, 10]) {
      let state = comecar(n);
      const apresentaram: string[] = [];
      let relogio = 2000;

      while (state.phase !== "GAME_OVER" && apresentaram.length <= n + 2) {
        state = avancar(state, (relogio += 1000));
        if (state.phase === "PLAYER_SPIN") {
          const quem = currentPresenter(state);
          expect(quem, `sala de ${n}`).not.toBeNull();
          apresentaram.push(quem!.id);
        }
      }

      expect(apresentaram, `sala de ${n}`).toHaveLength(n);
      expect(new Set(apresentaram).size, `sala de ${n}`).toBe(n);
      expect(state.phase).toBe("GAME_OVER");
    }
  });

  it("cada apresentação recebe cinco slides", () => {
    let state = comecar(5);
    let relogio = 2000;
    const vistos: string[][] = [];
    while (state.phase !== "GAME_OVER") {
      state = avancar(state, (relogio += 1000));
      if (state.phase === "PLAYER_SPIN") vistos.push([...state.slides!.slideIds]);
    }
    expect(vistos).toHaveLength(5);
    for (const conjunto of vistos) {
      expect(conjunto).toHaveLength(POR_APRESENTACAO);
      expect(new Set(conjunto).size).toBe(POR_APRESENTACAO);
    }
  });

  it("everyonePresented só é verdade no fim da fila", () => {
    let state = comecar(3);
    expect(everyonePresented(state)).toBe(false);
    let relogio = 2000;
    while (state.phase !== "GAME_OVER") state = avancar(state, (relogio += 1000));
    expect(everyonePresented(state)).toBe(true);
  });
});

describe("votação", () => {
  /** Leva a partida até a fase de votação da primeira apresentação. */
  function naVotacao(n = 4): PartyState {
    let state = comecar(n);
    let relogio = 2000;
    while (state.phase !== "VOTING") state = avancar(state, (relogio += 1000));
    return state;
  }

  it("quem entra no meio não vota nem aparece no contador", () => {
    let state = naVotacao(3);
    const tarde = jogadores(4)[3];
    state = partyReducer(state, { type: "PLAYER_JOIN", player: tarde });

    expect(eligibleVoters(state).map((player) => player.id)).not.toContain(tarde.id);
    state = partyReducer(state, { type: "VOTE", playerId: tarde.id, rating: 5 });
    expect(state.slides?.votes[tarde.id]).toBeUndefined();
  });

  it("quem apresenta não vota em si", () => {
    const state = naVotacao();
    const quem = currentPresenter(state)!;
    expect(eligibleVoters(state).some((p) => p.id === quem.id)).toBe(false);
    const depois = partyReducer(state, { type: "VOTE", playerId: quem.id, rating: 5 });
    expect(votesIn(depois)).toBe(0);
  });

  it("ninguém vota duas vezes", () => {
    let state = naVotacao();
    const votante = eligibleVoters(state)[0];
    state = partyReducer(state, { type: "VOTE", playerId: votante.id, rating: 4 });
    state = partyReducer(state, { type: "VOTE", playerId: votante.id, rating: 1 });
    expect(votesIn(state)).toBe(1);
    expect(state.slides!.votes[votante.id]).toBe(4);
  });

  it("recusa nota fora de 1 a 5", () => {
    let state = naVotacao();
    const votante = eligibleVoters(state)[0];
    for (const nota of [0, 6, -1, 2.5, Number.NaN]) {
      state = partyReducer(state, { type: "VOTE", playerId: votante.id, rating: nota });
    }
    expect(votesIn(state)).toBe(0);
  });

  it("a média vira a nota do apresentador", () => {
    let state = naVotacao(4);
    const notas = [5, 4, 3];
    eligibleVoters(state).forEach((votante, i) => {
      state = partyReducer(state, { type: "VOTE", playerId: votante.id, rating: notas[i] });
    });
    expect(roundAverage(state)).toBe(4);

    const quem = currentPresenter(state)!;
    state = avancar(state, 90_000);
    expect(state.phase).toBe("SCORE_REVEAL");
    expect(state.slides!.scores[quem.id]).toBe(4);
  });

  it("sem voto nenhum, a apresentação não vira nota", () => {
    let state = naVotacao();
    const quem = currentPresenter(state)!;
    expect(roundAverage(state)).toBeNull();
    state = avancar(state, 90_000);
    expect(state.slides!.scores[quem.id]).toBeUndefined();
  });
});

describe("pular slide (emergência do host)", () => {
  it("corta o slide corrente e cai no seguinte", () => {
    let state = comecar(3);
    let relogio = 2000;
    while (state.phase !== "PRESENTATION") state = avancar(state, (relogio += 1000));

    const inicio = state.phaseDeadline - PRESENTATION_TOTAL_MS;
    const agora = inicio + 5_000;
    expect(slideProgress(state, agora).index).toBe(0);

    state = partyReducer(state, { type: "SKIP_SLIDE", now: agora });
    expect(slideProgress(state, agora).index).toBe(1);
  });

  it("só vale durante a apresentação", () => {
    const state = comecar(3);
    expect(partyReducer(state, { type: "SKIP_SLIDE", now: 1 })).toBe(state);
  });
});

describe("recuperação de slide quebrado", () => {
  const novos = ["novo-1", "novo-2", "novo-3", "novo-4", "novo-5"];

  it("aceita exatamente cinco slides até o fim da preparação", () => {
    const state = { ...comecar(3), phase: "PREPARATION" as const };
    const depois = partyReducer(state, { type: "REPLACE_SLIDES", slideIds: novos });
    expect(depois.slides?.slideIds).toEqual(novos);
  });

  it("não troca depois que a contagem regressiva começou", () => {
    const state = { ...comecar(3), phase: "COUNTDOWN" as const };
    expect(partyReducer(state, { type: "REPLACE_SLIDES", slideIds: novos })).toBe(state);
  });

  it("não aceita uma apresentação incompleta", () => {
    const state = { ...comecar(3), phase: "PLAYER_REVEAL" as const };
    expect(partyReducer(state, { type: "REPLACE_SLIDES", slideIds: novos.slice(0, 4) })).toBe(state);
  });
});

describe("placar", () => {
  it("ordena por nota, desempatando por quem entrou primeiro", () => {
    const base = comecar(3);
    const state: PartyState = {
      ...base,
      slides: { ...base.slides!, scores: { p0: 3.5, p1: 4.8, p2: 3.5 } },
    };
    const ranking = slidesRanking(state);
    expect(ranking.map((r) => r.player.id)).toEqual(["p1", "p0", "p2"]);
    expect(ranking[0].score).toBe(4.8);
  });
});

describe("mínimo de jogadores", () => {
  it("não começa com menos que o mínimo", () => {
    const faltando = IMPROV_SLIDES_CONFIG.minPlayers - 1;
    const state = partyReducer(salaCheia(faltando), { type: "START_GAME", now: 1 });
    expect(state.phase).toBe("LOBBY");
  });
});
