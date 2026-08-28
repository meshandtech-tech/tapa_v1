/**
 * As chamadas de sala.
 *
 * Toda escrita passa por RPC. As tabelas não aceitam INSERT/UPDATE direto do
 * cliente de propósito: o aparelho manda INTENÇÃO ("entreguei"), nunca FATO
 * ("estou no passo 4 do caderno 7"). Quem decide caderno, passo e prazo é o
 * banco — é isso que impede dez aparelhos de discordarem.
 */
import { getSupabase } from "../../lib/supabase";
import { logGameEvent } from "../telemetry";
import type { RoomSnapshot } from "./snapshot";

export interface RpcFailure {
  fn: string;
  message: string;
  at: number;
}

/**
 * A última chamada que falhou, e quem quer saber disso.
 *
 * Antes, TODA falha de RPC virava um `console.error` e um `null` — e o
 * `console` de um celular numa mesa de bar não existe. Na prática o botão
 * simplesmente não fazia nada: o host apertava "Começar", `start_match`
 * estourava (não é o host, gente de menos, o que fosse), e a tela ficava
 * exatamente igual. A pessoa aperta de novo, acha que travou, e ninguém
 * descobre o motivo.
 *
 * Erro de escrita tem de chegar em ALGUÉM. Quem escuta decide o que mostrar.
 */
let ultimaFalha: RpcFailure | null = null;
const ouvintes = new Set<(falha: RpcFailure) => void>();

export function lastRpcFailure(): RpcFailure | null {
  return ultimaFalha;
}

export function onRpcFailure(ouvinte: (falha: RpcFailure) => void): () => void {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    console.error(`[tapa] rpc ${fn} falhou`, error);
    ultimaFalha = { fn, message: error.message, at: Date.now() };
    logGameEvent("RPC_FAILED", { fn, code: error.code, message: error.message });
    for (const ouvinte of ouvintes) ouvinte(ultimaFalha);
    return null;
  }
  return data as T;
}

/**
 * Diferença entre o relógio deste aparelho e o do servidor.
 *
 * O prazo da fase é um carimbo do Postgres. Um celular com a hora errada
 * desenharia uma contagem errada — e como o banco é quem decide o avanço, a
 * tela ficaria mentindo. Guardar o desvio conserta a exibição sem dar ao
 * cliente nenhum poder sobre a transição.
 */
let clockSkewMs = 0;

export function serverNow(): number {
  return Date.now() + clockSkewMs;
}

function noteServerTime(iso: string | undefined): void {
  if (!iso) return;
  const server = Date.parse(iso);
  if (Number.isFinite(server)) clockSkewMs = server - Date.now();
}

export async function createRoom(pin: string, gameId: string) {
  return rpc<unknown>("create_room", { p_pin: pin, p_game_id: gameId });
}

export async function joinRoom(
  pin: string, nickname: string, color: string, avatarSeed: string,
): Promise<{ room_id?: string; player_id?: string; error?: string } | null> {
  return rpc("join_room", {
    p_pin: pin, p_nickname: nickname, p_color: color, p_avatar_seed: avatarSeed,
  });
}

export async function fetchSnapshot(roomId: string): Promise<RoomSnapshot | null> {
  const snap = await rpc<RoomSnapshot>("room_snapshot", { p_room: roomId });
  if (snap) noteServerTime(snap.serverTime);
  return snap;
}

export async function touchPresence(roomId: string) {
  return rpc<void>("touch_presence", { p_room: roomId });
}

export async function leaveRoom(roomId: string) {
  return rpc<void>("leave_room", { p_room: roomId });
}

export async function updateMe(
  roomId: string, patch: { nickname?: string; avatarSeed?: string; color?: string },
) {
  return rpc<void>("update_me", {
    p_room: roomId,
    p_nickname: patch.nickname ?? null,
    p_avatar_seed: patch.avatarSeed ?? null,
    p_color: patch.color ?? null,
  });
}

export async function claimHost(roomId: string) {
  return rpc<unknown>("claim_host", { p_room: roomId });
}

export async function setSettings(
  roomId: string, gameId: string | null, settings: Record<string, unknown> | null,
) {
  return rpc<unknown>("set_settings", {
    p_room: roomId, p_game_id: gameId, p_settings: settings,
  });
}

/**
 * Começar a partida.
 *
 * Devolve a sala quando deu certo e `null` quando não deu — e o `null` agora
 * chega em quem chamou, em vez de morrer num `console.error`.
 */
