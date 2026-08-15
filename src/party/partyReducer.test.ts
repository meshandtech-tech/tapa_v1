import { describe, expect, it } from "vitest";
import {
  canStart,
  canTransition,
  createPartyState,
  leaderboard,
  nextAvailableColor,
  partyReducer,
  roomCapacity,
  type PartyAction,
} from "./partyReducer";
import { currentQuestion } from "../games/quemErraPaga";
import { MAX_PLAYERS, PLAYER_COLORS, type PartyState, type Player } from "./types";

function makePlayer(id: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    nickname: id,
    color: PLAYER_COLORS[0],
    avatarSeed: id,
    score: 0,
    joinedAt: 1000,
    ...overrides,
  };
}

/**
 * Todos acertam a pergunta da rodada. Sem isto, ninguém responde — e não
 * responder conta como erro, então a roleta apareceria em toda rodada.
 */
function allAnswerCorrectly(state: PartyState): PartyState {
  const question = currentQuestion(state);
  const option = question?.correctAnswer ?? 0;
  return state.players.reduce(
    (acc, player) =>
      partyReducer(acc, { type: "ANSWER", playerId: player.id, optionIndex: option }),
    state,
  );
}

function withPlayers(count: number): PartyState {
  let state = createPartyState("1234", 0);
  for (let index = 0; index < count; index += 1) {
    state = partyReducer(state, {
      type: "PLAYER_JOIN",
      player: makePlayer(`p${index}`, {
        color: PLAYER_COLORS[index % PLAYER_COLORS.length],
        joinedAt: 1000 + index,
      }),
    });
  }
  return state;
}

describe("createPartyState", () => {
  it("nasce no lobby, sem jogadores e sem rodada", () => {
    const state = createPartyState("0042", 123);
    expect(state.phase).toBe("LOBBY");
    expect(state.players).toEqual([]);
    expect(state.round).toBe(0);
    expect(state.pin).toBe("0042");
  });
});

describe("entrada de jogadores", () => {
  it("adiciona um jogador zerando a pontuação", () => {
    const state = partyReducer(createPartyState("1234"), {
      type: "PLAYER_JOIN",
      player: makePlayer("a", { score: 99 }),
    });
    expect(state.players).toHaveLength(1);
    expect(state.players[0].score).toBe(0);
  });

  it("recusa apelido repetido, ignorando maiúsculas e espaços", () => {
    let state = partyReducer(createPartyState("1234"), {
      type: "PLAYER_JOIN",
      player: makePlayer("a", { nickname: "Nick" }),
    });
    state = partyReducer(state, {
      type: "PLAYER_JOIN",
      player: makePlayer("b", { nickname: "  nick " }),
    });
    expect(state.players).toHaveLength(1);
  });

  it("recusa apelido vazio", () => {
    const state = partyReducer(createPartyState("1234"), {
      type: "PLAYER_JOIN",
      player: makePlayer("a", { nickname: "   " }),
    });
    expect(state.players).toHaveLength(0);
  });

  it("respeita o teto de jogadores", () => {
    const full = withPlayers(MAX_PLAYERS);
    const state = partyReducer(full, { type: "PLAYER_JOIN", player: makePlayer("extra") });
    expect(state.players).toHaveLength(MAX_PLAYERS);
  });

  it("reentrar com o mesmo id atualiza em vez de duplicar e preserva a pontuação", () => {
    let state = withPlayers(1);
    state = partyReducer(state, { type: "SCORE", playerId: "p0", delta: 3 });
    state = partyReducer(state, {
      type: "PLAYER_JOIN",
      player: makePlayer("p0", { nickname: "Renomeado", score: 0 }),
    });
    expect(state.players).toHaveLength(1);
    expect(state.players[0].nickname).toBe("Renomeado");
    expect(state.players[0].score).toBe(3);
  });

  it("não aceita jogador novo depois que o jogo começou", () => {
    let state = withPlayers(2);
    state = partyReducer(state, { type: "START_GAME" });
    const after = partyReducer(state, { type: "PLAYER_JOIN", player: makePlayer("tarde") });
    expect(after.players).toHaveLength(2);
  });

  it("remove jogador que sai", () => {
    const state = partyReducer(withPlayers(2), { type: "PLAYER_LEAVE", playerId: "p0" });
    expect(state.players.map((player) => player.id)).toEqual(["p1"]);
  });
});

