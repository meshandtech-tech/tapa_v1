/**
 * Teste de carga com jogadores DE VERDADE, nos quatro jogos.
 *
 * Cada "jogador" é um cliente Supabase próprio: sessão anônima própria,
 * websocket próprio, assinatura de Realtime própria. É o mais perto que dá
 * chegar do playtest sem juntar gente numa sala.
 *
 * O que ele NÃO cobre, e é importante saber: a UI React, o canvas, o Safari.
 * Isto exercita o BANCO e o REALTIME sob concorrência real.
 *
 * Uso:
 *   node scripts/stress-players.mjs                 # 8 jogadores, 4 jogos
 *   node scripts/stress-players.mjs 10              # 10 jogadores
 *   node scripts/stress-players.mjs 8 drawing-telephone
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const N = Number(process.argv[2] ?? 8);
const SO_ESTE = process.argv[3];
const JOGOS = ["drawing-telephone", "quem-erra-paga", "advogado-do-diabo", "improv-slides"];

const env = Object.fromEntries(
  readFileSync(".env", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const URL = env.VITE_SUPABASE_URL, KEY = env.VITE_SUPABASE_ANON_KEY;
if (!URL || !KEY) { console.error("faltam credenciais no .env"); process.exit(1); }

const V = "\x1b[32m✓\x1b[0m", X = "\x1b[31m✗\x1b[0m", A = "\x1b[33m!\x1b[0m";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Métricas acumuladas de toda a execução — viram o audit no fim. */
const M = {
  rpc: 0,
  rpcFailedAttempts: 0,
  retries: 0,
  erros: [],
  latencias: [],
  jogos: {},
};

/**
 * Chamada com retry.
 *
 * O primeiro stress caiu por falta disto: uma rajada de 8 clientes gera falha
 * transitória, e sem retry o script morre e parece bug do banco. Retry aqui é
 * honestidade de instrumentação, não de produto — o retry do APP fica em
 * `useCloudRoom`.
 */
async function rpc(p, fn, args, tentativas = 3) {
  for (let i = 1; i <= tentativas; i++) {
    M.rpc++;
    const inicio = performance.now();
    let data, error;
    try {
      ({ data, error } = await p.sb.rpc(fn, args));
    } catch (cause) {
      error = { message: cause instanceof Error ? cause.message : String(cause) };
    } finally {
      M.latencias.push(performance.now() - inicio);
    }
    if (!error) return { data };
    M.rpcFailedAttempts++;
    if (i === tentativas) { M.erros.push(`${fn}: ${error.code ?? ""} ${error.message}`); return { error }; }
    M.retries++;
    await sleep(120 * i);
  }
}

async function criarJogador(nome) {
  const sb = createClient(URL, KEY, {
    auth: { persistSession: false },
    realtime: { params: { eventsPerSecond: 10 } },
  });
  let data, error;
  let espera = 900;
  const tentativas = 8;
  for (let i = 1; i <= tentativas; i++) {
    ({ data, error } = await sb.auth.signInAnonymously());
    if (!error) break;
    if (!/rate limit/i.test(error.message) || i === tentativas) {
      throw new Error(`${nome}: ${error.message}`);
    }
    await sleep(espera / 2 + Math.random() * espera);
    espera = Math.min(8000, espera * 2);
  }
  return { nome, sb, uid: data.user.id, eventos: 0, bytes: 0, maiorEvento: 0,
           erroCanal: 0, assinado: false, nuncaVoltou: false };
}

