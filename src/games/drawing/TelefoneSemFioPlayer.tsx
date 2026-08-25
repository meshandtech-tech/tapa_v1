import { Brush, Hourglass, Notebook, Trophy } from "lucide-react";
import { Avatar } from "../../ui/Avatar";
import { Card } from "../../ui/Card";
import { cn } from "../../ui/cn";
import { leaderboard } from "../../party/partyReducer";
import { DrawStepScreen, type DrawingSubmission } from "./DrawStepScreen";
import { GuessStepScreen } from "./GuessStepScreen";
import { PassingScreen } from "./PassingScreen";
import { RevealScreen } from "./RevealScreen";
import { WaitingCard } from "./WaitingCard";
import { assignmentFor, submissionProgress } from "./state";
import type { PartyState, Player } from "../../party/types";

/**
 * O Telefone Sem Fio de Desenho inteiro no celular.
 *
 * Como os outros jogos do Tapa, esta tela é AUTOSSUFICIENTE — não existe TV
 * nesta partida, existe uma mesa de bar cheia de celulares. E aqui isso é mais
 * do que conveniência: o jogo é feito de segredos individuais, então uma tela
 * compartilhada seria o lugar errado para quase tudo.
 */
export function TelefoneSemFioPlayer({
  pin,
  state,
  me,
  secondsLeft,
  onSubmitDrawing,
  onAttachDrawing,
  onSubmitGuess,
}: {
  pin: string;
  state: PartyState;
  me: Player;
  secondsLeft: number;
  onSubmitDrawing: (submission: DrawingSubmission) => void;
  /** Chega depois do upload; a página já existe sem ele. */
  onAttachDrawing?: (url: string) => void;
  onSubmitGuess: (text: string) => void;
}) {
  const drawing = state.drawing;
  if (!drawing) return null;

  const naPartida = drawing.seatOrder.includes(me.id);
  const jaEntreguei = drawing.submitted.includes(me.id);
  const assignment = assignmentFor(state, me.id);

  if (state.phase === "GAME_INTRO") {
    return (
      <Card tilt="tilt-2" className="w-full max-w-md p-7 text-center">
        <Notebook strokeWidth={2.5} className="mx-auto mb-3 size-12" />
        <h2 className="font-display text-3xl font-extrabold uppercase">Telefone Sem Fio</h2>
        <p className="mt-3 font-ui text-lg leading-snug">
          Cada um recebe uma palavra secreta e desenha. Depois o caderno passa
          para o lado: você vê só o desenho do vizinho e escreve o que achou que
          é. Aí alguém desenha o seu palpite, e por aí vai.
        </p>
        <p className="mt-3 font-hand text-xl">
          No fim, a gente vê o estrago que virou.
        </p>
      </Card>
    );
  }

  /**
   * Chegou depois que a partida começou.
   *
   * Os cadernos e os assentos são congelados no início — enfiar alguém no meio
   * da corrente quebraria o rodízio. Então esta pessoa entra na SALA agora e
   * na PARTIDA na próxima. O que ela NÃO faz é ficar olhando um cartão morto:
   * acompanha o andamento e assiste à revelação junto com todo mundo, que é a
   * melhor parte.
   */
  if (!naPartida) {
    if (state.phase === "REVEAL_PAGE") return <RevealScreen state={state} drawing={drawing} />;

    const { done, total } = submissionProgress(drawing);
    return (
      <Card tilt="tilt-1" className="w-full max-w-md p-7 text-center">
        <Hourglass strokeWidth={2.5} className="mx-auto mb-3 size-12" />
        <h2 className="font-display text-2xl font-extrabold uppercase">Você entra na próxima</h2>
        <p className="mt-3 font-ui text-lg leading-snug">
          Já tem uma partida rolando e os cadernos estão a caminho. Você está na
          sala — assim que esta acabar, você joga.
        </p>
        <div className="mt-5 border-t-4 border-dashed border-ink pt-5">
          <p className="font-action text-[0.7rem] uppercase tracking-wide opacity-70">
            Passo {drawing.stepIndex + 1} de {drawing.stepCount}
          </p>
          <p className="mt-1 font-display text-4xl font-extrabold tabular-nums">
            {done} / {total}
          </p>
          <p className="font-hand text-lg">já entregaram</p>
        </div>
      </Card>
    );
  }

  if (state.phase === "PASSING") return <PassingScreen />;

  if (state.phase === "DRAW_STEP") {
    if (jaEntreguei || !assignment) {
      return (
        <WaitingCard drawing={drawing} players={state.players} titulo="Desenho enviado" />
      );
    }
    return (
      <DrawStepScreen
        pin={pin}
        matchId={drawing.matchId}
        assignment={assignment}
        playerId={me.id}
        secondsLeft={secondsLeft}
        onSubmit={onSubmitDrawing}
        onAttach={onAttachDrawing}
      />
    );
  }

  if (state.phase === "GUESS_STEP") {
    if (jaEntreguei || !assignment) {
      return (
        <WaitingCard drawing={drawing} players={state.players} titulo="Palpite enviado" />
      );
    }
    return (
      <GuessStepScreen
        assignment={assignment}
        secondsLeft={secondsLeft}
        onSubmit={onSubmitGuess}
      />
    );
  }

  if (state.phase === "REVEAL_INTRO") {
    return (
      <Card tilt="tilt-3" className="w-full max-w-md p-7 text-center">
        <Brush strokeWidth={2.5} className="mx-auto mb-3 size-12" />
        <h2 className="font-display text-3xl font-extrabold uppercase">
          Os cadernos voltaram
        </h2>
        <p className="mt-3 font-ui text-lg leading-snug">
          {drawing.chains.length} cadernos deram a volta na mesa. Preparados para ver o
          que sobrou das palavras?
        </p>
      </Card>
    );
  }

  if (state.phase === "REVEAL_PAGE") {
    return <RevealScreen state={state} drawing={drawing} />;
  }

  if (state.phase === "GAME_OVER") {
    const ranking = leaderboard(state);
    const topo = ranking[0]?.score ?? 0;
    return (
      <div className="flex w-full max-w-md flex-col gap-3">
        <h2 className="text-center font-display text-2xl font-extrabold uppercase text-on-accent">
          Placar final
        </h2>
        <Card className="flex flex-col gap-2 p-4">
          {ranking.map((player, index) => {
            const euSou = player.id === me.id;
            // Empate é normal e não incomoda: o prêmio de verdade foi a revelação.
            const campeao = player.score === topo && topo > 0;
            return (
              <div
                key={player.id}
                className={cn(
                  "flex items-center gap-3 border-4 border-ink px-3 py-2",
                  campeao ? "bg-accent text-on-accent" : euSou ? "bg-accent-soft" : "bg-paper",
                )}
              >
                <span className="w-6 text-center font-display text-lg font-extrabold">
                  {campeao ? <Trophy strokeWidth={3} className="size-5" /> : index + 1}
                </span>
                <Avatar seed={player.avatarSeed} color={player.color} size="sm" />
                <span className="flex-1 truncate font-action text-base uppercase">
                  {player.nickname}
                </span>
                <span className="font-display text-2xl font-extrabold tabular-nums">
                  {player.score}
                </span>
              </div>
            );
          })}
        </Card>
        <p className="text-center font-hand text-lg text-on-accent">
          Um ponto por palavra que sobreviveu à mesa.
        </p>
      </div>
    );
  }

  return null;
}
