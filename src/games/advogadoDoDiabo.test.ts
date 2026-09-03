import { describe, expect, it } from "vitest";
import { createPartyState, partyReducer } from "../party/partyReducer";
import { PLAYER_COLORS, type PartyState, type Player } from "../party/types";
import {
  DEFAULT_TOPIC_POOL_SIZE,
  buildTopicPool,
  currentPresenter,
  currentTopic,
  topicKey,
  devilLeaderboard,
  eligibleVoters,
  everyonePresented,
  roundAverage,
} from "./advogadoDoDiabo";

function makePlayer(id: string, index: number): Player {
  return {
    id,
    nickname: id.toUpperCase(),
    color: PLAYER_COLORS[index % PLAYER_COLORS.length],
    avatarSeed: id,
    score: 0,
    joinedAt: 1000 + index,
  };
}

/** Sala pronta com o Advogado do Diabo selecionado. */
function sala(count: number): PartyState {
  let state = createPartyState("1234", 0);
  for (let i = 0; i < count; i += 1) {
    state = partyReducer(state, { type: "PLAYER_JOIN", player: makePlayer(`p${i}`, i) });
  }
  return partyReducer(state, { type: "SET_GAME", gameId: "advogado-do-diabo" });
}

const avancar = (state: PartyState, vezes = 1): PartyState => {
  let atual = state;
  for (let i = 0; i < vezes; i += 1) atual = partyReducer(atual, { type: "ADVANCE", now: i * 1000 });
  return atual;
};

/** Leva a sala até a fase pedida. */
function ate(state: PartyState, fase: PartyState["phase"], limite = 20): PartyState {
  let atual = partyReducer(state, { type: "START_GAME", now: 0 });
  for (let i = 0; i < limite && atual.phase !== fase; i += 1) atual = avancar(atual);
  return atual;
}

describe("início do Advogado do Diabo", () => {
  it("sorteia uma ordem com todo mundo, uma vez cada", () => {
    const state = partyReducer(sala(4), { type: "START_GAME", now: 0 });
    expect(state.devil?.order).toHaveLength(4);
    expect(new Set(state.devil?.order)).toHaveLength(4);
    expect(state.devil?.index).toBe(-1);
  });

  // O aviso é a primeira coisa: a fase de abertura não corre sozinha.
  it("a abertura espera o host aceitar o aviso", () => {
    const state = partyReducer(sala(3), { type: "START_GAME", now: 0 });
    expect(state.phase).toBe("GAME_INTRO");
    expect(state.phaseDeadline).toBe(0);
    expect(state.devil?.disclaimerAccepted).toBe(false);
  });
});

describe("fluxo da rodada", () => {
  it("sorteia o TEMA antes do apresentador", () => {
    let state = ate(sala(3), "TOPIC_REVEAL");
    // Já existe tema, mas ninguém foi escolhido ainda.
    expect(currentTopic(state)).toBeTruthy();
    expect(currentPresenter(state)).toBeNull();

    state = avancar(state); // PLAYER_SPIN
    expect(state.phase).toBe("PLAYER_SPIN");
    expect(currentPresenter(state)).not.toBeNull();
  });

  it("percorre a rodada inteira na ordem certa", () => {
    const esperado = [
      "TOPIC_SPIN", "TOPIC_REVEAL", "PLAYER_SPIN", "PLAYER_REVEAL",
      "PREPARATION", "COUNTDOWN", "PRESENTATION", "VOTING", "SCORE_REVEAL",
    ];
    let state = partyReducer(sala(3), { type: "START_GAME", now: 0 });
    for (const fase of esperado) {
      state = avancar(state);
      expect(state.phase).toBe(fase);
    }
  });

  it("ninguém apresenta duas vezes e o jogo acaba junto com a fila", () => {
    let state = partyReducer(sala(3), { type: "START_GAME", now: 0 });
    const vistos: string[] = [];
    for (let rodada = 0; rodada < 3; rodada += 1) {
      state = ate(state.phase === "GAME_INTRO" ? state : state, "PLAYER_REVEAL", 3);
      const quem = currentPresenter(state);
      if (quem) vistos.push(quem.id);
      while (state.phase !== "SCORE_REVEAL") state = avancar(state);
      if (rodada < 2) state = avancar(state);
    }
    expect(new Set(vistos)).toHaveLength(3);
    expect(everyonePresented(state)).toBe(true);
    expect(avancar(state).phase).toBe("GAME_OVER");
  });
});