/** Assina como o app assina: três tabelas pequenas, filtradas pela sala. */
function assinar(p, roomId) {
  return new Promise((resolve) => {
    const conta = (m) => {
      const n = JSON.stringify(m).length;
      p.eventos++; p.bytes += n;
      if (n > p.maiorEvento) p.maiorEvento = n;
    };
    const ch = p.sb.channel(`room:${roomId}:${p.nome}:${Math.random()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms",   filter: `id=eq.${roomId}` }, conta)
      .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `room_id=eq.${roomId}` }, conta)
      .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `room_id=eq.${roomId}` }, conta)
      .subscribe((s) => {
        // Erro de canal ACONTECE — rede de bar, serviço com soluço. O que
        // importa não é se aconteceu, é se o cliente VOLTOU. Era a falta de
        // volta que matava a arquitetura antiga: o adapter marcava o canal
        // como morto e nunca mais tentava.
        if (s === "SUBSCRIBED") { p.assinado = true; resolve(ch); }
        if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
          p.erroCanal++;
          p.assinado = false;
        }
        if (s === "CLOSED") p.assinado = false;
      });
    p.canal = ch;
  });
}

/** PNG 1x1 real — o Storage recusa MIME que não bate. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64");

function desenho() {
  return { v: 2, g: 2048, s: Array.from({ length: 40 }, (_, k) =>
    [0, 28, k % 8, ...Array.from({ length: 60 }, (_, i) => (i * 37 + k * 13) % 2048)]) };
}

// ---------------------------------------------------------------------------
async function rodar(gameId) {
  const res = { gameId, ok: [], falhas: [], avisos: [], fases: new Set(), passos: 0 };
  const reg = (cond, msg) => (cond ? res.ok : res.falhas).push(msg);
  const t0 = Date.now();

  // Espaçado de propósito: o Supabase limita cadastro anônimo POR IP, e criar
  // 8 de uma vez estourou o limite no terceiro jogo da primeira execução.
  const jogadores = [];
  for (let i = 0; i < N; i++) {
    jogadores.push(await criarJogador(`p${i}`));
    await sleep(250);
  }
  const host = jogadores[0];

  let roomId = null;
  const abortar = async (mensagem) => {
    res.falhas.push(mensagem);
    if (roomId) await rpc(host, "close_room", { p_room: roomId });
    for (const p of jogadores) {
      if (p.canal) try { await p.sb.removeChannel(p.canal); } catch {}
    }
    res.ms = Date.now() - t0;
    res.bytesMax = Math.max(0, ...jogadores.map((p) => p.bytes));
    res.maiorMsg = Math.max(0, ...jogadores.map((p) => p.maiorEvento));
    res.errosCanal = jogadores.reduce((total, p) => total + p.erroCanal, 0);
    res.eventos = Math.max(0, ...jogadores.map((p) => p.eventos));
    M.jogos[gameId] = res;
    return res;
  };

  const PIN = String(Math.floor(1000 + Math.random() * 9000));
  let r = await rpc(host, "create_room", { p_pin: PIN, p_game_id: gameId });
  if (r.error) return abortar(`create_room: ${r.error.message}`);
  roomId = r.data.id;

  for (const [i, p] of jogadores.entries()) {
    const j = await rpc(p, "join_room", {
      p_pin: PIN, p_nickname: `Jogador${i}`, p_color: `#f${i}5c8a`, p_avatar_seed: `s${i}` });
    if (j.error || j.data?.error) {
      return abortar(`join ${p.nome}: ${j.error?.message ?? j.data?.error}`);
    }
    p.playerId = j.data.player_id;
  }
  await Promise.all(jogadores.map((p) => assinar(p, roomId)));
  reg(true, `${N} jogadores conectados com websocket`);

  // Conteúdo que o TS normalmente fornece.
  const payload = { p_room: roomId };
  if (gameId === "drawing-telephone")
    payload.p_prompts = Array.from({ length: N }, (_, i) => ({ id: `t${i}`, text: `tema ${i}`, acceptedAnswers: [] }));
  if (gameId === "advogado-do-diabo")
    payload.p_topics = Array.from({ length: 10 }, (_, i) => ({ id: `h${i}`, source: i < 3 ? "custom" : "default", text: `tese ${i}` }));
  if (gameId === "quem-erra-paga") {
    payload.p_question_order = Array.from({ length: 5 }, (_, i) => i);
    payload.p_correct = [1, 2, 0, 3, 1];
    // Sem isto o banco não tem de onde sortear e a roleta de prendas não
    // acontece — foi assim que ela sumiu sem ninguém notar.
    payload.p_punishment_count = 24;
  }
  if (gameId === "improv-slides") payload.p_slide_ids = ["s1", "s2", "s3", "s4", "s5"];

  r = await rpc(host, "start_match", payload);
  if (r.error) return abortar(`start_match: ${r.error.message}`);

  // -------------------------------------------------------------------------
  // Motor genérico: olha a fase, faz o que ela pede, avança.
  // -------------------------------------------------------------------------
  const temasVistos = [];
  const arquivos = [];
  let caiu = null, guarda = 0, subiuImagem = false;

  while (guarda++ < 400) {
    const s = await rpc(host, "room_snapshot", { p_room: roomId });
    if (s.error) { res.falhas.push(`room_snapshot na volta ${guarda}`); break; }
    const { room, match } = s.data;
    res.fases.add(room.phase);
    if (room.phase === "GAME_OVER") break;

    const ativos = jogadores.filter((p) => p !== caiu);

    // Um jogador some no meio e volta — reconexão sob carga.
    if (guarda === 6 && !caiu) { caiu = jogadores[3]; await caiu.sb.removeChannel(caiu.canal); }
    else if (guarda === 12 && caiu) {
      await assinar(caiu, roomId);
      const v = await rpc(caiu, "join_room", {
        p_pin: PIN, p_nickname: "Jogador3", p_color: "#f35c8a", p_avatar_seed: "s3" });
      reg(!v.data?.error, `reconexão no meio da partida (${v.data?.error ?? "voltou"})`);
      caiu = null;
    }

    // Ação da fase — todo mundo ao MESMO tempo, que é a rajada real.
    if (room.phase === "DRAW_STEP" || room.phase === "GUESS_STEP") {
      res.passos++;
      const desenhando = room.phase === "DRAW_STEP";
      const envios = await Promise.all(ativos.map((p) => rpc(p, "submit_contribution", {
        p_room: roomId,
        ...(desenhando ? { p_strokes: desenho() } : { p_text: `palpite ${p.nome} ${match.stepIndex}` }) })));
      const rec = envios.filter((e) => e.error || e.data?.skipped);
      if (rec.length) res.falhas.push(`passo ${match.stepIndex}: ${rec.length} entregas recusadas`);

      // O caminho da IMAGEM, exercitado uma vez por partida.
      //
      // Nenhum teste tinha passado por aqui: o script só mandava traços, então
      // `attach_drawing` nunca rodou. É justamente o caminho que põe o desenho
      // de verdade no caderno — se estiver quebrado, tudo cai no fallback de
      // traços e só as métricas denunciam, depois da festa.
      if (desenhando && !subiuImagem) {
        subiuImagem = true;
        const caminho = `${PIN}/${match.id}/${match.stepIndex}-${host.playerId}.png`;
        const { error: upErr } = await host.sb.storage.from("tapa-desenhos")
          .upload(caminho, PNG, { contentType: "image/png", upsert: true });
        if (upErr) {
          res.falhas.push(`upload para o Storage: ${upErr.message}`);
        } else {
          const att = await rpc(host, "attach_drawing", {
            p_room: roomId, p_step: match.stepIndex, p_storage_path: caminho });
          reg(!att.error, `attach_drawing (${att.error?.message ?? "ok"})`);
          arquivos.push(caminho);
        }
      }
    } else if (room.phase === "ROUND_ACTIVE") {
      res.passos++;
      await Promise.all(ativos.map((p, i) => rpc(p, "submit_answer", { p_room: roomId, p_option: i % 4 })));
    } else if (room.phase === "VOTING") {
      res.passos++;
      await Promise.all(ativos.map((p) => rpc(p, "submit_vote", { p_room: roomId, p_rating: 1 + (guarda % 5) })));
    } else if (room.phase === "TOPIC_REVEAL" && match) {
      const chave = match.topicCandidates?.[match.topicWinner];
      if (chave) temasVistos.push(chave);
    }

    // Avanço concorrente: todos pedem, um só pode valer.
    const pedidos = await Promise.all(ativos.map((p) => rpc(p, "advance_phase", {
      p_room: roomId, p_expected_phase: room.phase,
      p_expected_ends_at: room.phaseEndsAt, p_force: p === host })));
    // NÃO comparar as fases devolvidas entre si: oito chamadas concorrentes
    // leem instantes diferentes por definição — quem chega antes do avanço vê
    // a fase antiga, quem chega depois vê a nova. Isso é o comportamento
    // correto, e afirmar o contrário só gera ruído (13 falsos alarmes na
    // primeira execução). A convergência é verificada UMA vez, no fim.
    const semResposta = pedidos.filter((x) => x.error).length;
    if (semResposta) res.falhas.push(`${semResposta} advance_phase sem resposta`);
  }

  const fim = await rpc(host, "room_snapshot", { p_room: roomId });
  const faseFinal = fim.data?.room?.phase;
  reg(faseFinal === "GAME_OVER", `terminou em ${faseFinal} (${guarda} voltas)`);

  // -------------------------------------------------------------------------
  // Checagens específicas
  // -------------------------------------------------------------------------
  if (gameId === "drawing-telephone" && fim.data) {
    const cad = fim.data.chains;
    const passos = fim.data.match?.stepCount ?? 0;
    reg(cad.length === N, `${cad.length} cadernos (esperado ${N})`);

    // As checagens abaixo SÓ valem se houver caderno. `[].filter(...)` dá 0 e
    // passava exatamente no caso pior — quando a foto voltava vazia. Um teste
    // que mente positivo é pior que não ter teste.
    if (cad.length === 0) {
      res.falhas.push("sem cadernos: integridade não pôde ser verificada");
    } else {
      const incompletos = cad.filter((c) => c.pages.length !== passos).length;
      reg(incompletos === 0, `${cad.length} cadernos com ${passos} páginas cada (${incompletos} com buraco)`);
      const dup = cad.filter((c) => new Set(c.pages.map((p) => p.playerId)).size !== c.pages.length).length;
      reg(dup === 0, `sem página duplicada (${dup} cadernos com autor repetido)`);
      const semAceitas = cad.filter((c) => !Array.isArray(c.acceptedAnswers)).length;
      reg(semAceitas === 0, `respostas aceitas presentes (${semAceitas} cadernos sem)`);
    }
    const st = {};
    for (const c of cad) for (const p of c.pages) st[p.status] = (st[p.status] ?? 0) + 1;
    res.avisos.push(`páginas: ${JSON.stringify(st)}`);
  }

  if (gameId === "drawing-telephone" && arquivos.length > 0 && fim.data) {
    // Não basta o upload ter dado 200: a contribuição tem de APONTAR para o
    // arquivo. Afirmar só o upload seria medir a metade fácil.
    const comImagem = fim.data.chains
      .flatMap((c) => c.pages)
      .filter((p) => p.storagePath);
    reg(comImagem.length > 0,
        `${comImagem.length} páginas com imagem no Storage (esperado ao menos 1)`);
  }

  if (gameId === "quem-erra-paga") {
    // A mecânica que dá nome ao jogo. Ela tinha sumido do `advance_phase`.
    reg(res.fases.has("FORFEIT_WHEEL"), "roleta de prendas apareceu");
  }

  if (gameId === "advogado-do-diabo") {
    const unicos = new Set(temasVistos);
    reg(unicos.size === temasVistos.length,
        `nenhuma tese repetida (${temasVistos.length} sorteadas, ${unicos.size} únicas)`);
  }

  if (fim.data) {
    const placar = fim.data.players.map((p) => p.score);
    res.avisos.push(`placar final: [${placar.join(", ")}]`);
  }

  // Convergência: todos os clientes veem a mesma coisa?
  const visoes = await Promise.all(jogadores.map((p) => rpc(p, "room_snapshot", { p_room: roomId })));
  const fases = new Set(visoes.map((v) => v.data?.room?.phase).filter(Boolean));
  reg(fases.size === 1, `todos convergiram (${[...fases].join(", ") || "sem resposta"})`);

  // O crash de terça foi UMA MENSAGEM passando de 256 kB, não tráfego somado.
  // Medir o acumulado e chamar de teto confundia as duas coisas: 250 kB ao
  // longo de 100 segundos são 2,5 kB/s, o que é irrelevante. O que importa é
  // a MAIOR mensagem individual.
  const maior = Math.max(...jogadores.map((p) => p.bytes));
  const maiorMsg = Math.max(...jogadores.map((p) => p.maiorEvento));
  reg(maiorMsg < 32 * 1024,
      `maior mensagem de Realtime: ${(maiorMsg / 1024).toFixed(1)} kB`);
  res.avisos.push(`tráfego acumulado: ${(maior / 1024).toFixed(1)} kB por cliente na partida inteira`);
  // A asserção é sobre a RECUPERAÇÃO, não sobre o erro. Contar erro bruto
  // reprovava um soluço que o cliente absorveu sozinho — medir o sintoma em
  // vez do resultado.
  const totalErros = jogadores.reduce((a, p) => a + p.erroCanal, 0);
  const mudos = jogadores.filter((p) => p.eventos === 0);
  const fora = jogadores.filter((p) => !p.assinado);

  reg(fora.length === 0,
      `todos os canais ativos no fim (${fora.length} fora)`);
  reg(mudos.length === 0,
      `todos receberam eventos (${mudos.length} mudos)`);
  if (totalErros > 0) {
    res.avisos.push(`${totalErros} erro(s) de canal, todos recuperados`);
  }

  await rpc(host, "close_room", { p_room: roomId });
  if (arquivos.length) {
    try { await host.sb.storage.from("tapa-desenhos").remove(arquivos); } catch {}
  }
  for (const p of jogadores) { try { await p.sb.removeChannel(p.canal); } catch {} }

  res.ms = Date.now() - t0;
  res.bytesMax = maior;
  res.maiorMsg = maiorMsg;
  res.errosCanal = totalErros;
  res.eventos = Math.max(...jogadores.map((p) => p.eventos));
  M.jogos[gameId] = res;
  return res;
}

// ---------------------------------------------------------------------------
console.log(`\n\x1b[1mSTRESS — ${N} jogadores\x1b[0m\n`);
for (const g of (SO_ESTE ? [SO_ESTE] : JOGOS)) {
  console.log(`\x1b[1m${g}\x1b[0m`);
  const r = await rodar(g);
  for (const m of r.ok) console.log(`  ${V} ${m}`);
  for (const m of r.falhas) console.log(`  ${X} ${m}`);
  for (const m of r.avisos) console.log(`  ${A} ${m}`);
  console.log(`  fases: ${[...r.fases].join(" → ")}`);
  console.log(`  ${r.ms}ms, ${r.eventos} eventos, ${(r.bytesMax / 1024).toFixed(1)} kB\n`);
}

console.log("=".repeat(60));
console.log("\x1b[1mAUDIT\x1b[0m");
const todas = Object.values(M.jogos);
const falhas = todas.flatMap((r) => r.falhas.map((f) => `${r.gameId}: ${f}`));
const latencias = [...M.latencias].sort((a, b) => a - b);
const percentil = (p) => latencias.length
  ? latencias[Math.min(latencias.length - 1, Math.ceil(latencias.length * p) - 1)]
  : 0;
const media = latencias.length
  ? latencias.reduce((total, valor) => total + valor, 0) / latencias.length
  : 0;
console.log(`  chamadas RPC:      ${M.rpc}`);
console.log(`  tentativas falhas: ${M.rpcFailedAttempts}`);
console.log(`  retries:           ${M.retries} (${((M.retries / M.rpc) * 100).toFixed(2)}%)`);
console.log(`  erros persistentes:${M.erros.length}`);
console.log(`  latência média:    ${media.toFixed(1)} ms`);
console.log(`  latência p95:      ${percentil(0.95).toFixed(1)} ms`);
console.log(`  latência p99:      ${percentil(0.99).toFixed(1)} ms`);
console.log(`  maior msg realtime:${(Math.max(0, ...todas.map((r) => r.maiorMsg)) / 1024).toFixed(1)} kB`);
console.log(`  erros de canal:    ${todas.reduce((n, r) => n + r.errosCanal, 0)}`);
console.log(`  pior tráfego:      ${(Math.max(0, ...todas.map((r) => r.bytesMax)) / 1024).toFixed(1)} kB por cliente`);
console.log(`  jogos completos:   ${todas.filter((r) => r.fases.has("GAME_OVER")).length}/${todas.length}`);
console.log(falhas.length ? `\n\x1b[31mFALHAS (${falhas.length})\x1b[0m\n  - ${falhas.join("\n  - ")}`
                          : `\n\x1b[32mTUDO PASSOU\x1b[0m`);
process.exit(falhas.length ? 1 : 0);
