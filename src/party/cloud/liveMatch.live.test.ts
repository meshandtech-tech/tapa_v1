/**
 * A partida de 10 jogadores, de verdade, ponta a ponta.
 *
 * Este arquivo existe porque `scripts/stress-players.mjs` passou verde
 * enquanto o jogo estava 100% quebrado na rua. O motivo é o de sempre: ele
 * falava com o banco por RPC e olhava o que o banco respondia. O defeito não
 * estava no banco — estava DEPOIS dele, na fronteira foto→tela. `room_snapshot`
 * mandava a atribuição do passo; `projectSnapshot` a descartava; e
 * `assignmentFor` devolvia `null` para os dez celulares.
 *
 * Então a regra deste teste é: NÃO afirmar que a RPC não deu erro. Afirmar,
 * para CADA jogador, que o código de cliente de verdade — `projectSnapshot`
 * seguido de `assignmentFor` — devolve a tarefa que faz a tela abrir o canvas.
 * É exatamente a decisão que `TelefoneSemFioPlayer` toma, rodada com dez
 * sessões anônimas independentes contra o Supabase de verdade.
 *
 * Fora do `npm test` de propósito: fala com a rede, gasta cota de cadastro
 * anônimo e demora. Roda com `npm run test:live`.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { projectSnapshot } from "./projection";
import { assignmentFor } from "../../games/drawing/state";
import type { RoomSnapshot } from "./snapshot";

// O Vite carrega o `.env` e expõe o que tem prefixo `VITE_`. Sem as duas
// chaves o arquivo inteiro é pulado, em vez de falhar por falta de rede.
const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const N = Number(import.meta.env.VITE_TAPA_LIVE_PLAYERS ?? 10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Jogador {
  nome: string;
  sb: SupabaseClient;
  playerId?: string;
  /** Eventos de Realtime recebidos. Prova que a assinatura é independente. */
  eventos: number;
  bytes: number;
  maiorEvento: number;
  canal?: ReturnType<SupabaseClient["channel"]>;
}

/** Retry curto: uma rajada de 10 clientes gera falha transitória. */
async function rpc<T = unknown>(
  p: Jogador, fn: string, args: Record<string, unknown>, tentativas = 3,
): Promise<T> {
  let ultimo: unknown;
  for (let i = 1; i <= tentativas; i += 1) {
    const { data, error } = await p.sb.rpc(fn, args);
    if (!error) return data as T;
    ultimo = error;
    await sleep(150 * i);
  }
  throw new Error(`${p.nome} ${fn}: ${JSON.stringify(ultimo)}`);
}

async function criarJogador(nome: string): Promise<Jogador> {
  const sb = createClient(URL as string, KEY as string, {
    auth: { persistSession: false },
    realtime: { params: { eventsPerSecond: 10 } },
  });
  for (let i = 1; i <= 5; i += 1) {
    const { error } = await sb.auth.signInAnonymously();
    if (!error) break;
    if (i === 5) throw new Error(`${nome}: ${error.message}`);
    await sleep(2000 * i);
  }
  return { nome, sb, eventos: 0, bytes: 0, maiorEvento: 0 };
}

/** Assina como o app assina: três tabelas pequenas, filtradas pela sala. */
function assinar(p: Jogador, roomId: string): Promise<void> {
  return new Promise((resolve) => {
    const conta = (m: unknown) => {
      const n = JSON.stringify(m).length;
      p.eventos += 1;
      p.bytes += n;
      if (n > p.maiorEvento) p.maiorEvento = n;
    };
    const ch = p.sb
      .channel(`room:${roomId}:${p.nome}:${Math.random()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` }, conta)
      .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `room_id=eq.${roomId}` }, conta)
      .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `room_id=eq.${roomId}` }, conta)
      .subscribe((s) => {
        if (s === "SUBSCRIBED") resolve();
      });
    p.canal = ch;
  });
}