describe("atualização de jogador", () => {
  it("aplica o patch", () => {
    const state = partyReducer(withPlayers(1), {
      type: "PLAYER_UPDATE",
      playerId: "p0",
      patch: { avatarSeed: "novo-rosto" },
    });
    expect(state.players[0].avatarSeed).toBe("novo-rosto");
  });

  it("ignora patch de jogador inexistente", () => {
    const before = withPlayers(1);
    const after = partyReducer(before, {
      type: "PLAYER_UPDATE",
      playerId: "fantasma",
      patch: { nickname: "x" },
    });
    expect(after).toBe(before);
  });

  it("recusa renomear para um apelido já em uso", () => {
    const before = withPlayers(2);
    const after = partyReducer(before, {
      type: "PLAYER_UPDATE",
      playerId: "p1",
      patch: { nickname: "p0" },
    });
    expect(after).toBe(before);
  });
});

describe("pontuação", () => {
  it("nunca fica negativa", () => {
    const state = partyReducer(withPlayers(1), { type: "SCORE", playerId: "p0", delta: -5 });
    expect(state.players[0].score).toBe(0);
  });

  it("ignora delta não numérico", () => {
    const before = withPlayers(1);
    const after = partyReducer(before, {
      type: "SCORE",
      playerId: "p0",
      delta: Number.NaN,
    });
    expect(after).toBe(before);
  });
});

describe("início do jogo", () => {
  it("não começa abaixo do mínimo de jogadores", () => {
    const state = partyReducer(withPlayers(1), { type: "START_GAME" });
    expect(state.phase).toBe("LOBBY");
    expect(canStart(withPlayers(1))).toBe(false);
  });

  it("começa com o mínimo atendido", () => {
    const state = partyReducer(withPlayers(2), { type: "START_GAME" });
    expect(state.phase).toBe("GAME_INTRO");
  });

  it("respeita o mínimo maior de outro jogo", () => {
    let state = partyReducer(withPlayers(2), {
      type: "SET_GAME",
      gameId: "advogado-do-diabo",
    });
    state = partyReducer(state, { type: "START_GAME" });
    expect(state.phase).toBe("LOBBY");
  });
});

describe("configurações", () => {
  it("só mudam no lobby", () => {
    let state = partyReducer(withPlayers(2), { type: "START_GAME" });
    state = partyReducer(state, { type: "SET_DIFFICULTY", difficulty: "hard" });
    expect(state.settings.difficulty).toBe("medium");
  });
});

describe("lotação da sala", () => {
  // A contagem é derivada do roster; não existe mais teto configurável.
  it("aceita até o limite da plataforma", () => {
    expect(withPlayers(MAX_PLAYERS).players).toHaveLength(MAX_PLAYERS);
  });

  it("recusa o jogador seguinte ao encher", () => {
    const cheio = withPlayers(MAX_PLAYERS);
    const state = partyReducer(cheio, {
      type: "PLAYER_JOIN",
      player: makePlayer("intruso", { color: PLAYER_COLORS[5] }),
    });
    expect(state.players).toHaveLength(MAX_PLAYERS);
  });

  it("respeita o teto do jogo quando ele é menor", () => {
    expect(roomCapacity("pitch-no-escuro")).toBe(8);
    expect(roomCapacity("quem-erra-paga")).toBe(MAX_PLAYERS);
  });
});

