import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Check, Copy, Crown, Pause, Smartphone, TriangleAlert, Users } from "lucide-react";
import { QuemErraPagaHost } from "../games/QuemErraPagaHost";
import { phaseProgress, secondsLeft as computeSecondsLeft } from "../games/quemErraPaga";
import { getGame, isGameId, phaseDuration } from "../games/registry";
import { activeTransport } from "../party/channel";
import { buildInviteUrl, isValidPin } from "../party/pin";
import { roomCapacity } from "../party/partyReducer";
import { usePartyHost } from "../party/usePartyHost";
import { useGameIdentity, usePartyTheme } from "../party/usePartyTheme";
import { useNow } from "../party/useNow";
import { DIFFICULTY_LABELS } from "../party/types";
import { Avatar } from "../ui/Avatar";
import { Card, Knockout } from "../ui/Card";
import { Logo } from "../ui/Logo";
import { cn, tiltByIndex } from "../ui/cn";

const transport = activeTransport();

export function HostLobbyScreen() {
  const { pin = "" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  if (!isValidPin(pin)) return <Navigate to="/" replace />;
  return <HostLobby pin={pin} preselectedGame={params.get("game")} onExit={() => navigate("/")} />;
}

/**
 * A TELA DA TV.
 *
 * Não tem nenhum botão de avanço: a partida corre sozinha (auto-host) e os
 * controles de exceção vivem no celular de quem é host. É proposital — esta é
 * a tela que o grupo inteiro está olhando, e ninguém deveria ficar preso
 * clicando nela em vez de jogar.
 */
function HostLobby({
  pin,
  preselectedGame,
  onExit,
}: {
  pin: string;
  preselectedGame: string | null;
  onExit: () => void;
}) {
  const { state, dispatch } = usePartyHost(pin);
  const [copied, setCopied] = useState(false);

  usePartyTheme(state);
  // Enquanto o jogo roda, a paleta é a do jogo; no lobby volta a da party.
  useGameIdentity(state);

  // O jogo escolhido na landing chega pela query string.
  useEffect(() => {
    if (isGameId(preselectedGame)) dispatch({ type: "SET_GAME", gameId: preselectedGame });
  }, [preselectedGame, dispatch]);

  const game = getGame(state.settings.gameId);
  const inviteUrl = buildInviteUrl(pin, window.location.origin);
  const capacity = roomCapacity(state.settings.gameId);
  const missing = Math.max(0, game.minPlayers - state.players.length);

  const now = useNow(state.phaseDeadline > 0);
  const secondsLeft = computeSecondsLeft(state, now);
  const total = phaseDuration(state.settings.gameId, state.phase);
  const progress = phaseProgress(state, now, total);

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={cn("min-h-dvh bg-accent px-5 py-6 lg:px-10", game.identity.pattern)}>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <button type="button" onClick={onExit} className="cursor-pointer">
          <Logo size="sm" />
        </button>
        {state.phase !== "LOBBY" ? (
          <span className="border-4 border-ink bg-paper px-4 py-2 font-action text-lg uppercase">
            {game.title} · {state.round > 0 ? `Rodada ${state.round}` : "Começando"}
          </span>
        ) : null}
      </header>

      {/* Barra fina do tempo da fase: o grupo sente que algo vai acontecer,
          sem um cronômetro gigante competindo com o conteúdo. */}
      {state.phaseDeadline > 0 ? (
        <div className="mb-6 h-3 w-full border-4 border-ink bg-paper">
          <div
            className="h-full bg-ink transition-[width] duration-200 ease-linear"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      ) : null}

      {state.pausedAt !== null ? (
        <Knockout tilt="tilt-1" className="mx-auto mb-6 flex max-w-md items-center gap-3 p-4">
          <Pause strokeWidth={3} className="size-7" />
          <p className="font-display text-2xl font-bold uppercase">Pausado pelo host</p>
        </Knockout>
      ) : null}

      {state.phase !== "LOBBY" ? (
        <QuemErraPagaHost state={state} secondsLeft={secondsLeft} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
          {/* Como entrar. */}
          <div className="flex flex-col gap-5">
            <Knockout tilt="tilt-1" className="p-6 text-center">
              <p className="font-hand text-xl uppercase tracking-widest">Entre com o PIN</p>
              <p className="font-display text-[clamp(4rem,12vw,7rem)] font-extrabold leading-none tracking-[0.15em]">
                {pin}
              </p>
            </Knockout>

            <Card tilt="tilt-2" className="flex flex-col items-center gap-4 p-6">
              <p className="flex items-center gap-2 font-hand text-xl uppercase">
                <Smartphone strokeWidth={2.5} className="size-6" />
                Ou aponte a câmera
              </p>
              <div className="border-4 border-ink bg-paper p-3">
                <QRCodeSVG value={inviteUrl} size={180} level="M" bgColor="#ffffff" fgColor="#000000" />
              </div>
              <code className="w-full break-all text-center font-ui text-sm">{inviteUrl}</code>
              <button
                type="button"
                onClick={copyInvite}
                className="flex w-full cursor-pointer items-center justify-center gap-2 border-4 border-ink
                           bg-paper px-4 py-2 font-action text-base uppercase shadow-brutal
                           focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                {copied ? <Check strokeWidth={3} className="size-5" /> : <Copy strokeWidth={3} className="size-5" />}
                {copied ? "Link copiado" : "Copiar convite"}
              </button>
            </Card>

            {transport === "local" ? (
              <Card variant="dashed" className="flex gap-3 p-4">
                <TriangleAlert strokeWidth={2.5} className="size-6 shrink-0" />
                <p className="font-hand text-lg leading-snug">
                  Modo local: só entram abas <strong>deste</strong> navegador.
                </p>
              </Card>
            ) : null}
          </div>

          {/* Quem já está na sala. A contagem é derivada, nunca configurada. */}
          <div className="flex flex-col gap-5">
            <Card className="p-6">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <h2 className="flex items-center gap-3 font-display text-[clamp(2rem,5vw,3.5rem)] font-extrabold uppercase leading-none">
                  <Users strokeWidth={2.5} className="size-10" />
                  {state.players.length}/{capacity} jogadores
                </h2>
              </div>

              {state.players.length === 0 ? (
                <p className="py-10 text-center font-hand text-2xl opacity-70">
                  Ninguém ainda. Manda o PIN pro grupo.
                </p>
              ) : (
                <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                  <AnimatePresence initial={false}>
                    {state.players.map((player, index) => (
                      <motion.li
                        key={player.id}
                        layout
                        initial={{ opacity: 0, scale: 0.6, rotate: -8 }}
                        animate={{ opacity: 1, scale: 1, rotate: 0 }}
                        exit={{ opacity: 0, scale: 0.6 }}
                        transition={{ type: "spring", stiffness: 320, damping: 18 }}
                        className="flex flex-col items-center gap-2"
                      >
                        <Avatar
                          seed={player.avatarSeed}
                          color={player.color}
                          size="tv"
                          tilt={tiltByIndex(index)}
                        />
                        <span className="flex max-w-full items-center gap-1 truncate border-4 border-ink bg-paper px-2 py-1 font-action text-base uppercase">
                          {player.id === state.hostPlayerId ? (
                            <Crown strokeWidth={3} className="size-4 shrink-0" />
                          ) : null}
                          {player.nickname}
                          <Check strokeWidth={3} className="size-4 shrink-0" />
                        </span>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </Card>

            {/* Vitrine do que está configurado. Quem MUDA isso é o celular do host. */}
            <Card className="flex flex-col gap-3 p-6">
              <div className="flex flex-wrap items-center gap-3">
                <span className="grid size-14 shrink-0 place-items-center border-4 border-ink bg-accent text-on-accent">
                  <game.icon strokeWidth={2.5} className="size-8" />
                </span>
                <div>
                  <h3 className="font-display text-3xl font-bold uppercase leading-none">
                    {game.title}
                  </h3>
                  {game.hasDifficulty ? (
                    <p className="font-action text-lg uppercase text-accent-dark">
                      {DIFFICULTY_LABELS[state.settings.difficulty]}
                    </p>
                  ) : null}
                </div>
              </div>
              <p className="border-t-4 border-dashed border-ink pt-3 font-hand text-2xl">
                {missing > 0
                  ? `Faltam ${missing} ${missing === 1 ? "jogador" : "jogadores"} para começar.`
                  : "Tudo pronto — o host começa pelo celular."}
              </p>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
