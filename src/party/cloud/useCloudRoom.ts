import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { ensureAnonSession, getSupabase, lastAuthFailure, type AuthFailure } from "../../lib/supabase";
import { logGameEvent, setLogContext } from "../telemetry";
import * as api from "./api";
import { projectSnapshot } from "./projection";
import type { RoomSnapshot } from "./snapshot";
import type { PartyState } from "../types";

export type CloudConnection = "connecting" | "connected" | "offline" | "closed";

/** De quanto em quanto este aparelho diz "continuo aqui". */
const PRESENCE_MS = 15000;
/** Teto do backoff. Rede de bar volta em segundos, não em minutos. */
const BACKOFF_MAX_MS = 8000;

/**
 * A sala, vinda da nuvem.
 *
 * Substitui o `usePartyRoom` peer-to-peer. As diferenças que importam:
 *
 * 1. NENHUM aparelho é a autoridade. Não existe `authority`, nem batimento de
 *    3s reemitindo o estado inteiro, nem tomada de poder por silêncio. O host
 *    é uma permissão guardada em `rooms.host_player_id`.
 * 2. O que trafega são AVISOS de que algo mudou (linhas pequenas de `rooms`,
 *    `matches`, `players`). O estado vem de `room_snapshot()`, já filtrado
 *    pelo servidor. Nada de desenho no canal — era o que estourava o limite.
 * 3. Reconectar é buscar a foto de novo. Não há estado local a reconstruir,
 *    então F5, troca de rede e celular bloqueado deixaram de ser eventos
 *    especiais.
 */
