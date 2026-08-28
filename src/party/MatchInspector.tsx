import { useState } from "react";
import { Bug, Copy, X } from "lucide-react";
import { ConnectionDot } from "./ConnectionBadge";
import { dumpGameEvents, isDebugEnabled, recentGameEvents } from "./telemetry";
import { useNow } from "./useNow";
import { cn } from "../ui/cn";
import type { RoomSnapshot } from "./cloud/snapshot";

/** Quem foi visto neste intervalo conta como presente. */
const PRESENTE_MS = 35000;

/**
 * O painel que faltava na festa.
 *
 * Quando dez pessoas travam, a pergunta é "em que passo, com quantas entregas,
 * e quem não recebeu tarefa?" — e não havia onde olhar. Isto responde as
 * quatro de uma vez, no aparelho de quem está jogando, sem cabo nem console.
 *
 * NUNCA aparece numa partida normal: só em desenvolvimento ou com `?debug=1`
 * na URL. Um painel de diagnóstico visível numa festa é ruído, e ruído numa
 * tela de festa é pior que não ter diagnóstico.
 */
export function MatchInspector({
  snapshot,
  connection,
}: {
  snapshot: RoomSnapshot | null;
  connection: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const agora = useNow(isDebugEnabled(), 500);

  if (!isDebugEnabled() || !snapshot) return null;

  const { room, match, players, me } = snapshot;
  const assentos = match?.seatOrder.length ?? 0;
  const entregues = match?.submittedPlayerIds.length ?? 0;
  const presentes = players.filter(
    (p) => agora - Date.parse(p.lastSeenAt) < PRESENTE_MS,
  ).length;
  const emPasso = room.phase === "DRAW_STEP" || room.phase === "GUESS_STEP";
  const faltam = room.phaseEndsAt
    ? Math.max(0, Math.round((Date.parse(room.phaseEndsAt) - agora) / 1000))
    : null;

  const semTarefa = emPasso && !snapshot.assignment;

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-label="Abrir diagnóstico da partida"
        className={cn(
          "fixed bottom-2 left-2 z-[60] flex items-center gap-1.5 border-2 border-ink px-2 py-1",
          "font-action text-[0.6rem] uppercase tabular-nums shadow-brutal",
          // Vermelho quando ESTE aparelho está sem tarefa num passo ativo: é a
          // condição exata que travou a festa, e ela tem de saltar aos olhos.
          semTarefa ? "bg-[#ef476f] text-white" : "bg-paper text-ink",
        )}
      >
        <Bug strokeWidth={3} className="size-3" />
        {room.phase}
        {emPasso ? ` ${entregues}/${assentos}` : null}
        {semTarefa ? " SEM TAREFA" : null}
      </button>
    );
  }

  const linhas: [string, string][] = [
    ["Sala / PIN", `${room.pin}`],
    ["Match", match?.id.slice(0, 8) ?? "—"],
    ["Fase", room.phase],
    ["Passo", match ? `${match.stepIndex + 1} de ${match.stepCount}` : "—"],
    ["Participantes", String(assentos)],
    ["Conectados", `${presentes} de ${players.length}`],
    ["Cadernos / atribuições", assentos ? `${assentos}/${assentos} (derivadas do assento)` : "—"],
    ["Minha tarefa", emPasso ? (snapshot.assignment ? "recebida" : "AUSENTE") : "—"],
    ["Entregues", emPasso ? `${entregues} / ${assentos}` : "—"],
    ["Prazo", faltam === null ? "sem prazo" : `${faltam}s`],
    ["Realtime", connection],
    ["Sou o host", room.hostPlayerId === me.playerId ? "sim" : "não"],
  ];

  const eventos = recentGameEvents().slice(-14);

  return (
    <div className="fixed inset-x-2 bottom-2 z-[60] max-h-[70dvh] overflow-auto border-4 border-ink bg-paper p-3 shadow-brutal">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-action text-xs uppercase">
          <Bug strokeWidth={3} className="size-4" />
          Diagnóstico
          <ConnectionDot connection={connection} />
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(dumpGameEvents()).then(() => {
                setCopiado(true);
                window.setTimeout(() => setCopiado(false), 1500);
              });
            }}
            className="flex items-center gap-1 border-2 border-ink px-2 py-1 font-action text-[0.6rem] uppercase"
          >
            <Copy strokeWidth={3} className="size-3" />
            {copiado ? "copiado" : "copiar log"}
          </button>
          <button
            type="button"
            onClick={() => setAberto(false)}
            aria-label="Fechar diagnóstico"
            className="border-2 border-ink px-2 py-1"
          >
            <X strokeWidth={3} className="size-3" />
          </button>
        </div>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-[0.65rem]">
        {linhas.map(([rotulo, valor]) => (
          <div key={rotulo} className="contents">
            <dt className="opacity-60">{rotulo}</dt>
            <dd className={cn("tabular-nums", valor === "AUSENTE" && "font-bold text-[#c1121f]")}>
              {valor}
            </dd>
          </div>
        ))}
      </dl>

      {assentos > 0 ? (
        <div className="mt-2 border-t-2 border-dashed border-ink pt-2">
          <p className="font-action text-[0.6rem] uppercase opacity-60">Quem falta entregar</p>
          <p className="font-mono text-[0.65rem]">
            {match!.seatOrder
              .filter((id) => !match!.submittedPlayerIds.includes(id))
              .map((id) => players.find((p) => p.id === id)?.nickname ?? id.slice(0, 6))
              .join(", ") || "ninguém"}
          </p>
        </div>
      ) : null}

      <div className="mt-2 border-t-2 border-dashed border-ink pt-2">
        <p className="font-action text-[0.6rem] uppercase opacity-60">
          Últimos eventos ({recentGameEvents().length})
        </p>
        <ul className="mt-1 space-y-0.5 font-mono text-[0.6rem] leading-tight">
          {eventos.map((e, i) => (
            <li key={`${e.timestamp}-${i}`} className="flex gap-2">
              <span className="shrink-0 opacity-50 tabular-nums">+{e.sinceLastMs}ms</span>
              <span className={cn(e.event.includes("FAILED") || e.event.includes("MISSING")
                ? "font-bold text-[#c1121f]" : "")}>
                {e.event}
              </span>
            </li>
          ))}
          {eventos.length === 0 ? <li className="opacity-50">nada ainda</li> : null}
        </ul>
      </div>
    </div>
  );
}