describe("votação", () => {
  it("quem entra no meio não altera votação nem contador", () => {
    let state = ate(sala(3), "VOTING");
    state = partyReducer(state, { type: "PLAYER_JOIN", player: makePlayer("tarde", 3) });

    expect(eligibleVoters(state).map((player) => player.id)).not.toContain("tarde");
    state = partyReducer(state, { type: "VOTE", playerId: "tarde", rating: 5 });
    expect(state.devil?.votes.tarde).toBeUndefined();
  });

  it("quem apresenta não vota", () => {
    const state = ate(sala(3), "VOTING");
    const apresentador = currentPresenter(state)!;
    expect(eligibleVoters(state).map((p) => p.id)).not.toContain(apresentador.id);

    const tentou = partyReducer(state, {
      type: "VOTE", playerId: apresentador.id, rating: 5,
    });
    expect(tentou.devil?.votes[apresentador.id]).toBeUndefined();
  });

  it("ninguém vota duas vezes", () => {
    let state = ate(sala(3), "VOTING");
    const votante = eligibleVoters(state)[0];
    state = partyReducer(state, { type: "VOTE", playerId: votante.id, rating: 5 });
    state = partyReducer(state, { type: "VOTE", playerId: votante.id, rating: 1 });
    expect(state.devil?.votes[votante.id]).toBe(5);
  });

  it("recusa nota fora de 1 a 5", () => {
    const state = ate(sala(3), "VOTING");
    const votante = eligibleVoters(state)[0];
    for (const nota of [0, 6, -1, 2.5]) {
      expect(partyReducer(state, { type: "VOTE", playerId: votante.id, rating: nota })
        .devil?.votes[votante.id]).toBeUndefined();
    }
  });

  it("fecha a votação com a média e guarda no placar", () => {
    let state = ate(sala(3), "VOTING");
    const [a, b] = eligibleVoters(state);
    state = partyReducer(state, { type: "VOTE", playerId: a.id, rating: 5 });
    state = partyReducer(state, { type: "VOTE", playerId: b.id, rating: 4 });
    expect(roundAverage(state)).toBe(4.5);

    const apresentador = currentPresenter(state)!;
    state = avancar(state);
    expect(state.phase).toBe("SCORE_REVEAL");
    expect(state.devil?.scores[apresentador.id]).toBe(4.5);
  });

  it("sem votos, a rodada não inventa nota", () => {
    const state = ate(sala(3), "VOTING");
    expect(roundAverage(state)).toBeNull();
  });
});

describe("recusar a tese", () => {
  /**
   * O grupo achou o tema pesado demais. Troca a tese, mantém a pessoa — quem
   * foi sorteado não é punido por isso.
   */
  it("troca o tema e não pula ninguém", () => {
    let state = ate(sala(3), "PREPARATION");
    const antes = currentPresenter(state)!;
    const temaAntigo = currentTopic(state)!;

    state = partyReducer(state, { type: "REROLL_TOPIC" });
    expect(state.phase).toBe("TOPIC_SPIN");

    state = avancar(state, 3); // TOPIC_REVEAL → PLAYER_SPIN → PLAYER_REVEAL
    expect(currentPresenter(state)?.id).toBe(antes.id);
    expect(topicKey(currentTopic(state)!)).not.toBe(topicKey(temaAntigo));
  });

  it("a tese recusada não volta na mesma partida", () => {
    let state = ate(sala(3), "TOPIC_REVEAL");
    const recusado = currentTopic(state)!;
    state = partyReducer(state, { type: "REROLL_TOPIC" });

    const chave = topicKey(recusado);
    expect(state.devil!.pool.find((t) => topicKey(t) === chave)?.rejectedAt).toBeTruthy();
    expect(state.devil!.candidates.map(topicKey)).not.toContain(chave);
  });
});

