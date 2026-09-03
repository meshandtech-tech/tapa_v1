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

interface PostgrestFailure {
  code?: string;
  message: string;
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

function reportRpcFailure(fn: string, error: PostgrestFailure): void {
    console.error(`[tapa] rpc ${fn} falhou`, error);
    ultimaFalha = { fn, message: error.message, at: Date.now() };
    logGameEvent("RPC_FAILED", { fn, code: error.code, message: error.message });
    for (const ouvinte of ouvintes) ouvinte(ultimaFalha);
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    reportRpcFailure(fn, error);
    return null;
  }
  return data as T;
}

/**
 * Uma chamada de contribuição é pequena, idempotente e vale uma página
 * inteira do caderno. No 5G, deixar uma única tentativa decidir se o desenho
 * existe é uma troca ruim: timeout do navegador não significa que o Postgres
 * não recebeu, e repetir é seguro por causa da unique da contribuição.
 */
const CONTRIBUTION_ATTEMPTS = 3;
const CONTRIBUTION_ACK_TIMEOUT_MS = 2500;
const CONTRIBUTION_RETRY_DELAY_MS = 250;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = globalThis.setTimeout(() => resolve(null), timeoutMs);
  });
  const result = await Promise.race([promise, timeout]);
  if (timer !== undefined) globalThis.clearTimeout(timer);
  return result;
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
  return rpc<{ id: string; pin: string }>("create_room", {
    p_pin: pin, p_game_id: gameId,
  });
}

/**
 * Resolve o PIN sem criar uma janela de incompatibilidade no deploy.
 *
 * A migration cria `resolve_room` antes de fechar a leitura direta de
 * `rooms`. Até ela entrar, a versão nova do site ainda encontra a sala pelo
 * caminho antigo; depois dela, usa somente a RPC protegida. Isso permite
 * publicar cliente → aplicar banco sem derrubar quem está entrando.
 */
export async function resolveRoom(pin: string): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase.rpc("resolve_room", { p_pin: pin });
  if (!error) return data as string | null;

  const rpcAindaNaoExiste = error.code === "PGRST202"
    || error.message.toLowerCase().includes("schema cache");
  if (!rpcAindaNaoExiste) {
    console.error("[tapa] rpc resolve_room falhou", error);
    logGameEvent("RPC_FAILED", {
      fn: "resolve_room", code: error.code, message: error.message,
    });
  }

  // Compatibilidade temporária com produção anterior à migration 0014.
  const { data: legacy, error: legacyError } = await supabase
    .from("rooms")
    .select("id")
    .eq("pin", pin)
    .is("closed_at", null)
    .maybeSingle();
  if (legacyError) {
    console.error("[tapa] resolução legada da sala falhou", legacyError);
    return null;
  }
  return legacy?.id ?? null;
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

/**
 * Confirma a contribuição no servidor, repetindo quando a rede some.
 *
 * `submit_contribution` é idempotente: duas respostas atrasadas continuam
 * representando uma só página. O limite curto por tentativa permite que uma
 * segunda conexão 5G seja aberta ainda dentro da folga antes da fase avançar.
 */
export async function submitContributionReliable(roomId: string, payload: {
  storagePath?: string | null;
  strokes?: unknown;
  text?: string;
  status?: string;
}) {
  for (let attempt = 0; attempt < CONTRIBUTION_ATTEMPTS; attempt += 1) {
    let result: Awaited<ReturnType<typeof submitContribution>> = null;
    try {
      result = await withTimeout(
        submitContribution(roomId, payload),
        CONTRIBUTION_ACK_TIMEOUT_MS,
      );
    } catch (error) {
      // `supabase-js` normalmente devolve `{ error }`, mas uma troca brusca
      // de Wi-Fi/5G também pode rejeitar o fetch. A próxima tentativa ainda
      // é segura porque a contribuição tem chave única no banco.
      console.error("[tapa] conexão da contribuição caiu", error);
    }
    if (result) return result;
    if (attempt + 1 < CONTRIBUTION_ATTEMPTS) {
      await wait(CONTRIBUTION_RETRY_DELAY_MS * (attempt + 1));
    }
  }
  return null;
}

