import { useState } from "react";
import { motion } from "motion/react";
import { useNavigate } from "react-router-dom";
// PartyPopper no lugar do Sparkles: o brilho de quatro pontas lembrava demais
// o ícone do Claude Code, e não tem nada a ver com festa.
import { AlertTriangle, Loader2, LogIn, PartyPopper, Users } from "lucide-react";
import { DecorativeDoodles } from "../components/DecorativeDoodles";
import { HostAccountCard } from "./HostAccountCard";
import { GAMES } from "../games/registry";
import { generateFreePin } from "../party/pin";
import { loadPartyState, markRoomOwner } from "../party/partyStorage";
import {
  ensureAnonSession,
  isSupabaseConfigured,
  lastAuthFailure,
} from "../lib/supabase";
import { createRoom, lastRpcFailure } from "../party/cloud/api";
import { DEFAULT_GAME_ID, isGameId } from "../games/registry";
import { ThemeSwitcher } from "../theme/ThemeSwitcher";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Logo } from "../ui/Logo";
import { tiltByIndex } from "../ui/cn";
import { prepareRoom, RoomCreationError } from "./createPartyFlow";

function creationErrorMessage(error: unknown): string {
  if (error instanceof RoomCreationError && error.stage === "auth") {
    switch (lastAuthFailure()) {
      case "rate_limit":
        return "Muita gente entrou pela mesma rede. Espera alguns segundos e tenta novamente.";
      case "disabled":
        return "A entrada anônima está desligada no servidor.";
      case "network":
        return "Não foi possível alcançar o servidor. Confira sua conexão e tente novamente.";
      default:
        return "Não foi possível preparar sua entrada. Tente novamente.";
    }
  }

  const rpcMessage = lastRpcFailure()?.message.toLowerCase() ?? "";
  if (rpcMessage.includes("create_room") || rpcMessage.includes("schema cache")) {
    return "O servidor ainda não está atualizado para criar salas.";
  }
  if (rpcMessage.includes("jwt") || rpcMessage.includes("permission")) {
    return "O servidor recusou a criação da sala. Recarregue a página e tente novamente.";
  }
  return "Não foi possível criar a sala. Nada foi perdido; tente novamente.";
}

export function LandingScreen() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [creationError, setCreationError] = useState<string | null>(null);

  const createParty = async (gameId?: string) => {
    if (creating) return;
    setCreating(true);
    setCreationError(null);

    // Evita cair num PIN cuja sala antiga ainda está salva — senão o host
    // reidrataria o roster da festa passada em vez de abrir uma sala limpa.
    const pin = generateFreePin((candidate) => loadPartyState(candidate) !== null);
    const selectedGameId = gameId && isGameId(gameId) ? gameId : DEFAULT_GAME_ID;

    try {
      /**
       * A sala nasce no BANCO, não neste aparelho. Só navegamos depois que a
       * autenticação e o RPC confirmam sucesso; `null` não é uma sala.
       */
      const confirmedPin = await prepareRoom({
        pin,
        gameId: selectedGameId,
        cloud: isSupabaseConfigured,
        ensureSession: ensureAnonSession,
        createCloudRoom: createRoom,
        shouldRetryAfterAuthFailure: () => {
          const failure = lastRpcFailure();
          if (failure?.fn !== "create_room") return false;
          return /jwt|unauthor|permission|auth|sess[aã]o/i.test(failure.message);
        },
        markLocalOwner: markRoomOwner,
      });

      navigate(
        gameId
          ? `/play/${confirmedPin}?game=${gameId}`
          : `/play/${confirmedPin}`,
      );
    } catch (error) {
      console.error("[tapa] criação de sala falhou", error);
      setCreationError(creationErrorMessage(error));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="zine-grain relative min-h-dvh overflow-x-hidden bg-accent">
      <DecorativeDoodles />

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-center gap-10 px-5 py-12">
        <Card variant="speech" tilt="tilt-1" className="px-5 py-2">
          <p className="font-hand text-lg uppercase tracking-wide sm:text-xl">
            16+ · Party games para amigos
          </p>
        </Card>

        <Logo size="hero" className="mt-4" />

        {/* Não fala mais em TV: ela virou opcional, e o caminho normal agora é
            criar pelo celular e mandar o código no grupo. */}
        <p className="max-w-2xl text-center font-hand text-2xl text-on-accent sm:text-3xl">
          Cria a <strong className="font-extrabold">party</strong>, compartilha o
          código, todo mundo entra pelo celular e a bagunça começa. Sem instalar
          nada.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4">
          <Button
            size="tv"
            variant="paper"
            tilt="tilt-3"
            disabled={creating}
            aria-busy={creating}
            onClick={() => void createParty()}
          >
            {creating ? (
              <Loader2 strokeWidth={3} className="size-7 animate-spin" />
            ) : (
              <PartyPopper strokeWidth={3} className="size-7" />
            )}
            {creating ? "Criando..." : "Criar Party"}
          </Button>
          <Button
            size="tv"
            variant="knockout"
            tilt="tilt-2"
            disabled={creating}
            onClick={() => navigate("/join")}
          >
            <LogIn strokeWidth={3} className="size-7" />
            Entrar com PIN
          </Button>
        </div>

        {creationError ? (
          <Card
            variant="speech"
            tilt="tilt-2"
            className="flex max-w-xl items-center gap-3 border-accent-dark px-5 py-3 text-accent-dark"
          >
            <AlertTriangle strokeWidth={3} className="size-6 shrink-0" />
            <p role="alert" className="font-action text-sm uppercase sm:text-base">
              {creationError}
            </p>
          </Card>
        ) : null}

        <section className="mt-8 w-full">
          <h2 className="mb-6 text-center font-display text-4xl font-bold uppercase text-on-accent">
            Escolha o estrago
          </h2>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {GAMES.map((game, index) => {
              const Icon = game.icon;
              return (
                <motion.button
                  key={game.id}
                  type="button"
                  disabled={creating}
                  aria-busy={creating}
                  onClick={() => void createParty(game.id)}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.08, type: "spring", stiffness: 260, damping: 20 }}
                  whileHover={{ y: -6, rotate: index % 2 === 0 ? -1.5 : 1.5 }}
                  whileTap={{ scale: 0.97 }}
                  className="cursor-pointer text-left focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Card tilt={tiltByIndex(index)} className="flex h-full flex-col gap-3 p-6">
                    <span className="grid size-14 place-items-center border-4 border-ink bg-accent text-on-accent">
                      <Icon strokeWidth={2.5} className="size-8" />
                    </span>
                    <h3 className="font-display text-2xl font-bold uppercase leading-tight">
                      {game.title}
                    </h3>
                    <p className="font-action text-sm uppercase text-accent-dark">{game.tagline}</p>
                    <p className="font-ui text-base leading-snug">{game.description}</p>
                    <p className="mt-auto flex items-center gap-2 pt-3 font-hand text-lg">
                      <Users strokeWidth={2.5} className="size-5" />
                      {game.minPlayers}–{game.maxPlayers} jogadores
                    </p>
                  </Card>
                </motion.button>
              );
            })}
          </div>

        {/* Conta é OPCIONAL e fica DEPOIS dos botões de jogar. Ordem importa:
            quem chegou para jogar não pode tropeçar num login antes do CTA. */}
        <HostAccountCard />
        </section>

        <ThemeSwitcher className="mt-6" />

        <p className="pb-6 text-center font-hand text-lg text-on-accent opacity-80">
          Tapa · jogue com moderação, pague as prendas com dignidade
        </p>
      </main>
    </div>
  );
}