/**
 * O acervo é FINITO e não repete. Foi o que quebrou no playtest: com ~10 teses
 * escolhidas, a roleta caiu duas vezes no mesmo tema porque os candidatos eram
 * re-sorteados do zero a cada rodada.
 */
describe("acervo finito de teses", () => {
  it("reserva uma troca de tese para cada pessoa numa sala cheia", () => {
    const pool = buildTopicPool([], "easy", DEFAULT_TOPIC_POOL_SIZE, (items) => [...items]);
    expect(pool).toHaveLength(20);
    expect(pool.length).toBeGreaterThanOrEqual(10 + 10);
    expect(new Set(pool.map(topicKey))).toHaveLength(pool.length);
  });

  it("mantém todas as teses do host e completa a reserva com o sistema", () => {
    const custom = Array.from({ length: 10 }, (_, index) => ({
      id: `custom-${index}`,
      text: `Tese especial ${index}`,
    }));
    const pool = buildTopicPool(custom, "medium", DEFAULT_TOPIC_POOL_SIZE, (items) => [...items]);

    expect(pool).toHaveLength(20);
    expect(pool.filter((topic) => topic.source === "custom")).toHaveLength(10);
    expect(pool.filter((topic) => topic.source === "default")).toHaveLength(10);
  });

  it("leva 10 pessoas até o fim mesmo trocando uma tese por rodada", () => {
    let state = ate(sala(10), "TOPIC_REVEAL");
    const apresentadores: string[] = [];
    const tesesAceitas: string[] = [];

    for (let rodada = 0; rodada < 10; rodada += 1) {
      // A primeira tese de cada rodada é recusada.
      expect(currentTopic(state)).not.toBeNull();
      state = partyReducer(state, { type: "REROLL_TOPIC" });
      expect(state.phase).toBe("TOPIC_SPIN");
      state = avancar(state); // TOPIC_REVEAL com a substituta.

      const substituta = currentTopic(state);
      expect(substituta).not.toBeNull();
      tesesAceitas.push(topicKey(substituta!));

      state = avancar(state, 3); // PLAYER_SPIN → PLAYER_REVEAL → PREPARATION.
      apresentadores.push(currentPresenter(state)!.id);
      while (state.phase !== "SCORE_REVEAL") state = avancar(state);

      state = avancar(state); // Próxima tese, ou GAME_OVER depois da décima.
      if (rodada < 9) {
        expect(state.phase).toBe("TOPIC_SPIN");
        state = avancar(state); // TOPIC_REVEAL da próxima rodada.
      }
    }

    expect(state.phase).toBe("GAME_OVER");
    expect(new Set(apresentadores)).toHaveLength(10);
    expect(new Set(tesesAceitas)).toHaveLength(10);
  });

  it("nenhuma tese sai duas vezes na mesma partida", () => {
    let state = ate(sala(6), "TOPIC_REVEAL");
    const vistas: string[] = [];

    for (let rodada = 0; rodada < 6; rodada += 1) {
      const tema = currentTopic(state);
      if (!tema) break;
      vistas.push(topicKey(tema));
      // Sai da fase antes de procurar a próxima, senão `ate` devolve a atual.
      state = avancar(state, 1);
      state = ate(state, "TOPIC_REVEAL", 40);
      if (state.phase !== "TOPIC_REVEAL") break;
    }

    expect(vistas.length).toBeGreaterThan(1);
    expect(new Set(vistas).size).toBe(vistas.length);
  });

  it("o acervo diminui a cada tese usada", () => {
    const state = ate(sala(4), "TOPIC_REVEAL");
    const devil = state.devil!;
    const disponiveis = devil.pool.filter((t) => t.usedAt === null).length;
    expect(disponiveis).toBe(devil.pool.length - 1);
  });

  it("custom e sistema são itens distintos mesmo com o mesmo id", () => {
    let state = sala(3);
    // Um id que também existe no deck do sistema.
    state = partyReducer(state, {
      type: "ADD_CUSTOM_TOPIC", topic: { id: "h1", text: "TESE DO HOST. DEFENDE ESSA." },
    });
    state = partyReducer(state, { type: "START_GAME", now: 0 });

    const pool = state.devil!.pool;
    const custom = pool.find((t) => t.source === "custom" && t.id === "h1");
    expect(custom?.text).toBe("TESE DO HOST. DEFENDE ESSA.");
    // Chaves únicas: nada colide, mesmo com id repetido entre origens.
    expect(new Set(pool.map(topicKey)).size).toBe(pool.length);
  });
});