describe("papel de host", () => {
  it("nasce sem host", () => {
    expect(createPartyState("1234", 0).hostPlayerId).toBeNull();
  });

  it("o primeiro a reivindicar leva", () => {
    const state = partyReducer(withPlayers(3), { type: "CLAIM_HOST", playerId: "p1" });
    expect(state.hostPlayerId).toBe("p1");
  });

  it("recusa um segundo pretendente", () => {
    let state = partyReducer(withPlayers(3), { type: "CLAIM_HOST", playerId: "p1" });
    state = partyReducer(state, { type: "CLAIM_HOST", playerId: "p2" });
    expect(state.hostPlayerId).toBe("p1");
  });

  it("ignora quem não está na sala", () => {
    const state = partyReducer(withPlayers(2), { type: "CLAIM_HOST", playerId: "fantasma" });
    expect(state.hostPlayerId).toBeNull();
  });

  // Sem transferência, a sala ficaria sem ninguém podendo pausar ou pular.
  it("passa o comando quando o host sai", () => {
    let state = partyReducer(withPlayers(3), { type: "CLAIM_HOST", playerId: "p1" });
    state = partyReducer(state, { type: "PLAYER_LEAVE", playerId: "p1" });
    expect(state.hostPlayerId).toBe("p0");
  });

  it("fica sem host se a sala esvazia", () => {
    let state = partyReducer(withPlayers(1), { type: "CLAIM_HOST", playerId: "p0" });
    state = partyReducer(state, { type: "PLAYER_LEAVE", playerId: "p0" });
    expect(state.hostPlayerId).toBeNull();
  });
});

describe("auto-host", () => {
  it("toda fase do jogo nasce com prazo", () => {
    let state = partyReducer(withPlayers(2), { type: "START_GAME", now: 1000 });
    expect(state.phaseDeadline).toBe(1000 + 6000); // GAME_INTRO

    state = partyReducer(state, { type: "ADVANCE", now: 7000 });
    expect(state.phase).toBe("ROUND_ACTIVE");
    expect(state.phaseDeadline).toBe(7000 + 20000);
  });

  // LOBBY e GAME_OVER esperam decisão humana, e é de propósito.
  it("lobby e fim de jogo não têm prazo", () => {
    expect(createPartyState("1234", 0).phaseDeadline).toBe(0);
    let state = partyReducer(withPlayers(2), { type: "START_GAME", now: 0 });
    state = partyReducer(state, { type: "RESET_TO_LOBBY" });
    expect(state.phaseDeadline).toBe(0);
  });

  it("pausar congela e retomar devolve o tempo que faltava", () => {
    let state = partyReducer(withPlayers(2), { type: "START_GAME", now: 1000 });
    expect(state.phaseDeadline).toBe(7000);

    state = partyReducer(state, { type: "PAUSE", now: 3000 });
    expect(state.pausedAt).toBe(3000);

    // Parado por 10s: o prazo anda 10s junto, senão a fase venceria na volta.
    state = partyReducer(state, { type: "RESUME", now: 13000 });
    expect(state.pausedAt).toBeNull();
    expect(state.phaseDeadline).toBe(17000);
  });

  it("não pausa duas vezes nem retoma sem pausa", () => {
    let state = partyReducer(withPlayers(2), { type: "START_GAME", now: 0 });
    state = partyReducer(state, { type: "PAUSE", now: 100 });
    const congelado = partyReducer(state, { type: "PAUSE", now: 500 });
    expect(congelado.pausedAt).toBe(100);

    const semPausa = partyReducer(withPlayers(2), { type: "RESUME", now: 100 });
    expect(semPausa.pausedAt).toBeNull();
  });

  it("avançar limpa a pausa", () => {
    let state = partyReducer(withPlayers(2), { type: "START_GAME", now: 0 });
    state = partyReducer(state, { type: "PAUSE", now: 100 });
    state = partyReducer(state, { type: "ADVANCE", now: 200 });
    expect(state.pausedAt).toBeNull();
  });
});