/** PNG 1x1 de verdade — o Storage recusa MIME que não bate com o conteúdo. */
function png(): Blob {
  const b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: "image/png" });
}

function desenho() {
  return {
    v: 2, g: 2048,
    s: Array.from({ length: 40 }, (_, k) =>
      [0, 28, k % 8, ...Array.from({ length: 60 }, (_, i) => (i * 37 + k * 13) % 2048)]),
  };
}

describe.skipIf(!URL || !KEY)(`partida ao vivo com ${N} jogadores`, () => {
  let jogadores: Jogador[] = [];
  let host: Jogador;
  let roomId = "";
  let PIN = "";
  /** Host apertou START → todo mundo com a primeira tarefa na mão. */
  let msAteTodosComTarefa = 0;
  let msUploadsSimultaneos = 0;
  let uploadsOk = 0;
  let fotoNaRevelacao = 0;
  let economiaNaRevelacao = 0;
  let migracao0013Aplicada = false;
  /** Caminho do último PNG que cada jogador subiu, por assento. */
  const caminhos: (string | null)[] = [];
  const fasesVistas = new Set<string>();
  const tamanhosDeFoto: number[] = [];

  beforeAll(async () => {
    jogadores = [];
    for (let i = 0; i < N; i += 1) {
      jogadores.push(await criarJogador(`p${i}`));
      // O Supabase limita cadastro anônimo POR IP, e uma festa sai do mesmo
      // wi-fi. Espaçar é o que o app também faz.
      await sleep(250);
    }
    host = jogadores[0];

    PIN = String(Math.floor(100000 + Math.random() * 899999));
    const sala = await rpc<{ id: string }>(host, "create_room", {
      p_pin: PIN, p_game_id: "drawing-telephone",
    });
    roomId = sala.id;

    for (const [i, p] of jogadores.entries()) {
      const j = await rpc<{ player_id?: string; error?: string }>(p, "join_room", {
        p_pin: PIN, p_nickname: `Jogador${i}`, p_color: "#ff5c8a", p_avatar_seed: `s${i}`,
      });
      if (j.error) throw new Error(`join ${p.nome}: ${j.error}`);
      p.playerId = j.player_id;
    }

    await Promise.all(jogadores.map((p) => assinar(p, roomId)));
  }, 180000);

  afterAll(async () => {
    for (const p of jogadores) {
      if (p.canal) await p.sb.removeChannel(p.canal);
      await p.sb.auth.signOut().catch(() => {});
    }
  }, 60000);

  /** A foto que ESTE jogador vê, já virada no estado que a tela consome. */
  async function tarefaDe(p: Jogador) {
    const snap = await rpc<RoomSnapshot>(p, "room_snapshot", { p_room: roomId });
    tamanhosDeFoto.push(JSON.stringify(snap).length);
    const state = projectSnapshot(snap);
    return { snap, state, assignment: assignmentFor(state, p.playerId!) };
  }

  it("todos entram e assinam com sessão própria", () => {
    expect(jogadores).toHaveLength(N);
    expect(new Set(jogadores.map((p) => p.playerId)).size).toBe(N);
  });

  it(`os ${N} recebem a PRIMEIRA tarefa — o travamento do playtest`, async () => {
    const t0 = Date.now();
    await rpc(host, "start_match", {
      p_room: roomId,
      p_prompts: Array.from({ length: N }, (_, i) => ({
        id: `t${i}`, text: `tema secreto ${i}`, acceptedAnswers: [`tema ${i}`],
      })),
    });
    // GAME_INTRO tem prazo próprio; o host pula, como o botão "Bora desenhar".
    await rpc(host, "advance_phase", { p_room: roomId, p_force: true });

    const tarefas = await Promise.all(jogadores.map(tarefaDe));
    msAteTodosComTarefa = Date.now() - t0;

    for (const { snap, assignment } of tarefas) {
      expect(snap.room.phase).toBe("DRAW_STEP");
      fasesVistas.add(snap.room.phase);
      // ESTA é a asserção que faltava. `null` aqui = tela de espera para todo
      // mundo, ninguém desenha, partida travada — o playtest inteiro.
      expect(assignment).not.toBeNull();
      expect(assignment!.stepType).toBe("draw");
      expect(assignment!.previous).toEqual({
        kind: "prompt", text: expect.stringContaining("tema secreto"),
      });
    }

    // Cada um com o SEU caderno: 10 jogadores, 10 cadernos distintos.
    const cadernos = new Set(tarefas.map((t) => t.assignment!.chain.id));
    expect(cadernos.size).toBe(N);
  }, 120000);

  /**
   * O host dá F5 no meio da rodada.
   *
   * É o teste que ninguém faz e que sempre acontece: o host esbarra no
   * navegador, recarrega, e a pergunta é se a festa sobrevive. Aqui isso é
   * simulado do jeito honesto — sessão preservada (é o que `persistSession`
   * faz no navegador), CLIENTE novo, e o fluxo de montagem refeito do zero:
   * achar a sala pelo PIN, pedir a foto, reassinar.
   */
  it("o host recarrega a página e nada se perde", async () => {
    const antes = await tarefaDe(host);

    const { data: sessao } = await host.sb.auth.getSession();
    expect(sessao.session).toBeTruthy();

    // A aba morreu. Cliente novo, websocket novo — só a sessão sobrevive.
    if (host.canal) await host.sb.removeChannel(host.canal);
    const novoSb = createClient(URL as string, KEY as string, {
      auth: { persistSession: false }, realtime: { params: { eventsPerSecond: 10 } },
    });
    await novoSb.auth.setSession({
      access_token: sessao.session!.access_token,
      refresh_token: sessao.session!.refresh_token,
    });
    host.sb = novoSb;

    // O fluxo de montagem do app: achar a sala PELO PIN, sem guardar nada.
    const { data: sala } = await novoSb
      .from("rooms").select("id").eq("pin", PIN).is("closed_at", null).maybeSingle();
    expect(sala?.id).toBe(roomId);

    await assinar(host, roomId);
    const depois = await tarefaDe(host);

    // A partida continua onde estava — nem reiniciou, nem pulou.
    expect(depois.snap.room.phase).toBe(antes.snap.room.phase);
    expect(depois.snap.match!.id).toBe(antes.snap.match!.id);
    expect(depois.snap.match!.stepIndex).toBe(antes.snap.match!.stepIndex);
    expect(depois.snap.match!.seatOrder).toEqual(antes.snap.match!.seatOrder);

    // Ninguém foi expulso.
    expect(depois.snap.players).toHaveLength(N);

    // O host continua sendo o host — e recupera os controles.
    expect(depois.snap.room.hostPlayerId).toBe(host.playerId);
    expect(depois.state.hostPlayerId).toBe(host.playerId);

    // E continua com a MESMA tarefa: o caderno não trocou de mão por causa
    // de um F5. `seat_order` é congelado justamente para isso.
    expect(depois.assignment).not.toBeNull();
    expect(depois.assignment!.chain.id).toBe(antes.assignment!.chain.id);
  }, 120000);

  it("os 10 desenhos sobem ao Storage ao mesmo tempo sem derrubar nada", async () => {
    const t0 = Date.now();
    const envios = await Promise.all(jogadores.map(async (p, i) => {
      const caminho = `${PIN}/${roomId}/step0-${i}-${Math.random().toString(36).slice(2)}.png`;
      const { error } = await p.sb.storage.from("tapa-desenhos")
        .upload(caminho, png(), { contentType: "image/png", upsert: true });
      return error ? null : caminho;
    }));
    msUploadsSimultaneos = Date.now() - t0;
    uploadsOk = envios.filter(Boolean).length;
    caminhos.length = 0;
    caminhos.push(...envios);

    // Uma rajada de 10 uploads é trivial para o Storage. Se ISTO falhar, o
    // problema é configuração do bucket, e a mensagem tem de dizer isso.
    expect(uploadsOk).toBe(N);
  }, 120000);

  it("o passo 0 sobrevive ao caos: timeout, refresh, queda, upload lento e ausente", async () => {
    const [p1, p2, p3, p4, p5, p6, p7, p8, p9, p10] = jogadores;

    // 1, 2, 8, 9 — entrega normal.
    for (const p of [p1, p2, p8, p9]) {
      await rpc(p, "submit_contribution", { p_room: roomId, p_strokes: desenho() });
    }

    // 3 — o prazo venceu com desenho na tela. O traço TEM de valer.
    await rpc(p3, "submit_contribution", {
      p_room: roomId, p_strokes: desenho(), p_status: "timeout",
    });

    // 4 — deu F5 antes de entregar: rebusca a foto e só então entrega.
    const depoisDoF5 = await tarefaDe(p4);
    expect(depoisDoF5.assignment).not.toBeNull();
    await rpc(p4, "submit_contribution", { p_room: roomId, p_strokes: desenho() });

    // 5 — caiu a rede e voltou. Reconectar é rebuscar a foto, nada mais.
    if (p5.canal) await p5.sb.removeChannel(p5.canal);
    await assinar(p5, roomId);
    const depoisDaQueda = await tarefaDe(p5);
    expect(depoisDaQueda.assignment).not.toBeNull();
    await rpc(p5, "submit_contribution", { p_room: roomId, p_strokes: desenho() });

    // 6 — dedo no Enviar no mesmo instante do auto-envio do prazo. Duas
    // chamadas concorrentes, UMA página. A unique do banco é a trava.
    const [a, b] = await Promise.all([
      rpc(p6, "submit_contribution", { p_room: roomId, p_strokes: desenho() }),
      rpc(p6, "submit_contribution", { p_room: roomId, p_strokes: desenho(), p_status: "timeout" }),
    ]);
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();

    // 7 — upload lento: a página nasce primeiro, a imagem chega depois.
    await rpc(p7, "submit_contribution", { p_room: roomId, p_strokes: desenho() });
    await sleep(300);
    await rpc(p7, "attach_drawing", {
      p_room: roomId, p_step: 0, p_storage_path: `${PIN}/lento.png`,
    });

    // 10 — não faz nada. O banco preenche no fechamento do passo.
    void p10;

    /**
     * A imagem chega DEPOIS da página, como no app: `submit_contribution`
     * cria a página com os traços, e `attach_drawing` anexa o PNG quando o
     * upload termina. É por isso que uma rede ruim custa a imagem e nunca a
     * página.
     */
    await Promise.all(jogadores.map((p, i) =>
      caminhos[i]
        ? rpc(p, "attach_drawing", { p_room: roomId, p_step: 0, p_storage_path: caminhos[i] })
        : Promise.resolve(null)));

    const antes = await tarefaDe(host);
    expect(antes.state.drawing!.submitted).toHaveLength(N - 1);

    // O host fecha o passo. `backfill_step` roda na MESMA transação.
    await rpc(host, "advance_phase", {
      p_room: roomId, p_expected_phase: "DRAW_STEP", p_force: true,
    });

    const depois = await tarefaDe(host);
    // `backfill_step` fecha o passo com TODO assento contabilizado — inclusive
    // o de p10, que não fez nada. Nem 9 (buraco na corrente), nem 11 (dupla).
    // A prova de que a página existe mesmo vem no fim, contando as páginas de
    // cada caderno na revelação.
    expect(new Set(depois.state.drawing!.submitted).size).toBe(N);
    fasesVistas.add(depois.snap.room.phase);
    expect(["PASSING", "GUESS_STEP"]).toContain(depois.snap.room.phase);
  }, 180000);

  it("vai do passo 1 até a revelação sem ninguém ficar sem tarefa", async () => {
    let voltas = 0;
    let passosJogados = 0;
    let paginasReveladas = 0;

    // A revelação sozinha são N cadernos x (passos + 2) páginas — com 10
    // jogadores, 120 viradas. Mais os 10 passos, os 10 PASSING e a abertura.
    const TETO = N * (N + 2) + 4 * N + 20;

    while (voltas++ < TETO) {
      const { snap } = await tarefaDe(host);
      const fase = snap.room.phase;
      fasesVistas.add(fase);
      if (fase === "GAME_OVER") break;

      if (fase === "DRAW_STEP" || fase === "GUESS_STEP") {
        passosJogados += 1;

        // TODO jogador, TODO passo: a tela abriria o canvas?
        const tarefas = await Promise.all(jogadores.map(tarefaDe));
        for (const { assignment } of tarefas) {
          expect(assignment).not.toBeNull();
          expect(assignment!.stepType).toBe(fase === "DRAW_STEP" ? "draw" : "guess");
        }
        // Cada passo distribui N cadernos distintos — um por pessoa, sem
        // duas pessoas no mesmo caderno e sem caderno órfão.
        expect(new Set(tarefas.map((t) => t.assignment!.chain.id)).size).toBe(N);

        // A rajada real: os dez entregando ao mesmo tempo.
        await Promise.all(jogadores.map((p) =>
          rpc(p, "submit_contribution", {
            p_room: roomId,
            ...(fase === "DRAW_STEP"
              ? { p_strokes: desenho() }
              : { p_text: `palpite ${p.nome} ${snap.match!.stepIndex}` }),
          })));

        // Passo de desenho: a imagem sobe e é anexada, como numa festa em que
        // o Storage está funcionando. Sem isto a revelação mediria só traços,
        // e o número não diria nada sobre o jogo de verdade.
        if (fase === "DRAW_STEP") {
          const passo = snap.match!.stepIndex;
          await Promise.all(jogadores.map(async (p, i) => {
            const caminho = `${PIN}/${roomId}/s${passo}-${i}-${Math.random().toString(36).slice(2)}.png`;
            const { error } = await p.sb.storage.from("tapa-desenhos")
              .upload(caminho, png(), { contentType: "image/png", upsert: true });
            if (error) return;
            await rpc(p, "attach_drawing", { p_room: roomId, p_step: passo, p_storage_path: caminho });
          }));
        }

        const cheio = await tarefaDe(host);
        expect(cheio.state.drawing!.submitted).toHaveLength(N);
      }

      if (fase === "REVEAL_PAGE" || fase === "REVEAL_INTRO") {
        // Na revelação quem vira a página é o host, uma de cada vez — é o
        // desenho do jogo. Disparar dez pedidos por página seria só ruído.
        paginasReveladas += 1;
        await rpc(host, "advance_phase", { p_room: roomId, p_force: true });
        continue;
      }

      // Avanço concorrente: os dez pedem no mesmo instante, um só pode valer.
      // É aqui que o compare-and-set precisa segurar.
      const antes = await tarefaDe(host);
      await Promise.all(jogadores.map((p) =>
        rpc(p, "advance_phase", {
          p_room: roomId,
          p_expected_phase: antes.snap.room.phase,
          p_expected_ends_at: antes.snap.room.phaseEndsAt,
          p_force: p === host,
        })));
    }

    const fim = await tarefaDe(host);
    fotoNaRevelacao = JSON.stringify(fim.snap).length;
    expect(fim.snap.room.phase).toBe("GAME_OVER");
    // O passo 0 foi jogado pelo teste do caos, acima. Este laço pega do 1 em
    // diante, então são `stepCount - 1` — e o último passo é escrito.
    expect(passosJogados).toBe(fim.state.drawing!.stepCount - 1);
    expect(paginasReveladas).toBeGreaterThan(0);

    // A revelação: N cadernos, cada um com uma página por passo.
    const chains = fim.state.drawing!.chains;
    expect(chains).toHaveLength(N);
    const passos = fim.state.drawing!.stepCount;
    for (const chain of chains) {
      const preenchidas = chain.pages.filter(Boolean).length;
      expect(preenchidas).toBe(passos);
      // Ninguém escreve duas vezes no mesmo caderno.
      const autores = chain.pages.filter(Boolean).map((p) => p.playerId);
      expect(new Set(autores).size).toBe(autores.length);
    }

    /**
     * O INVARIANTE: nenhuma página pode ser impossível de desenhar.
     *
     * Ou veio a imagem, ou vieram os traços, ou a página é reconhecidamente
     * vazia (`timeout`/`missed` — alguém não entregou, e a folha em branco faz
     * parte do jogo). O que NÃO pode existir é página que a revelação não
     * saiba mostrar.
     */
    for (const chain of chains) {
      for (const page of chain.pages.filter(Boolean)) {
        if (page.type !== "drawing") continue;
        const desenhavel = !!page.url || !!page.strokes || page.status !== "submitted";
        expect(desenhavel).toBe(true);
      }
    }

    /**
     * E a MEDIDA: quanto a revelação ainda carrega de graça.
     *
     * `DrawingReplay` descarta `strokes` sem ler quando existe `url`, então
     * toda página com imagem está viajando com um segundo desenho junto. Isto
     * calcula quanto a foto pesaria sem essa duplicata — que é exatamente o
     * que a migration 0013 faz no servidor.
     */
    const semDuplicata = JSON.stringify(fim.snap, (chave, valor) =>
      chave === "strokes" && valor ? undefined : valor);
    economiaNaRevelacao = fotoNaRevelacao - semDuplicata.length;
    const duplicadas = chains
      .flatMap((c) => c.pages.filter(Boolean))
      .filter((p) => p.type === "drawing" && p.url && p.strokes).length;
    migracao0013Aplicada = duplicadas === 0;

    expect([...fasesVistas]).toEqual(
      expect.arrayContaining(["DRAW_STEP", "GUESS_STEP", "PASSING", "REVEAL_PAGE", "GAME_OVER"]),
    );
  }, 600000);

  it("relatório", () => {
    const maiorFoto = Math.max(...tamanhosDeFoto);
    const maiorEvento = Math.max(...jogadores.map((p) => p.maiorEvento));
    const eventos = jogadores.reduce((s, p) => s + p.eventos, 0);
    console.log(`
  jogadores ......................... ${N}
  START → todos com tarefa .......... ${msAteTodosComTarefa} ms
  10 uploads simultâneos ............ ${msUploadsSimultaneos} ms  (${uploadsOk}/${N} ok)
  fases percorridas ................. ${[...fasesVistas].join(", ")}
  room_snapshot, maior .............. ${(maiorFoto / 1024).toFixed(1)} kB
  room_snapshot na revelação ........ ${(fotoNaRevelacao / 1024).toFixed(1)} kB
  maior evento de realtime .......... ${(maiorEvento / 1024).toFixed(2)} kB
  eventos recebidos (total) ......... ${eventos}
  assinaturas por cliente ........... 1 canal, 3 tabelas
  migration 0013 .................... ${migracao0013Aplicada
    ? "aplicada"
    : `PENDENTE — a revelação carrega ${(economiaNaRevelacao / 1024).toFixed(0)} kB `
      + `de desenho duplicado (${((economiaNaRevelacao / fotoNaRevelacao) * 100).toFixed(0)}% da foto), `
      + `rebuscados por ${N} aparelhos a cada virada de página`}`);
    // Um evento de Realtime é uma LINHA pequena. Se algum dia um desenho
    // voltar a entrar no canal, este número denuncia antes da festa.
    expect(maiorEvento).toBeLessThan(16 * 1024);
  });
});
