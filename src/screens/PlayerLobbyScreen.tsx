import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Check, Dices, Gamepad2, LogIn, Play, RotateCcw, Users, WifiOff } from "lucide-react";
import { isValidPin } from "../party/pin";
import { canStart, isNicknameTaken, roomCapacity } from "../party/partyReducer";
import { clearPartyState } from "../party/partyStorage";
import { usePartyRoom } from "../party/usePartyRoom";
import { usePartyTheme } from "../party/usePartyTheme";
import { useNow } from "../party/useNow";
import { HostControls } from "../party/HostControls";
import { InviteCard } from "../party/InviteCard";
import { AdvogadoDoDiaboPlayer } from "../games/AdvogadoDoDiaboPlayer";
import { CustomTopics } from "../games/CustomTopics";
import { GamePicker } from "../games/GamePicker";
import { DevilHostActions } from "../games/DevilHostActions";
import { QuemErraPagaPlayer } from "../games/QuemErraPagaPlayer";
import { secondsLeft as computeSecondsLeft } from "../games/quemErraPaga";
import { NICKNAME_MAX_LENGTH, PLAYER_COLORS, type PartyState, type Player } from "../party/types";
import { getGame, isGameId } from "../games/registry";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { DifficultySlider } from "../ui/DifficultySlider";
import { Logo } from "../ui/Logo";
import { cn } from "../ui/cn";