export async function startMatch(roomId: string, payload: {
  prompts?: unknown[];
  topics?: unknown[];
  questionOrder?: number[];
  correct?: number[];
  slideIds?: string[];
  /** Tamanho do acervo de prendas. O banco sorteia; o cliente não escolhe. */
  punishmentCount?: number;
}) {
  logGameEvent("MATCH_INITIALIZATION_STARTED", {
    prompts: payload.prompts?.length ?? 0,
  });
  const sala = await rpc<{ phase?: string }>("start_match", {
    p_room: roomId,
    p_prompts: payload.prompts ?? [],
    p_topics: payload.topics ?? [],
    p_question_order: payload.questionOrder ?? [],
    p_correct: payload.correct ?? [],
    p_slide_ids: payload.slideIds ?? [],
    p_punishment_count: payload.punishmentCount ?? 0,
  });
  logGameEvent(
    sala ? "MATCH_INITIALIZATION_COMPLETE" : "MATCH_INITIALIZATION_FAILED",
    sala ? { phase: sala.phase } : { motivo: lastRpcFailure()?.message ?? "sem resposta" },
  );
  return sala;
}

/**
 * Fecha a fase corrente.
 *
 * `expectedPhase`/`expectedEndsAt` são o compare-and-set: dez aparelhos
 * percebendo o fim ao mesmo tempo mandam dez chamadas, e nove voltam sem
 * fazer nada porque a fase já não é mais aquela. É a garantia de "um passo só
 * avança uma vez".
 */
export async function advancePhase(
  roomId: string,
  expectedPhase?: string | null,
  expectedEndsAt?: string | null,
  force = false,
) {
  return rpc<unknown>("advance_phase", {
    p_room: roomId,
    p_expected_phase: expectedPhase ?? null,
    p_expected_ends_at: expectedEndsAt ?? null,
    p_force: force,
  });
}

export async function submitContribution(roomId: string, payload: {
  storagePath?: string | null;
  strokes?: unknown;
  text?: string;
  status?: string;
}) {
  logGameEvent(
    payload.text !== undefined
      ? "GUESS_SUBMITTED"
      : payload.status === "timeout"
        ? "DRAWING_AUTO_SUBMITTED"
        : "DRAWING_SUBMITTED",
    { status: payload.status ?? "submitted" },
  );
  return rpc<{ contribution_id?: string; skipped?: string }>("submit_contribution", {
    p_room: roomId,
    p_storage_path: payload.storagePath ?? null,
    p_strokes: payload.strokes ?? null,
    p_text: payload.text ?? "",
    p_status: payload.status ?? "submitted",
  });
}

/** Anexa a imagem DEPOIS: a página já existe, o upload só a melhora. */
export async function attachDrawing(roomId: string, stepIndex: number, path: string) {
  logGameEvent("UPLOAD_COMPLETE", { stepIndex });
  return rpc<void>("attach_drawing", {
    p_room: roomId, p_step: stepIndex, p_storage_path: path,
  });
}

export async function submitVote(roomId: string, rating: number) {
  return rpc<void>("submit_vote", { p_room: roomId, p_rating: rating });
}

export async function submitAnswer(roomId: string, optionIndex: number) {
  return rpc<void>("submit_answer", { p_room: roomId, p_option: optionIndex });
}

/** Ninguém topou a prenda: outra, sem sair da roleta. */
export async function rerollPunishment(roomId: string) {
  return rpc<unknown>("reroll_punishment", { p_room: roomId });
}

/** Imagem que não carregou sai ANTES de alguém apresentar. */
export async function replaceSlides(roomId: string, slideIds: string[]) {
  return rpc<unknown>("replace_slides", { p_room: roomId, p_slide_ids: slideIds });
}

export async function rerollTopic(roomId: string) {
  return rpc<unknown>("reroll_topic", { p_room: roomId });
}

export async function countAsMatch(roomId: string, chainId: string) {
  return rpc<void>("count_as_match", { p_room: roomId, p_chain: chainId });
}

export async function setRevealAutoplay(roomId: string, on: boolean) {
  return rpc<unknown>("set_reveal_autoplay", { p_room: roomId, p_on: on });
}

export async function pauseRoom(roomId: string, paused: boolean) {
  return rpc<unknown>("pause_room", { p_room: roomId, p_paused: paused });
}

export async function resetToLobby(roomId: string) {
  return rpc<unknown>("reset_to_lobby", { p_room: roomId });
}

export async function closeRoom(roomId: string) {
  return rpc<void>("close_room", { p_room: roomId });
}
