import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Check, Copy, DoorOpen, Play, Smartphone, Users } from "lucide-react";
import { GAMES, getGame, isGameId } from "../games/registry";
import { buildInviteUrl, isValidPin } from "../party/pin";
import { canStart } from "../party/partyReducer";
import { clearPartyState } from "../party/partyStorage";
import { usePartyHost } from "../party/usePartyHost";
import { usePartyTheme } from "../party/usePartyTheme";
import { DIFFICULTIES, DIFFICULTY_LABELS, MAX_PLAYERS } from "../party/types";
import { ThemeSwitcher } from "../theme/ThemeSwitcher";
import { Button } from "../ui/Button";
import { Card, Knockout } from "../ui/Card";
import { Avatar } from "../ui/Avatar";
import { Logo } from "../ui/Logo";
import { cn, tiltByIndex } from "../ui/cn";

export function HostLobbyScreen() {
  const { pin = "" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  if (!isValidPin(pin)) return <Navigate to="/" replace />;
  return <HostLobby pin={pin} preselectedGame={params.get("game")} onExit={() => navigate("/")} />;
}

function HostLobby({
  pin,
  preselectedGame,
  onExit,
}: {
  pin: string;
  preselectedGame: string | null;
  onExit: () => void;
}) {
  const { state, dispatch, closeParty } = usePartyHost(pin);
  const [copied, setCopied] = useState(false);

  // A TV também obedece ao tema da party — é a mesma fonte que pinta os celulares.
  usePartyTheme(state);

  // O jogo escolhido na landing chega pela query string.
  useEffect(() => {
    if (isGameId(preselectedGame)) dispatch({ type: "SET_GAME", gameId: preselectedGame });
  }, [preselectedGame, dispatch]);

  const endParty = () => {
    closeParty();
    clearPartyState(pin);
    onExit();
  };

  const game = getGame(state.settings.gameId);
  const inviteUrl = buildInviteUrl(pin, window.location.origin);
  const ready = canStart(state);
  const missing = Math.max(0, game.minPlayers - state.players.length);

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
    <div className="zine-grain min-h-dvh bg-accent px-5 py-6 lg:px-10">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <button type="button" onClick={onExit} className="cursor-pointer">
          <Logo size="sm" />
        </button>
        <div className="flex flex-wrap items-center gap-3">
          <ThemeSwitcher
            onThemeChange={(themeId) => dispatch({ type: "SET_THEME", themeId })}
            onModeChange={(themeMode) => dispatch({ type: "SET_THEME", themeMode })}
          />
          <Button size="sm" variant="knockout" onClick={endParty}>
            <DoorOpen strokeWidth={3} className="size-5" />
            Encerrar sala
          </Button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        {/* Coluna de entrada: PIN, QR e link. */}
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
            <Button size="sm" variant="paper" onClick={copyInvite} className="w-full">
              {copied ? <Check strokeWidth={3} className="size-5" /> : <Copy strokeWidth={3} className="size-5" />}
              {copied ? "Link copiado" : "Copiar convite"}
            </Button>
          </Card>
        </div>

        {/* Coluna da sala: jogadores e configuração. */}
        <div className="flex flex-col gap-5">
          <Card className="p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-display text-3xl font-bold uppercase">
                <Users strokeWidth={2.5} className="size-8" />
                Na sala
              </h2>
              <span className="border-4 border-ink bg-accent px-3 py-1 font-action text-lg uppercase text-on-accent">
                {state.players.length}/{MAX_PLAYERS}
              </span>
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
                      <span className="max-w-full truncate border-4 border-ink bg-paper px-2 py-1 font-action text-base uppercase">
                        {player.nickname}
                      </span>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </Card>

          <Card className="flex flex-col gap-5 p-6">
            <div>
              <h3 className="mb-3 font-display text-2xl font-bold uppercase">Jogo</h3>
              <div className="flex flex-wrap gap-3">
                {GAMES.map((option) => {
                  const Icon = option.icon;
                  const active = option.id === state.settings.gameId;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => dispatch({ type: "SET_GAME", gameId: option.id })}
                      aria-pressed={active}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 border-4 border-ink px-4 py-2",
                        "font-action text-base uppercase transition-transform",
                        "focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-ink",
                        "motion-safe:hover:-translate-y-0.5",
                        active ? "bg-ink text-paper shadow-brutal" : "bg-paper text-ink",
                      )}
                    >
                      <Icon strokeWidth={2.5} className="size-5" />
                      {option.title}
                    </button>
                  );
                })}
              </div>
            </div>

            {game.hasDifficulty ? (
              <div>
                <h3 className="mb-3 font-display text-2xl font-bold uppercase">Dificuldade</h3>
                <div className="flex flex-wrap gap-3">
                  {DIFFICULTIES.map((difficulty) => {
                    const active = difficulty === state.settings.difficulty;
                    return (
                      <button
                        key={difficulty}
                        type="button"
                        onClick={() => dispatch({ type: "SET_DIFFICULTY", difficulty })}
                        aria-pressed={active}
                        className={cn(
                          "cursor-pointer border-4 border-ink px-5 py-2 font-action text-base uppercase",
                          "focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-ink",
                          "motion-safe:hover:-translate-y-0.5 transition-transform",
                          active ? "bg-accent text-on-accent shadow-brutal" : "bg-paper text-ink",
                        )}
                      >
                        {DIFFICULTY_LABELS[difficulty]}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-4 border-t-4 border-dashed border-ink pt-5">
              <Button
                size="tv"
                variant="solid"
                disabled={!ready}
                onClick={() => dispatch({ type: "START_GAME" })}
              >
                <Play strokeWidth={3} className="size-7" />
                Começar
              </Button>
              {!ready ? (
                <p className="font-hand text-xl">
                  Faltam {missing} {missing === 1 ? "jogador" : "jogadores"} para{" "}
                  {game.title}.
                </p>
              ) : (
                <p className="font-hand text-xl">Tudo pronto. Solta o jogo.</p>
              )}
            </div>
          </Card>
        </div>
      </div>

      {state.phase !== "LOBBY" ? (
        <Card variant="speech" tilt="tilt-2" className="mt-6 p-5">
          <p className="font-display text-2xl font-bold uppercase">
            Fase atual: {state.phase}
          </p>
          <p className="font-hand text-lg">
            As telas do jogo entram na próxima etapa. Por enquanto, a máquina de
            estados já está rodando.
          </p>
          <Button size="sm" className="mt-3" onClick={() => dispatch({ type: "RESET_TO_LOBBY" })}>
            Voltar ao lobby
          </Button>
        </Card>
      ) : null}
    </div>
  );
}
