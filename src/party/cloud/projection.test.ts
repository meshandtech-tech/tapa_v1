import { describe, expect, it } from "vitest";
import { projectSnapshot } from "./projection";
import { votesIn, eligibleVoters, currentTopic } from "../../games/advogadoDoDiabo";
import { roundOutcome } from "../../games/quemErraPaga";
import { chainSurvived } from "../../games/drawing/state";
import type { RoomSnapshot } from "./snapshot";
import type { GameId } from "../types";

/**
 * O teste que estava faltando.
 *
 * Nove lacunas passaram por todos os testes anteriores porque todos falavam
 * com o BANCO por RPC — e as nove moravam na fronteira banco↔tela: o dado
 * existia, e sumia no caminho até a UI. `room_snapshot` não devolvia, ou
 * `projectSnapshot` descartava.
 *
 * Cinco delas seriam pegas aqui:
 *   - votos que não chegavam (host via "faltam 7 votos" para sempre)
 *   - respostas que não chegavam (quiz dizia que ninguém acertou)
 *   - `acceptedAnswers` vazio (revelação discordava do placar)
 *   - disclaimer e instruções fixos em `true`
 *   - `usedSlideIds` sempre vazio
 *
 * A regra deste arquivo: NÃO afirmar "não deu erro". Afirmar que o campo que a
 * TELA lê chegou com o valor que o BANCO mandou. Foi tratar ausência de erro
 * como prova de funcionamento que deixou tudo isso passar.
 */

function snapshotBase(gameId: GameId): RoomSnapshot {
  return {
    room: {
      id: "room-1",
      pin: "123456",
      gameId,
      phase: "LOBBY",
      phaseEndsAt: null,
      pausedAt: null,
      round: 1,
      settings: { difficulty: "medium", themeId: "punch", themeMode: "manual" },
      hostPlayerId: "p0",
      closedAt: null,
    },
    me: { playerId: "p0", submitted: false },
    players: [0, 1, 2, 3].map((i) => ({
      id: `p${i}`,
      nickname: `Jogador${i}`,
      color: "#ff5c8a",
      avatarSeed: `s${i}`,
      score: i,
      joinedAt: new Date(1000 + i).toISOString(),
      lastSeenAt: new Date(2000 + i).toISOString(),
    })),
    match: {
      id: "match-1",
      gameId,
      seatOrder: ["p0", "p1", "p2", "p3"],
      stepIndex: 0,
      stepCount: 4,
      submittedPlayerIds: ["p0"],
      presenterIndex: 0,
      revealChainIndex: 0,
      revealPageIndex: 0,
      revealAutoplay: false,
      questionOrder: [7, 3, 1],
      slideIds: ["s1", "s2"],
      usedSlideIds: ["s1", "s2", "s9"],
      punishmentIndex: 5,
      topicCandidates: ["custom:c1", "default:h2"],
      topicWinner: 1,
    },
    assignment: null,
    votes: { p1: 4, p2: 5, p3: 3 },
    scores: { p0: 4.5 },
    answers: { p0: 1, p1: 2, p2: 1 },
    topics: [
      { id: "c1", source: "custom", text: "Tese do host", position: 0,
        usedAt: null, rejectedAt: null, presenterId: null },
      { id: "h2", source: "default", text: "Tese do sistema", position: 1,
        usedAt: null, rejectedAt: null, presenterId: null },
    ],
    chains: [],
    serverTime: new Date(5000).toISOString(),
  };
}