describe("teses do host", () => {
  it("aceita até 10 e recusa a 11ª", () => {
    let state = sala(3);
    for (let i = 0; i < 12; i += 1) {
      state = partyReducer(state, {
        type: "ADD_CUSTOM_TOPIC",
        topic: { id: `c${i}`, text: `Defenda a tese ${i}` },
      });
    }
    expect(state.devil?.customTopics).toHaveLength(10);
  });

  it("recusa tese vazia, edita e remove", () => {
    let state = partyReducer(sala(3), {
      type: "ADD_CUSTOM_TOPIC", topic: { id: "c1", text: "   " },
    });
    expect(state.devil?.customTopics ?? []).toHaveLength(0);

    state = partyReducer(state, {
      type: "ADD_CUSTOM_TOPIC", topic: { id: "c1", text: "Defenda que X" },
    });
    state = partyReducer(state, { type: "EDIT_CUSTOM_TOPIC", id: "c1", text: "Defenda que Y" });
    expect(state.devil?.customTopics[0].text).toBe("Defenda que Y");

    state = partyReducer(state, { type: "REMOVE_CUSTOM_TOPIC", id: "c1" });
    expect(state.devil?.customTopics).toHaveLength(0);
  });

  /**
   * A garantia mudou de "aparece primeiro" para "aparece, ponto".
   *
   * Com acervo finito, TODA tese do host entra — antes ela só tinha prioridade
   * numa lista que era re-sorteada e podia nunca chegar à roleta.
   */
  it("toda tese do host entra no acervo da partida", () => {
    let state = sala(3);
    for (let i = 0; i < 4; i += 1) {
      state = partyReducer(state, {
        type: "ADD_CUSTOM_TOPIC", topic: { id: `meu${i}`, text: `Tese ${i} do host` },
      });
    }
    state = partyReducer(state, { type: "START_GAME", now: 0 });

    const doHost = state.devil!.pool.filter((t) => t.source === "custom");
    expect(doHost.map((t) => t.id).sort()).toEqual(["meu0", "meu1", "meu2", "meu3"]);
  });

  it("sobrevivem a voltar para o lobby e recomeçar", () => {
    let state = partyReducer(sala(3), {
      type: "ADD_CUSTOM_TOPIC", topic: { id: "meu", text: "Defenda que X" },
    });
    state = partyReducer(state, { type: "START_GAME", now: 0 });
    state = partyReducer(state, { type: "RESET_TO_LOBBY" });
    expect(state.devil?.customTopics).toHaveLength(1);
  });
});

describe("placar final", () => {
  it("ordena por nota", () => {
    let state = ate(sala(3), "VOTING");
    state = { ...state, devil: { ...state.devil!, scores: { p0: 3.2, p1: 4.8, p2: 4.1 } } };
    expect(devilLeaderboard(state).map((linha) => linha.player.id)).toEqual(["p1", "p2", "p0"]);
  });
});