function randomId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `p-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

export function PlayerLobbyScreen() {
  const { pin = "" } = useParams();
  if (!isValidPin(pin)) return <Navigate to="/join" replace />;
  return <PlayerLobby pin={pin} />;
}

function PlayerLobby({ pin }: { pin: string }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { state, me, meInParty, isHost, connection, join, updateMe, answer, vote, sendHostCommand } =
    usePartyRoom(pin);

  // O celular pega a cor da sala — inclusive quando ela gira na virada da rodada.
  usePartyTheme(state);

  // O relógio precisa correr em toda fase cronometrada, não só na rodada do quiz.
  const now = useNow((state?.phaseDeadline ?? 0) > 0);

  const [nickname, setNickname] = useState("");
  const [seed, setSeed] = useState(randomId);
  const [colorIndex, setColorIndex] = useState(0);
  const [identity] = useState(randomId);

  const players = state?.players ?? [];
  const takenColors = useMemo(
    () => new Set(players.filter((player) => player.id !== me?.id).map((player) => player.color)),
    [players, me?.id],
  );

  const trimmed = nickname.trim();
  const nameTaken = isNicknameTaken(players, trimmed, me?.id);
  const canJoin = trimmed.length > 0 && !nameTaken && connection === "connected";

  // O jogo escolhido na landing chega pela query string.
  const preselected = params.get("game");
  useEffect(() => {
    if (isHost && isGameId(preselected)) sendHostCommand({ type: "SET_GAME", gameId: preselected });
  }, [isHost, preselected, sendHostCommand]);

  /**
   * Gaveta de exceções. Com o auto-host, quase nunca é usada.
   *
   * É um ELEMENTO, não um componente declarado aqui dentro. Como função, cada
   * render criava uma identidade nova, o React remontava o HostControls e o
   * `useState` da gaveta zerava — com o relógio renderizando a cada 250ms, ela
   * fechava sozinha antes de dar para tocar em qualquer botão.
   */
  const hostSection =
    state ? (
      <HostControls
        state={state}
        onSkipPhase={() => sendHostCommand({ type: "ADVANCE" })}
        onPause={() => sendHostCommand({ type: "PAUSE" })}
        onResume={() => sendHostCommand({ type: "RESUME" })}
        onReroll={() => sendHostCommand({ type: "REROLL_PUNISHMENT" })}
        onRestart={() => sendHostCommand({ type: "RESET_TO_LOBBY" })}
        onEndParty={() => {
          clearPartyState(pin);
          navigate("/");
        }}
        onThemeChange={(themeId) => sendHostCommand({ type: "SET_THEME", themeId })}
        onThemeModeChange={(themeMode) => sendHostCommand({ type: "SET_THEME", themeMode })}
      />
    ) : null;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canJoin) return;
    const player: Player = {
      id: identity,
      nickname: trimmed,
      color: PLAYER_COLORS[colorIndex],
      avatarSeed: seed,
      score: 0,
      joinedAt: Date.now(),
    };
    join(player);
  };

  if (connection === "closed") {
    return (
      <Shell>
        <Card tilt="tilt-1" className="w-full max-w-md p-7 text-center">
          <WifiOff strokeWidth={2.5} className="mx-auto mb-3 size-12" />
          <h2 className="font-display text-3xl font-bold uppercase">A sala fechou</h2>
          <p className="mt-2 font-hand text-lg">O host encerrou a party.</p>
          <Button size="md" className="mt-5 w-full" onClick={() => navigate("/join")}>
            Entrar em outra
          </Button>
        </Card>
      </Shell>
    );
  }

  if (connection === "connecting") {
    return (
      <Shell>
        <Card tilt="tilt-3" className="w-full max-w-md p-7 text-center">
          <h2 className="font-display text-3xl font-bold uppercase">Procurando a sala {pin}</h2>
          <p className="mt-2 font-hand text-lg">
            A TV precisa estar com a sala aberta. Confere o PIN se demorar.
          </p>
          <Button size="md" variant="knockout" className="mt-5 w-full" onClick={() => navigate("/join")}>
            Trocar PIN
          </Button>
        </Card>
      </Shell>
    );
  }

  /**
   * Sala cheia. Sem esta tela, o 11º jogador preenchia o apelido, apertava
   * entrar e não acontecia nada — o reducer recusava em silêncio.
   */
  if (!meInParty && state && state.players.length >= roomCapacity(state.settings.gameId)) {
    return (
      <Shell>
        <Card tilt="tilt-2" className="w-full max-w-md p-7 text-center">
          <Users strokeWidth={2.5} className="mx-auto mb-3 size-12" />
          <h2 className="font-display text-3xl font-bold uppercase">Essa party está cheia</h2>
          <p className="mt-3 font-display text-5xl font-extrabold tabular-nums">
            {state.players.length}/{roomCapacity(state.settings.gameId)}
          </p>
          <p className="mt-3 font-hand text-lg">
            Espera alguém sair, ou peça para o host abrir outra sala.
          </p>
          <Button size="md" variant="knockout" className="mt-5 w-full" onClick={() => navigate("/join")}>
            Tentar outro PIN
          </Button>
        </Card>
      </Shell>
    );
  }

  // O jogo começou: o celular vira controle.
  if (meInParty && state && state.phase !== "LOBBY") {
    return (
      <Shell>
        {state.settings.gameId === "advogado-do-diabo" ? (
          <AdvogadoDoDiaboPlayer
            state={state}
            me={meInParty}
            secondsLeft={computeSecondsLeft(state, now)}
            onVote={vote}
          />
        ) : (
          <QuemErraPagaPlayer
            state={state}
            me={meInParty}
            secondsLeft={computeSecondsLeft(state, now)}
            onAnswer={answer}
          />
        )}
        {/* O único momento em que a máquina para e espera gente: enquanto o
            pessoal cumpre a prenda, ninguém está olhando para a TV. */}
        {state.phase === "FORFEIT_WHEEL" && isHost ? (
          <Button
            size="md"
            variant="solid"
            className="w-full max-w-md"
            onClick={() => sendHostCommand({ type: "ADVANCE" })}
          >
            <Check strokeWidth={3} className="size-6" />
            Todo mundo pagou, continuar
          </Button>
        ) : null}

        {isHost && state.settings.gameId === "advogado-do-diabo" ? (
          <DevilHostActions state={state} send={sendHostCommand} />
        ) : null}

        {state.phase === "GAME_OVER" && isHost ? (
          <div className="flex w-full max-w-md flex-col gap-3">
            <Button size="md" variant="solid" onClick={() => sendHostCommand({ type: "START_GAME" })}>
              <RotateCcw strokeWidth={3} className="size-5" />
              Jogar de novo
            </Button>
            {/* Volta ao lobby com todo mundo dentro — ninguém refaz a sala. */}
            <Button size="md" variant="paper" onClick={() => sendHostCommand({ type: "RESET_TO_LOBBY" })}>
              <Gamepad2 strokeWidth={3} className="size-5" />
              Escolher outro jogo
            </Button>
          </div>
        ) : null}
        {isHost ? hostSection : null}
      </Shell>
    );
  }

  // Já entrei: tela de espera com o roster.
  if (meInParty) {
    const game = state ? getGame(state.settings.gameId) : null;
    return (
      <Shell>
        <Card tilt="tilt-2" className="w-full max-w-md p-7 text-center">
          <Avatar
            seed={meInParty.avatarSeed}
            color={meInParty.color}
            size="md"
            className="mx-auto"
          />
          <h2 className="mt-4 font-display text-4xl font-bold uppercase leading-tight">
            {meInParty.nickname}
          </h2>
          <p className="mt-1 font-action text-base uppercase text-accent-dark">
            Você está na sala {pin}
          </p>

          <div className="mt-5 border-t-4 border-dashed border-ink pt-5">
            <p className="font-hand text-xl">
              {isHost
                ? "Você manda na sala. Configura aí embaixo."
                : `Aguardando o host começar ${game?.title ?? ""}...`}
            </p>
            {!isHost ? (
              <motion.div
                className="mt-3 flex justify-center gap-2"
                animate={{ opacity: [0.35, 1, 0.35] }}
                transition={{ repeat: Infinity, duration: 1.6 }}
                aria-hidden="true"
              >
                <span className="size-3 rounded-full bg-ink" />
                <span className="size-3 rounded-full bg-ink" />
                <span className="size-3 rounded-full bg-ink" />
              </motion.div>
            ) : null}
          </div>

          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {players.map((player) => (
              <span
                key={player.id}
                className="border-4 border-ink px-2 py-1 font-action text-sm uppercase"
                style={{ backgroundColor: player.color }}
              >
                {player.nickname}
              </span>
            ))}
          </div>

          <Button
            size="sm"
            variant="paper"
            className="mt-5 w-full"
            onClick={() => {
              const next = randomId();
              setSeed(next);
              updateMe({ avatarSeed: next });
            }}
          >
            <Dices strokeWidth={3} className="size-5" />
            Trocar rosto
          </Button>
        </Card>

        {/* Sem isto, quem cria a sala pelo celular não tem como chamar ninguém. */}
        {state?.phase === "LOBBY" ? (
          <InviteCard pin={pin} variant="phone" className="max-w-md" />
        ) : null}

        {/* Configuração da partida — só para quem manda na sala. */}
        {isHost && state ? (
          <Card tilt="tilt-3" className="flex w-full max-w-md flex-col gap-5 p-6">
            <div>
              <h3 className="mb-3 font-display text-2xl font-extrabold uppercase">Escolha o jogo</h3>
              <GamePicker
                selected={state.settings.gameId}
                onSelect={(gameId) => sendHostCommand({ type: "SET_GAME", gameId })}
              />
            </div>

            {getGame(state.settings.gameId).hasDifficulty ? (
              <div>
                <h3 className="mb-3 font-display text-2xl font-bold uppercase">Dificuldade</h3>
                <DifficultySlider
                  value={state.settings.difficulty}
                  onChange={(difficulty) => sendHostCommand({ type: "SET_DIFFICULTY", difficulty })}
                />
              </div>
            ) : null}

          </Card>
        ) : null}

        {isHost && state?.settings.gameId === "advogado-do-diabo" ? (
          <CustomTopics state={state} send={sendHostCommand} />
        ) : null}

        {isHost ? hostSection : null}

        {/* Começar mora no rodapé, sempre à mão: a configuração é alta e o
            botão principal ficava enterrado no meio da rolagem. */}
        {isHost && state ? (
          <StartBar
            state={state}
            players={players.length}
            onStart={() => sendHostCommand({ type: "START_GAME" })}
          />
        ) : null}
      </Shell>
    );
  }

  // Ainda não entrei: montagem do personagem.
  return (
    <Shell>
      <Card tilt="tilt-1" className="w-full max-w-md p-7">
        <form onSubmit={submit} className="flex flex-col gap-5">
          <h2 className="font-display text-3xl font-bold uppercase leading-tight">
            Monta o seu personagem
          </h2>

          <div className="flex flex-col items-center gap-3">
            <Avatar seed={seed} color={PLAYER_COLORS[colorIndex]} size="md" tilt="tilt-2" />
            <Button type="button" size="sm" variant="paper" onClick={() => setSeed(randomId())}>
              <Dices strokeWidth={3} className="size-5" />
              Outro rosto
            </Button>
          </div>

          <div>
            <label htmlFor="nickname" className="font-hand text-lg uppercase">
              Seu apelido
            </label>
            <input
              id="nickname"
              value={nickname}
              onChange={(event) => setNickname(event.target.value.slice(0, NICKNAME_MAX_LENGTH))}
              maxLength={NICKNAME_MAX_LENGTH}
              autoComplete="off"
              placeholder="Como te chamam?"
              aria-describedby={nameTaken ? "nickname-error" : undefined}
              className="mt-1 w-full border-4 border-ink bg-paper px-4 py-3 font-display text-2xl text-ink placeholder:opacity-30 focus:outline-4 focus:outline-offset-2 focus:outline-ink"
            />
            {nameTaken ? (
              <p id="nickname-error" role="alert" className="mt-1 font-action text-sm uppercase text-accent-dark">
                Já tem alguém com esse apelido.
              </p>
            ) : null}
          </div>

          <div>
            <p className="font-hand text-lg uppercase">Sua cor</p>
            <div className="mt-2 grid grid-cols-5 gap-2">
              {PLAYER_COLORS.map((color, index) => {
                const taken = takenColors.has(color);
                return (
                  <button
                    key={color}
                    type="button"
                    disabled={taken}
                    onClick={() => setColorIndex(index)}
                    aria-label={taken ? `Cor ${index + 1}, já escolhida` : `Cor ${index + 1}`}
                    aria-pressed={colorIndex === index}
                    style={{ backgroundColor: color }}
                    className={cn(
                      "aspect-square border-4 border-ink transition-transform",
                      "focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-ink",
                      taken && "cursor-not-allowed opacity-25",
                      !taken && "cursor-pointer motion-safe:hover:scale-110",
                      colorIndex === index && !taken && "scale-110 shadow-brutal",
                    )}
                  />
                );
              })}
            </div>
          </div>

          <Button type="submit" size="md" variant="knockout" disabled={!canJoin}>
            <LogIn strokeWidth={3} className="size-6" />
            Entrar na sala {pin}
          </Button>
        </form>
      </Card>
    </Shell>
  );
}

/**
 * Barra fixa com a ação principal do lobby.
 *
 * Também diz o que está faltando: um botão desabilitado sem explicação é o
 * tipo de coisa que trava uma festa enquanto todo mundo espera o host.
 */
function StartBar({
  state,
  players,
  onStart,
}: {
  state: PartyState;
  players: number;
  onStart: () => void;
}) {
  const game = getGame(state.settings.gameId);
  const pronto = canStart(state);
  const faltam = Math.max(0, game.minPlayers - players);

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center border-t-4 border-ink
                 bg-accent px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3"
    >
      <div className="flex w-full max-w-md flex-col gap-1">
        <Button size="md" variant="solid" disabled={!pronto} onClick={onStart}>
          <Play strokeWidth={3} className="size-6" />
          {pronto ? `Começar ${game.title}` : "Aguardando gente"}
        </Button>
        <p className="text-center font-hand text-sm text-on-accent">
          {pronto
            ? `${players} ${players === 1 ? "jogador" : "jogadores"} na sala`
            : `Faltam ${faltam} ${faltam === 1 ? "pessoa" : "pessoas"} para este jogo`}
        </p>
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    // pb generoso: a barra fixa do host flutua por cima e cobriria o final do
    // conteúdo — na votação, justamente a última nota.
    <div
      className="zine-grain flex min-h-dvh flex-col items-center justify-center gap-6
                 bg-accent px-4 pb-32 pt-8"
    >
      <Logo size="sm" />
      {children}
    </div>
  );
}