/**
 * Fecha uma contribuição `pending` depois do upload (ou como fallback).
 *
 * A repetição é segura: a linha é única por partida/passo/jogador e a RPC é
 * idempotente. Durante o deploy, cai para `attach_drawing` antigo quando há
 * imagem; os traços já persistidos continuam protegendo a página.
 */
export async function finalizeDrawingReliable(
  roomId: string,
  stepIndex: number,
  path: string | null,
  status: "submitted" | "timeout" | "failed",
): Promise<boolean> {
  for (let attempt = 0; attempt < CONTRIBUTION_ATTEMPTS; attempt += 1) {
    const supabase = getSupabase();
    if (!supabase) return false;

    try {
      const response = await withTimeout(
        Promise.resolve(supabase.rpc("finalize_drawing", {
          p_room: roomId,
          p_step: stepIndex,
          p_storage_path: path,
          p_status: status,
        })),
        CONTRIBUTION_ACK_TIMEOUT_MS,
      );

      if (response && !response.error) {
        const data = response.data as { accepted?: boolean } | null;
        if (data?.accepted) return true;
      } else if (response?.error) {
        const missing = response.error.code === "PGRST202"
          || response.error.message.toLowerCase().includes("schema cache");
        if (missing && path) {
          const legacy = await supabase.rpc("attach_drawing", {
            p_room: roomId, p_step: stepIndex, p_storage_path: path,
          });
          if (!legacy.error) return true;
          reportRpcFailure("attach_drawing", legacy.error);
        } else if (!missing) {
          reportRpcFailure("finalize_drawing", response.error);
        }
      }
    } catch (error) {
      console.error("[tapa] conexão da finalização caiu", error);
    }

    if (attempt + 1 < CONTRIBUTION_ATTEMPTS) {
      await wait(CONTRIBUTION_RETRY_DELAY_MS * (attempt + 1));
    }
  }
  return false;
}

export async function submitVote(roomId: string, rating: number) {
  logGameEvent("VOTE_SUBMITTED", { rating });

  const once = async (): Promise<{
    accepted?: boolean;
    duplicate?: boolean;
    skipped?: string;
    legacy?: boolean;
  } | null> => {
    const supabase = getSupabase();
    if (!supabase) return null;
    const args = { p_room: roomId, p_rating: rating };
    const confirmed = await supabase.rpc("submit_vote_confirmed", args);
    if (!confirmed.error) return confirmed.data;

    const missing = confirmed.error.code === "PGRST202"
      || confirmed.error.message.toLowerCase().includes("schema cache");
    if (!missing) {
      reportRpcFailure("submit_vote_confirmed", confirmed.error);
      return null;
    }

    // Janela de deploy: a migration 0019 pode chegar alguns segundos depois
    // do bundle. A RPC antiga continua idempotente pelo índice unique.
    const legacy = await supabase.rpc("submit_vote", args);
    if (legacy.error) {
      reportRpcFailure("submit_vote", legacy.error);
      return null;
    }
    return { accepted: true, legacy: true };
  };

  for (let attempt = 0; attempt < CONTRIBUTION_ATTEMPTS; attempt += 1) {
    try {
      const result = await withTimeout(once(), CONTRIBUTION_ACK_TIMEOUT_MS);
      if (result) {
        if (result.accepted) logGameEvent("VOTE_CONFIRMED", {
          duplicate: result.duplicate ?? false,
        });
        return result;
      }
    } catch (error) {
      console.error("[tapa] conexão do voto caiu", error);
    }
    if (attempt + 1 < CONTRIBUTION_ATTEMPTS) {
      await wait(CONTRIBUTION_RETRY_DELAY_MS * (attempt + 1));
    }
  }
  return null;
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
