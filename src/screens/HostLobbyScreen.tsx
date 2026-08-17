import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { Check, Copy, Crown, Pause, Smartphone, TriangleAlert, Users } from "lucide-react";
import { AdvogadoDoDiaboHost } from "../games/AdvogadoDoDiaboHost";
import { QuemErraPagaHost } from "../games/QuemErraPagaHost";
import { phaseProgress, secondsLeft as computeSecondsLeft } from "../games/quemErraPaga";
import { getGame, phaseDuration } from "../games/registry";
import { activeTransport } from "../party/channel";
import { buildInviteUrl, isValidPin } from "../party/pin";
import { roomCapacity } from "../party/partyReducer";
import { usePartyRoom } from "../party/usePartyRoom";
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
  const navigate = useNavigate();

  if (!isValidPin(pin)) return <Navigate to="/" replace />;
  return <HostLobby pin={pin} onExit={() => navigate("/")} />;
}

/**
 * A TELA DA TV.
 *
 * Não tem nenhum botão de avanço: a partida corre sozinha (auto-host) e os
 * controles de exceção vivem no celular de quem é host. É proposital — esta é
 * a tela que o grupo inteiro está olhando, e ninguém deveria ficar preso
 * clicando nela em vez de jogar.
 */
function HostLobby({ pin, onExit }: { pin: string; onExit: () => void }) {
  // Espectador: a TV só exibe. Nunca comanda e nunca vira autoridade.
  const { state } = usePartyRoom(pin, { spectator: true });
  const [copied, setCopied] = useState(false);

  usePartyTheme(state);
  // Enquanto o jogo roda, a paleta é a do jogo; no lobby volta a da party.
  useGameIdentity(state);

  const now = useNow((state?.phaseDeadline ?? 0) > 0);

  /**
   * A TV é opcional e passiva: quem comanda é o celular de quem criou a sala.
   * Até esse aparelho transmitir o primeiro estado, não há nada para exibir.
   */
  if (!state) {
    return (
      <div className="zine-grain flex min-h-dvh flex-col items-center justify-center gap-6 bg-accent px-6 text-center">
        <Logo size="md" />
        <Knockout tilt="tilt-1" className="px-[3vw] py-[3vh]">
          <p className="font-hand text-2xl uppercase tracking-widest">Tela grande da sala</p>
          <p className="font-display text-[clamp(4rem,12vw,8rem)] font-extrabold leading-none tracking-[0.15em]">
            {pin}
          </p>
        </Knockout>
        <p className="max-w-xl font-hand text-2xl text-on-accent">
          Esperando a sala abrir. Quem criou a party comanda pelo celular — esta
          tela só mostra o jogo.
        </p>
      </div>
    );
  }

  const game = getGame(state.settings.gameId);
  const inviteUrl = buildInviteUrl(pin, window.location.origin);
  const capacity = roomCapacity(state.settings.gameId);
  const missing = Math.max(0, game.minPlayers - state.players.length);
  const host = state.players.find((player) => player.id === state.hostPlayerId) ?? null;
  const emJogo = state.phase !== "LOBBY";

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
    <div
      className={cn(
        "bg-accent px-5 lg:px-10",
        game.identity.pattern,
        // Durante o jogo a TV é uma tela fixa: altura travada e nada de
        // rolagem, senão em 1366x768 a pergunta escorrega para fora do quadro.
        // No lobby o conteúdo é alto e precisa rolar no celular.
        emJogo ? "flex h-dvh flex-col overflow-hidden py-[2vh]" : "min-h-dvh py-6",
      )}
    >
      <header className={cn("flex flex-wrap items-center justify-between gap-4", emJogo ? "mb-[1.5vh]" : "mb-6")}>
        <button type="button" onClick={onExit} className="cursor-pointer">
          <Logo size="sm" />
        </button>
        {emJogo ? (
          <span className="border-4 border-ink bg-paper px-4 py-2 font-action text-lg uppercase">
            {game.title} · {state.round > 0 ? `Rodada ${state.round}` : "Começando"}
          </span>
        ) : null}
      </header>

      {/* Barra fina do tempo da fase: o grupo sente que algo vai acontecer,
          sem um cronômetro gigante competindo com o conteúdo. */}
      {state.phaseDeadline > 0 ? (
        <div className={cn("h-3 w-full shrink-0 border-4 border-ink bg-paper", emJogo ? "mb-[1.5vh]" : "mb-6")}>
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

      {emJogo ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          {state.settings.gameId === "advogado-do-diabo" ? (
            <AdvogadoDoDiaboHost state={state} secondsLeft={secondsLeft} />
          ) : (
            <QuemErraPagaHost state={state} secondsLeft={secondsLeft} />
          )}
        </div>
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
              {/* Dizer QUEM manda importa: sem isso, uma sala sem host vira um
                  mistério — foi exatamente assim que a festa travou uma vez. */}
              <p className="border-t-4 border-dashed border-ink pt-3 font-hand text-2xl">
                {missing > 0
                  ? `Faltam ${missing} ${missing === 1 ? "jogador" : "jogadores"} para começar.`
                  : host
                    ? `Tudo pronto — ${host.nickname} começa pelo celular.`
                    : "Tudo pronto. Entre pelo celular para começar."}
              </p>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