describe("tema da party", () => {
  it("nasce no preset padrão, em modo manual", () => {
    const state = createPartyState("1234", 0);
    expect(state.settings.themeId).toBe("red-hot");
    expect(state.settings.themeMode).toBe("manual");
  });

  // Ao contrário de jogo e dificuldade: o host troca a cor no meio da festa.
  it("SET_THEME vale em qualquer fase", () => {
    let state = partyReducer(withPlayers(2), { type: "START_GAME" });
    state = partyReducer(state, { type: "SET_THEME", themeId: "neon-purple" });
    expect(state.phase).toBe("GAME_INTRO");
    expect(state.settings.themeId).toBe("neon-purple");
  });

  it("SET_THEME muda só o campo enviado", () => {
    let state = createPartyState("1234", 0);
    state = partyReducer(state, { type: "SET_THEME", themeMode: "auto" });
    expect(state.settings.themeMode).toBe("auto");
    expect(state.settings.themeId).toBe("red-hot");
  });

  it("no modo auto, gira o preset ao entrar em ROUND_ACTIVE", () => {
    let state = partyReducer(withPlayers(2), { type: "SET_THEME", themeMode: "auto" });
    state = partyReducer(state, { type: "START_GAME" });
    expect(state.settings.themeId).toBe("red-hot");

    // GAME_INTRO -> ROUND_ACTIVE: primeira virada.
    state = partyReducer(state, { type: "ADVANCE" });
    expect(state.phase).toBe("ROUND_ACTIVE");
    expect(state.settings.themeId).toBe("emerald-green");

    // Todos acertam, para a rodada seguir sem passar pela roleta.
    state = allAnswerCorrectly(state);

    // A cor fica estável durante a rodada — não pisca no meio da pergunta.
    state = partyReducer(state, { type: "ADVANCE" });
    expect(state.phase).toBe("REVEAL_ANSWER");
    expect(state.settings.themeId).toBe("emerald-green");

    state = partyReducer(state, { type: "ADVANCE", forfeit: false });
    expect(state.phase).toBe("LEADERBOARD");
    expect(state.settings.themeId).toBe("emerald-green");

    // LEADERBOARD -> ROUND_ACTIVE: segunda virada.
    state = partyReducer(state, { type: "ADVANCE" });
    expect(state.phase).toBe("ROUND_ACTIVE");
    expect(state.settings.themeId).toBe("royal-blue");
  });

  it("no modo manual, a cor não se mexe sozinha", () => {
    let state = partyReducer(withPlayers(2), { type: "START_GAME" });
    for (let step = 0; step < 6; step += 1) {
      state = partyReducer(state, { type: "ADVANCE" });
      expect(state.settings.themeId).toBe("red-hot");
    }
  });

  it("dá a volta no ciclo de presets", () => {
    let state = partyReducer(withPlayers(2), { type: "SET_THEME", themeMode: "auto" });
    state = partyReducer(state, { type: "SET_THEME", themeId: "neon-purple" });
    state = partyReducer(state, { type: "START_GAME" });
    state = partyReducer(state, { type: "ADVANCE" });
    expect(state.settings.themeId).toBe("red-hot");
  });
});