export function useCloudRoom(pin: string, options: { spectator?: boolean } = {}) {
  const spectator = options.spectator ?? false;
  const [roomId, setRoomId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [connection, setConnection] = useState<CloudConnection>("connecting");
  /**
   * Por que não deu para entrar. Sem isto o jogador ficava preso para sempre
   * em "procurando a sala" — sem erro na tela e sem nada a fazer.
   */
  const [authError, setAuthError] = useState<AuthFailure | null>(null);

  const roomIdRef = useRef<string | null>(null);
  roomIdRef.current = roomId;
  const channelRef = useRef<RealtimeChannel | null>(null);
  const snapshotRef = useRef<RoomSnapshot | null>(null);
  snapshotRef.current = snapshot;
  /** Evita rajada: dez mudanças em sequência viram uma releitura. */
  const pendingFetch = useRef<number | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    const id = roomIdRef.current;
    if (!id) return;
    const snap = await api.fetchSnapshot(id);
    if (!mounted.current || !snap) return;
    if (snap.error) {
      setConnection("closed");
      return;
    }
    // Todo evento seguinte carrega partida, jogador, passo e fase. É o que
    // torna uma partida falhada legível de ponta a ponta depois.
    setLogContext({
      matchId: snap.match?.id ?? null,
      playerId: snap.me.playerId,
      stepIndex: snap.match?.stepIndex ?? null,
      gamePhase: snap.room.phase,
    });
    logGameEvent("SNAPSHOT_FETCHED", {
      submitted: snap.match?.submittedPlayerIds?.length ?? 0,
      esperados: snap.match?.seatOrder?.length ?? 0,
      temTarefa: !!snap.assignment,
    });
    // A pergunta que a festa não conseguiu responder: esta pessoa recebeu, ou
    // não recebeu, a tarefa do passo?
    if (snap.room.phase === "DRAW_STEP" || snap.room.phase === "GUESS_STEP") {
      logGameEvent(
        snap.assignment ? "PLAYER_ASSIGNMENT_FETCHED" : "PLAYER_ASSIGNMENT_MISSING",
        snap.assignment ? { chainId: snap.assignment.chainId } : undefined,
      );
    }
    setSnapshot(snap);
    setConnection(snap.room.closedAt ? "closed" : "connected");
  }, []);

  /** Agrupa releituras próximas — dez entregas simultâneas não viram dez GETs. */
  const scheduleRefresh = useCallback(() => {
    if (pendingFetch.current !== null) return;
    pendingFetch.current = window.setTimeout(() => {
      pendingFetch.current = null;
      void refresh();
    }, 120);
  }, [refresh]);

  // -------------------------------------------------------------------------
  // Identidade e resolução da sala
  // -------------------------------------------------------------------------
  useEffect(() => {
    mounted.current = true;
    let cancelled = false;

    void (async () => {
      const uid = await ensureAnonSession();
      if (cancelled) return;
      if (!uid) {
        setAuthError(lastAuthFailure() ?? "unknown");
        return;
      }
      setAuthError(null);
      const supabase = getSupabase();
      if (!supabase || cancelled) return;

      const { data } = await supabase
        .from("rooms")
        .select("id")
        .eq("pin", pin)
        .is("closed_at", null)
        .maybeSingle();

      if (cancelled) return;
      if (!data?.id) {
        setConnection("closed");
        return;
      }
      setRoomId(data.id);
      roomIdRef.current = data.id;
      void refresh();
    })();

    return () => {
      cancelled = true;
      mounted.current = false;
      if (pendingFetch.current !== null) window.clearTimeout(pendingFetch.current);
    };
  }, [pin, refresh]);

  // -------------------------------------------------------------------------
  // Assinatura
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!roomId) return;
    const supabase = getSupabase();
    if (!supabase) return;

    let tentativa = 0;
    let retry: number | undefined;
    let vivo = true;

    const assinar = () => {
      if (!vivo) return;
      const channel = supabase
        .channel(`room:${roomId}`)
        // Três tabelas, todas de linhas pequenas e não secretas. O conteúdo
        // das contribuições nunca entra no stream: chega por `room_snapshot`.
        .on("postgres_changes",
          { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
          scheduleRefresh)
        .on("postgres_changes",
          { event: "*", schema: "public", table: "matches", filter: `room_id=eq.${roomId}` },
          scheduleRefresh)
        .on("postgres_changes",
          { event: "*", schema: "public", table: "players", filter: `room_id=eq.${roomId}` },
          scheduleRefresh)
        .subscribe((status) => {
          if (!vivo) return;
          if (status === "SUBSCRIBED") {
            logGameEvent(tentativa > 0 ? "REALTIME_RECONNECTED" : "REALTIME_CONNECTED",
              tentativa > 0 ? { tentativas: tentativa } : undefined);
            tentativa = 0;
            // Toda reconexão termina numa foto nova: o que passou enquanto o
            // socket estava fora chega aqui de uma vez.
            void refresh();
            return;
          }
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            logGameEvent("REALTIME_DISCONNECTED", { status });
            setConnection("offline");
            // A versão anterior parava AQUI: marcava o canal como morto e
            // nunca mais tentava. Era o que deixava a sala congelada para
            // sempre depois de um soluço de rede.
            supabase.removeChannel(channel);
            tentativa += 1;
            const espera = Math.min(BACKOFF_MAX_MS, 500 * 2 ** (tentativa - 1));
            retry = window.setTimeout(assinar, espera);
          }
        });

      channelRef.current = channel;
    };

    assinar();

    return () => {
      vivo = false;
      if (retry) window.clearTimeout(retry);
      const channel = channelRef.current;
      channelRef.current = null;
      if (channel) supabase.removeChannel(channel);
    };
  }, [roomId, refresh, scheduleRefresh]);

  // -------------------------------------------------------------------------
  // Volta do segundo plano / da rede
  // -------------------------------------------------------------------------
  useEffect(() => {
    const voltou = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("online", voltou);
    document.addEventListener("visibilitychange", voltou);
    return () => {
      window.removeEventListener("online", voltou);
      document.removeEventListener("visibilitychange", voltou);
    };
  }, [refresh]);

  // -------------------------------------------------------------------------
  // Presença
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!roomId || spectator) return;
    void api.touchPresence(roomId);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void api.touchPresence(roomId);
    }, PRESENCE_MS);
    return () => window.clearInterval(timer);
  }, [roomId, spectator]);

  // -------------------------------------------------------------------------
  // Cutucar o fim da fase
  // -------------------------------------------------------------------------
  /**
   * Qualquer aparelho pode avisar que o prazo venceu — o banco confere pelo
   * PRÓPRIO relógio e o compare-and-set descarta os perdedores. Não existe
   * mais "o aparelho que toca a partida": se este dormir, outro cutuca, e se
   * todos dormirem, o `pg_cron` cobre.
   *
   * O empurrãozinho de atraso por assento evita dez chamadas no mesmo
   * milissegundo — não por correção (o banco resolve), mas por educação.
   */
  useEffect(() => {
    const snap = snapshot;
    if (spectator) return;
    if (!roomId || !snap || !snap.room.phaseEndsAt || snap.room.pausedAt) return;

    const meuAssento = Math.max(
      0, (snap.match?.seatOrder ?? []).indexOf(snap.me.playerId ?? ""),
    );
    const passoDeEntrega = snap.room.phase === "DRAW_STEP" || snap.room.phase === "GUESS_STEP";
    const graca = snap.room.gameId === "drawing-telephone" && passoDeEntrega ? 3000 : 0;

    /**
     * Todo mundo já entregou: não há o que esperar.
     *
     * `advance_phase` JÁ considera este passo vencido quando `all_submitted` —
     * só que ninguém o chamava antes do prazo, e o prazo é de 90 segundos.
     * Dez pessoas terminando em 30s ficavam olhando "10 / 10 prontos" por um
     * minuto, o que na mesa é indistinguível de travamento. O banco continua
     * sendo quem decide; isto só o avisa mais cedo.
     *
     * Só no jogo de desenho de propósito: o quiz tem a mesma regra no banco,
     * mas mexer no ritmo dele agora seria mudar um jogo que está funcionando.
     */
    const assentos = snap.match?.seatOrder ?? [];
    const entregues = new Set(snap.match?.submittedPlayerIds ?? []);
    const todosEntregaram =
      snap.room.gameId === "drawing-telephone"
      && passoDeEntrega
      && assentos.length > 0
      && assentos.every((id) => entregues.has(id));

    // O empurrãozinho de atraso por assento evita dez chamadas no mesmo
    // milissegundo — não por correção (o banco resolve), mas por educação.
    const alvo = todosEntregaram
      ? api.serverNow() + 150 * meuAssento + 120
      : Date.parse(snap.room.phaseEndsAt) + graca + 150 * meuAssento + 250;
    const espera = Math.max(0, alvo - api.serverNow());

    const timer = window.setTimeout(() => {
      logGameEvent("STEP_ADVANCE_REQUESTED", {
        motivo: todosEntregaram ? "todos_entregaram" : "prazo_vencido",
      });
      void api.advancePhase(roomId, snap.room.phase, snap.room.phaseEndsAt);
    }, espera);
    return () => window.clearTimeout(timer);
  }, [roomId, snapshot, spectator]);

  /**
   * Poll leve, só para a TV.
   *
   * O Realtime passa por RLS, e o espectador NÃO é membro da sala: ele recebe
   * mudanças de `rooms` (a política permite sala aberta) mas não de `matches`
   * nem de `players`. Como a fase dispara quase tudo, o que falta é entrada e
   * saída de gente no lobby — e um poll de 3s resolve isso.
   *
   * A alternativa seria relaxar o RLS e deixar qualquer sessão ler o roster de
   * qualquer PIN. Um poll na TV é mais barato que abrir isso.
   */
  useEffect(() => {
    if (!roomId || !spectator) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [roomId, spectator, refresh]);

  const state: PartyState | null = useMemo(
    () => (snapshot ? projectSnapshot(snapshot) : null),
    [snapshot],
  );

  return { roomId, snapshot, state, connection, authError, refresh };
}
