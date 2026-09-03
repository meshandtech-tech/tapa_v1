/**
 * Smoke read/write das migrations operacionais mais recentes no Supabase.
 *
 * Cria uma sala temporária de Pitch, prova as proteções pelo comportamento
 * público das RPCs e encerra a sala no `finally`. Não lê tabela interna nem
 * usa service role: é exatamente a permissão que os celulares têm.
 *
 *   npm run verify:production
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env", "utf8").split("\n")
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
    .map((line) => [
      line.slice(0, line.indexOf("=")).trim(),
      line.slice(line.indexOf("=") + 1).trim(),
    ]),
);

const URL = env.VITE_SUPABASE_URL;
const KEY = env.VITE_SUPABASE_ANON_KEY;
if (!URL || !KEY) throw new Error("faltam VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY no .env");

const clients = [];
let host = null;
let roomId = null;

function check(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`  ✓ ${message}`);
}

async function player(label) {
  const sb = createClient(URL, KEY, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInAnonymously();
  if (error || !data.user) throw new Error(`${label}: auth anônimo falhou: ${error?.message ?? "sem user"}`);
  const result = { label, sb, playerId: null };
  clients.push(result);
  return result;
}

async function rpc(client, fn, args) {
  const { data, error } = await client.sb.rpc(fn, args);
  if (error) throw new Error(`${client.label}/${fn}: ${error.message}`);
  return data;
}

async function snapshot(client) {
  const data = await rpc(client, "room_snapshot", { p_room: roomId });
  check(!data?.error, `${client.label} acessa o snapshot da sala`);
  return data;
}

async function advance() {
  const before = await snapshot(host);
  await rpc(host, "advance_phase", {
    p_room: roomId,
    p_expected_phase: before.room.phase,
    p_expected_ends_at: before.room.phaseEndsAt,
    p_force: true,
  });
  return snapshot(host);
}

try {
  console.log("\nVerificando Supabase de produção...\n");

  host = await player("host");
  const memberA = await player("member-a");
  const memberB = await player("member-b");
  const late = await player("late-arrival");

  const requestedPin = String(Math.floor(1000 + Math.random() * 9000));
  const room = await rpc(host, "create_room", {
    p_pin: requestedPin,
    p_game_id: "improv-slides",
  });
  roomId = room.id;
  check(Boolean(roomId && room.pin), "sala temporária criada");

  for (const [index, current] of [host, memberA, memberB].entries()) {
    const joined = await rpc(current, "join_room", {
      p_pin: room.pin,
      p_nickname: `Ready${index}`,
      p_color: ["#ff5c8a", "#44d19d", "#5b8def"][index],
      p_avatar_seed: `ready-${index}`,
    });
    check(!joined?.error && Boolean(joined?.player_id), `${current.label} entrou antes da partida`);
    current.playerId = joined.player_id;
  }

  const slidePool = Array.from({ length: 10 }, (_, index) => `ready-${index}`);
  await rpc(host, "start_match", { p_room: roomId, p_slide_ids: slidePool });
  let state = await snapshot(host);
  check(state.room.phase === "GAME_INTRO", "Pitch iniciou em GAME_INTRO");
  check(state.match.seatOrder.length === 3, "seat_order congelou os três participantes iniciais");
  check(state.match.slideIds.length === 0, "acervo não vaza como apresentação antes do primeiro turno");

  const lateJoin = await rpc(late, "join_room", {
    p_pin: room.pin,
    p_nickname: "ReadyLate",
    p_color: "#ffd166",
    p_avatar_seed: "ready-late",
  });
  check(!lateJoin?.error && Boolean(lateJoin?.player_id), "jogador tardio entrou na sala");
  late.playerId = lateJoin.player_id;
  check(!state.match.seatOrder.includes(late.playerId), "jogador tardio ficou fora da partida ativa");

  state = await advance();
  check(state.room.phase === "PLAYER_SPIN", "GAME_INTRO avançou para PLAYER_SPIN");
  const firstPresentation = [...state.match.slideIds];
  check(firstPresentation.length === 5 && new Set(firstPresentation).size === 5,
    "primeira apresentação recebeu cinco slides persistidos e únicos");
  const refreshedPresentation = (await snapshot(host)).match.slideIds;
  check(JSON.stringify(refreshedPresentation) === JSON.stringify(firstPresentation),
    "refresh mantém exatamente os mesmos slides");
  state = await advance();
  check(state.room.phase === "PLAYER_REVEAL", "PLAYER_SPIN avançou para PLAYER_REVEAL");
  state = await advance();
  check(state.room.phase === "PREPARATION", "PLAYER_REVEAL avançou para PREPARATION");

  const remaining = Date.parse(state.room.phaseEndsAt) - Date.parse(state.serverTime);
  check(remaining > 18_000 && remaining <= 20_000, "PREPARATION usa o prazo autoritativo de 20 segundos");

  await rpc(host, "replace_slides", {
    p_room: roomId,
    p_slide_ids: ["invalid-1", "invalid-2", "invalid-3", "invalid-4"],
  });
  state = await snapshot(host);
  check(JSON.stringify(state.match.slideIds) === JSON.stringify(firstPresentation), "lista incompleta de slides foi recusada");

  const guestReplacement = await memberA.sb.rpc("replace_slides", {
    p_room: roomId,
    p_slide_ids: ["guest-1", "guest-2", "guest-3", "guest-4", "guest-5"],
  });
  check(guestReplacement.error?.message?.includes("apenas o host"), "convidado não pode substituir slides");

  const replacementSlides = ["new-1", "new-2", "new-3", "new-4", "new-5"];
  await rpc(host, "replace_slides", { p_room: roomId, p_slide_ids: replacementSlides });
  state = await snapshot(host);
  check(JSON.stringify(state.match.slideIds) === JSON.stringify(replacementSlides), "host substitui cinco slides durante PREPARATION");

  state = await advance();
  check(state.room.phase === "COUNTDOWN", "PREPARATION avançou para COUNTDOWN");
  state = await advance();
  check(state.room.phase === "PRESENTATION", "COUNTDOWN avançou para PRESENTATION");
  state = await advance();
  check(state.room.phase === "VOTING", "PRESENTATION avançou para VOTING");

  await rpc(late, "submit_vote", { p_room: roomId, p_rating: 5 });
  state = await snapshot(host);
  check(!(late.playerId in state.votes), "jogador tardio não vota na partida ativa");

  const presenter = state.match.seatOrder[state.match.presenterIndex];
  const eligible = [host, memberA, memberB].find((current) => current.playerId !== presenter);
  const confirmedVote = await rpc(eligible, "submit_vote_confirmed", {
    p_room: roomId, p_rating: 4,
  });
  check(confirmedVote.accepted === true && confirmedVote.duplicate === false,
    "voto recebeu ACK autoritativo");
  const duplicateVote = await rpc(eligible, "submit_vote_confirmed", {
    p_room: roomId, p_rating: 1,
  });
  check(duplicateVote.accepted === true && duplicateVote.duplicate === true,
    "reenvio do voto foi reconhecido como duplicado");
  state = await snapshot(host);
  check(eligible.playerId in state.votes, "participante elegível continua votando normalmente");

  state = await advance();
  check(state.room.phase === "SCORE_REVEAL", "votação fechou sem corrida com o voto confirmado");
  state = await advance();
  check(state.room.phase === "PLAYER_SPIN", "segundo apresentador começou normalmente");
  const secondPresentation = state.match.slideIds;
  check(secondPresentation.length === 5 && !secondPresentation.some((id) => firstPresentation.includes(id)),
    "apresentações consecutivas usam conjuntos diferentes com acervo suficiente");

  const drawingFinalizationProbe = await rpc(host, "finalize_drawing", {
    p_room: roomId, p_step: 0, p_storage_path: null, p_status: "failed",
  });
  check(drawingFinalizationProbe.skipped === "contribution_missing",
    "RPC de finalização do desenho está ativa no PostgREST");

  console.log("\n  PRODUÇÃO READY: migrations 0015 até 0020 ativas.\n");
} finally {
  if (host && roomId) {
    const { error } = await host.sb.rpc("close_room", { p_room: roomId });
    console.log(error ? `  ! limpeza da sala falhou: ${error.message}` : "  ✓ sala temporária encerrada");
  }
  await Promise.all(clients.map((current) => current.sb.auth.signOut()));
}