describe("máquina de fases", () => {
  it("percorre o ciclo completo até GAME_OVER", () => {
    let state = partyReducer(withPlayers(2), { type: "START_GAME" });
    expect(state.phase).toBe("GAME_INTRO");

    state = partyReducer(state, { type: "ADVANCE" });
    expect(state.phase).toBe("ROUND_ACTIVE");
    expect(state.round).toBe(1);

    state = partyReducer(state, { type: "ADVANCE" });
    expect(state.phase).toBe("REVEAL_ANSWER");

    state = partyReducer(state, { type: "ADVANCE", forfeit: true });
    expect(state.phase).toBe("FORFEIT_WHEEL");

    state = partyReducer(state, { type: "ADVANCE" });
    expect(state.phase).toBe("LEADERBOARD");

    state = partyReducer(state, { type: "ADVANCE" });
    expect(state.phase).toBe("ROUND_ACTIVE");
    expect(state.round).toBe(2);
  });

  it("pula a roleta quando todo mundo acertou", () => {
    let state = partyReducer(withPlayers(2), { type: "START_GAME" });
    state = partyReducer(state, { type: "ADVANCE" });
    state = allAnswerCorrectly(state);
    state = partyReducer(state, { type: "ADVANCE" });
    state = partyReducer(state, { type: "ADVANCE" });
    expect(state.phase).toBe("LEADERBOARD");
  });

  it("manda para a roleta quem deixou o tempo acabar sem responder", () => {
    let state = partyReducer(withPlayers(2), { type: "START_GAME" });
    state = partyReducer(state, { type: "ADVANCE" });
    // Ninguém responde.
    state = partyReducer(state, { type: "ADVANCE" });
    state = partyReducer(state, { type: "ADVANCE", punishmentIndex: 5 });
    expect(state.phase).toBe("FORFEIT_WHEEL");
    expect(state.quiz?.punishmentIndex).toBe(5);
  });

  it("pula a roleta em jogo que não tem prendas, mesmo com forfeit", () => {
    let state = withPlayers(3);
    state = partyReducer(state, { type: "SET_GAME", gameId: "advogado-do-diabo" });
    state = partyReducer(state, { type: "START_GAME" });
    state = partyReducer(state, { type: "ADVANCE" });
    state = partyReducer(state, { type: "ADVANCE" });
    state = partyReducer(state, { type: "ADVANCE", forfeit: true });
    expect(state.phase).toBe("LEADERBOARD");
  });

  it("termina o jogo depois da última rodada", () => {
    let state = partyReducer(withPlayers(2), { type: "START_GAME" });
    state = partyReducer(state, { type: "ADVANCE" });
    // "quem-erra-paga" tem 10 rodadas. Todos acertam para pular a roleta.
    const jogarRodada = (input: PartyState) => {
      let next = partyReducer(allAnswerCorrectly(input), { type: "ADVANCE" });
      // A pegadinha do deck não tem resposta certa: todo mundo erra e a rodada
      // passa pela roleta, gastando um ADVANCE a mais que as demais.
      while (next.phase !== "ROUND_ACTIVE" && next.phase !== "GAME_OVER") {
        next = partyReducer(next, { type: "ADVANCE" });
      }
      return next;
    };
    for (let round = 1; round < 10; round += 1) state = jogarRodada(state);
    expect(state.round).toBe(10);
    state = jogarRodada(state);
    expect(state.phase).toBe("GAME_OVER");
  });

  it("GAME_OVER é terminal", () => {
    const over: PartyState = { ...withPlayers(2), phase: "GAME_OVER", round: 10 };
    expect(partyReducer(over, { type: "ADVANCE" })).toBe(over);
  });

  it("ADVANCE no lobby não faz nada — só START_GAME sai de lá", () => {
    const before = withPlayers(2);
    expect(partyReducer(before, { type: "ADVANCE" })).toBe(before);
  });

  it("toda ação desconhecida devolve o mesmo estado, nunca lança", () => {
    const before = withPlayers(2);
    const bogus = { type: "ISSO_NAO_EXISTE" } as unknown as PartyAction;
    expect(() => partyReducer(before, bogus)).not.toThrow();
    expect(partyReducer(before, bogus)).toBe(before);
  });

  it("a tabela de transições só permite os saltos declarados", () => {
    expect(canTransition("LOBBY", "GAME_INTRO")).toBe(true);
    expect(canTransition("LOBBY", "ROUND_ACTIVE")).toBe(false);
    expect(canTransition("REVEAL_ANSWER", "FORFEIT_WHEEL")).toBe(true);
    expect(canTransition("GAME_OVER", "LOBBY")).toBe(false);
  });
});

describe("voltar ao lobby", () => {
  it("zera as pontuações e mantém os jogadores", () => {
    let state = partyReducer(withPlayers(2), { type: "SCORE", playerId: "p0", delta: 5 });
    state = partyReducer(state, { type: "START_GAME" });
    state = partyReducer(state, { type: "RESET_TO_LOBBY" });
    expect(state.phase).toBe("LOBBY");
    expect(state.round).toBe(0);
    expect(state.players.every((player) => player.score === 0)).toBe(true);
    expect(state.players).toHaveLength(2);
  });
});

describe("utilitários", () => {
  it("nextAvailableColor pula as cores já usadas", () => {
    const state = withPlayers(2);
    expect(nextAvailableColor(state.players)).toBe(PLAYER_COLORS[2]);
  });

  it("leaderboard ordena por pontos e desempata por quem chegou antes", () => {
    let state = withPlayers(3);
    state = partyReducer(state, { type: "SCORE", playerId: "p2", delta: 5 });
    state = partyReducer(state, { type: "SCORE", playerId: "p1", delta: 5 });
    expect(leaderboard(state).map((player) => player.id)).toEqual(["p1", "p2", "p0"]);
  });
});