describe("projeção: o que a tela lê chega do banco", () => {
  describe("Advogado do Diabo", () => {
    it("entrega os votos que o host usa para contar quem falta", () => {
      const snap = snapshotBase("advogado-do-diabo");
      snap.room.phase = "VOTING";
      const state = projectSnapshot(snap);

      // `DevilHostActions.tsx:25` faz exatamente esta conta. Com `votes: {}`
      // fixo, `votesIn` dava 0 e o host via "faltam 3 votos" para sempre —
      // mesmo com os três já tendo votado.
      expect(votesIn(state)).toBe(3);
      expect(eligibleVoters(state).length - votesIn(state)).toBe(0);
    });

    it("entrega a nota do apresentador", () => {
      const snap = snapshotBase("advogado-do-diabo");
      snap.room.phase = "SCORE_REVEAL";
      const state = projectSnapshot(snap);
      // `AdvogadoDoDiaboHost.tsx:304`
      expect(state.devil?.scores.p0).toBe(4.5);
    });

    it("casa a fatia vencedora com o tema certo, por identidade", () => {
      const state = projectSnapshot(snapshotBase("advogado-do-diabo"));
      // `topicWinner: 1` aponta para "default:h2". Se o casamento fosse por
      // posição em vez de `source:id`, cairia na tese do host.
      const tema = currentTopic(state);
      expect(tema?.id).toBe("h2");
      expect(tema?.source).toBe("default");
      expect(tema?.text).toBe("Tese do sistema");
    });

    it("não aceita o aviso sozinha", () => {
      const state = projectSnapshot(snapshotBase("advogado-do-diabo"));
      // Era `true` fixo, e por isso a tela de aviso nunca aparecia.
      expect(state.devil?.disclaimerAccepted).toBe(false);

      const aceito = snapshotBase("advogado-do-diabo");
      aceito.room.settings = { ...aceito.room.settings, disclaimerAccepted: true };
      expect(projectSnapshot(aceito).devil?.disclaimerAccepted).toBe(true);
    });
  });

  describe("Quem Erra, Paga", () => {
    it("entrega as respostas que decidem quem acertou", () => {
      const snap = snapshotBase("quem-erra-paga");
      snap.room.phase = "REVEAL_ANSWER";
      const state = projectSnapshot(snap);

      // `roundOutcome` (`quemErraPaga.ts:41`) lê `quiz.answers`. Com `{}` fixo
      // todo mundo caía em `pending` e a revelação dizia que ninguém acertou.
      const { correct, wrong, pending } = roundOutcome(state);
      expect(pending.map((p) => p.id)).toEqual(["p3"]);
      expect(correct.length + wrong.length).toBe(4);
      expect(state.quiz?.answers).toEqual({ p0: 1, p1: 2, p2: 1 });
    });

    it("entrega a prenda sorteada", () => {
      const snap = snapshotBase("quem-erra-paga");
      snap.room.phase = "FORFEIT_WHEEL";
      expect(projectSnapshot(snap).quiz?.punishmentIndex).toBe(5);
    });
  });

  describe("Pitch no Escuro", () => {
    it("lembra os slides já usados", () => {
      const state = projectSnapshot(snapshotBase("improv-slides"));
      // Era `[]` fixo, então o acervo repetia entre partidas.
      expect(state.slides?.usedSlideIds).toEqual(["s1", "s2", "s9"]);
      expect(state.slides?.slideIds).toEqual(["s1", "s2"]);
    });

    it("não marca as instruções como lidas sozinha", () => {
      expect(projectSnapshot(snapshotBase("improv-slides")).slides?.instructionsSeen)
        .toBe(false);
    });

    it("entrega votos e notas", () => {
      const snap = snapshotBase("improv-slides");
      snap.room.phase = "VOTING";
      const state = projectSnapshot(snap);
      expect(Object.keys(state.slides?.votes ?? {})).toHaveLength(3);
      expect(state.slides?.scores.p0).toBe(4.5);
    });
  });

  describe("Telefone Sem Fio", () => {
    it("entrega as respostas aceitas, para o selo casar com o placar", () => {
      const snap = snapshotBase("drawing-telephone");
      snap.room.phase = "GAME_OVER";
      snap.chains = [{
        id: "c1",
        ownerPlayerId: "p0",
        position: 0,
        originalPrompt: "celular",
        acceptedAnswers: ["telefone", "smartphone"],
        countedAsMatch: false,
        pages: [
          { stepIndex: 0, kind: "drawing", playerId: "p0", storagePath: null,
            strokes: null, text: "", status: "submitted" },
          { stepIndex: 1, kind: "guess", playerId: "p1", storagePath: null,
            strokes: null, text: "Telefone!", status: "submitted" },
        ],
      }];

      const state = projectSnapshot(snap);
      const chain = state.drawing!.chains[0];
      expect(chain.acceptedAnswers).toEqual(["telefone", "smartphone"]);

      // `RevealScreen.tsx:149`. Com `acceptedAnswers: []` fixo, "Telefone!" não
      // casava com "celular", a tela dizia que a palavra não sobreviveu — e o
      // placar do banco dizia que sim.
      expect(chainSurvived(chain, state.drawing!.manualMatches)).toBe(true);
    });

    it("mantém o buraco no passo de quem não entregou", () => {
      const snap = snapshotBase("drawing-telephone");
      snap.room.phase = "GAME_OVER";
      snap.chains = [{
        id: "c1", ownerPlayerId: "p0", position: 0, originalPrompt: "gato",
        acceptedAnswers: [], countedAsMatch: false,
        pages: [
          { stepIndex: 0, kind: "drawing", playerId: "p0", storagePath: null,
            strokes: null, text: "", status: "submitted" },
          // passo 1 ausente de propósito
          { stepIndex: 2, kind: "drawing", playerId: "p2", storagePath: null,
            strokes: null, text: "", status: "submitted" },
        ],
      }];

      const pages = projectSnapshot(snap).drawing!.chains[0].pages;
      // O índice É o passo: se a projeção compactasse a lista, a página do
      // passo 2 viraria a do passo 1 e o caderno inteiro sairia deslocado.
      expect(pages[0]?.playerId).toBe("p0");
      expect(pages[1]).toBeUndefined();
      expect(pages[2]?.playerId).toBe("p2");
    });

    it("a partida sobrevive ao GAME_OVER", () => {
      const snap = snapshotBase("drawing-telephone");
      snap.room.phase = "GAME_OVER";
      const state = projectSnapshot(snap);
      // O bug da tela branca: `room_snapshot` procurava a partida VIVA, e no
      // GAME_OVER ela já tem `ended_at`. `drawing` vinha null e a tela final
      // não renderizava nada.
      expect(state.drawing).not.toBeNull();
      expect(state.drawing?.seatOrder).toHaveLength(4);
    });
  });

  describe("campos comuns", () => {
    it("traz fase, prazo, host e placar", () => {
      const snap = snapshotBase("quem-erra-paga");
      snap.room.phase = "ROUND_ACTIVE";
      snap.room.phaseEndsAt = new Date(90000).toISOString();
      const state = projectSnapshot(snap);

      expect(state.phase).toBe("ROUND_ACTIVE");
      expect(state.phaseDeadline).toBe(90000);
      expect(state.hostPlayerId).toBe("p0");
      expect(state.players.map((p) => p.score)).toEqual([0, 1, 2, 3]);
      expect(state.settings.gameId).toBe("quem-erra-paga");
      expect(state.settings.difficulty).toBe("medium");
    });

    it("fase sem prazo vira deadline 0, não NaN", () => {
      const state = projectSnapshot(snapshotBase("quem-erra-paga"));
      // A convenção de antes da migração. `Date.parse(null)` daria NaN e a
      // contagem na tela viraria "NaN".
      expect(state.phaseDeadline).toBe(0);
      expect(state.pausedAt).toBeNull();
    });
  });
});
