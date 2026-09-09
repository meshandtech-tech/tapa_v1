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
let lifecycleClient = null;
const lifecycleRoomIds = [];
const concurrencyRooms = [];

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

  // Só consulta o gate novo depois de estabelecer `host_player_id`, para que
  // o finally consiga encerrar a sala mesmo quando a 0021 ainda não existe.
  const initialRoomState = await rpc(host, "resolve_room_state", { p_pin: room.pin });
  check(initialRoomState?.status === "open", "migration 0021 resolve a sala aberta sem ambiguidade");

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

  // Regressão do incidente real: a mesma sessão criava uma sala B enquanto
  // ainda estava ativa na A. O snapshot de B era `room_forbidden` e a UI
  // traduzia isso incorretamente como "sala fechada".
  lifecycleClient = await player("lifecycle");
  const lifecycleRoomA = await rpc(lifecycleClient, "create_room", {
    p_pin: String(Math.floor(1000 + Math.random() * 9000)),
    p_game_id: "quem-erra-paga",
  });
  lifecycleRoomIds.push(lifecycleRoomA.id);
  const lifecycleJoinA = await rpc(lifecycleClient, "join_room", {
    p_pin: lifecycleRoomA.pin,
    p_nickname: "Lifecycle",
    p_color: "#5b8def",
    p_avatar_seed: "lifecycle",
  });
  check(!lifecycleJoinA?.error, "sessão de regressão entrou na sala A");

  const lifecycleRoomB = await rpc(lifecycleClient, "create_room", {
    p_pin: String(Math.floor(1000 + Math.random() * 9000)),
    p_game_id: "quem-erra-paga",
  });
  lifecycleRoomIds.push(lifecycleRoomB.id);
  const lifecyclePreviewB = await rpc(lifecycleClient, "room_snapshot", {
    p_room: lifecycleRoomB.id,
  });
  check(!lifecyclePreviewB?.error, "sessão ativa na sala A consegue abrir o lobby da sala B");

  const lifecycleJoinB = await rpc(lifecycleClient, "join_room", {
    p_pin: lifecycleRoomB.pin,
    p_nickname: "Lifecycle",
    p_color: "#5b8def",
    p_avatar_seed: "lifecycle",
  });
  check(!lifecycleJoinB?.error, "troca A → B concluiu sem prender a sessão");
  const oldRoomState = await rpc(lifecycleClient, "resolve_room_state", {
    p_pin: lifecycleRoomA.pin,
  });
  check(oldRoomState?.status === "room_closed", "sala A vazia foi encerrada automaticamente");
  await rpc(lifecycleClient, "close_room", { p_room: lifecycleRoomB.id });

  // Gate da 0022: uma sala ainda sem primeiro jogador não pode ser fechada
  // quando outra identidade entra, ao mesmo tempo, em outro lobby.
  const waitingClient = await player("parallel-waiting");
  const joiningClient = await player("parallel-joining");
  const waitingRoom = await rpc(waitingClient, "create_room", {
    p_pin: String(Math.floor(1000 + Math.random() * 9000)),
    p_game_id: "drawing-telephone",
  });
  concurrencyRooms.push({ client: waitingClient, room: waitingRoom });
  const joiningRoom = await rpc(joiningClient, "create_room", {
    p_pin: String(Math.floor(1000 + Math.random() * 9000)),
    p_game_id: "quem-erra-paga",
  });
  concurrencyRooms.push({ client: joiningClient, room: joiningRoom });

  const joiningResult = await rpc(joiningClient, "join_room", {
    p_pin: joiningRoom.pin,
    p_nickname: "ParallelJoining",
    p_color: "#44d19d",
    p_avatar_seed: "parallel-joining",
  });
  check(!joiningResult?.error, "identidade concorrente entrou na própria sala");
  joiningClient.playerId = joiningResult.player_id;

  const waitingState = await rpc(waitingClient, "resolve_room_state", {
    p_pin: waitingRoom.pin,
  });
  check(waitingState?.status === "open", "migration 0022 preserva outro lobby entre create e join");

  const waitingResult = await rpc(waitingClient, "join_room", {
    p_pin: waitingRoom.pin,
    p_nickname: "ParallelWaiting",
    p_color: "#ffd166",
    p_avatar_seed: "parallel-waiting",
  });
  check(!waitingResult?.error, "host atrasado ainda consegue entrar no próprio lobby");
  waitingClient.playerId = waitingResult.player_id;
  await rpc(waitingClient, "close_room", { p_room: waitingRoom.id });
  await rpc(joiningClient, "close_room", { p_room: joiningRoom.id });

  console.log("\n  PRODUÇÃO READY: migrations 0015 até 0022 ativas.\n");
} finally {
  if (host && roomId) {
    const { error } = await host.sb.rpc("close_room", { p_room: roomId });
    console.log(error ? `  ! limpeza da sala falhou: ${error.message}` : "  ✓ sala temporária encerrada");
  }
  if (lifecycleClient) {
    for (const lifecycleRoomId of lifecycleRoomIds) {
      await lifecycleClient.sb.rpc("close_room", { p_room: lifecycleRoomId });
    }
  }
  for (const { client, room } of concurrencyRooms) {
    if (!client.playerId) {
      const { data } = await client.sb.rpc("join_room", {
        p_pin: room.pin,
        p_nickname: "GateCleanup",
        p_color: "#5b8def",
        p_avatar_seed: "gate-cleanup",
      });
      if (!data?.error) client.playerId = data?.player_id;
    }
    if (client.playerId) await client.sb.rpc("close_room", { p_room: room.id });
  }
  await Promise.all(clients.map((current) => current.sb.auth.signOut()));
}
