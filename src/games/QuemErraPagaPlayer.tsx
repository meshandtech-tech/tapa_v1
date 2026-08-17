import { motion } from "motion/react";
import { Crown, Hourglass, PartyPopper, X } from "lucide-react";
import { punishments } from "../data/punishments";
import { leaderboard } from "../party/partyReducer";
import type { PartyState, Player } from "../party/types";
import { Card, Knockout } from "../ui/Card";
import { cn } from "../ui/cn";
import { currentQuestion, isCorrectAnswer, roundOutcome } from "./quemErraPaga";

const LETTERS = ["A", "B", "C", "D"];

/**
 * O "Quem Erra, Paga" inteiro no celular.
 *
 * Esta tela é AUTOSSUFICIENTE: dá para jogar a partida do começo ao fim sem
 * nunca olhar para outra tela, porque nem sempre existe uma — numa mesa de bar
 * só há celulares. Quando há TV, as duas mostram o mesmo, lendo os mesmos
 * helpers puros.
 *
 * O celular é PRIVADO, então pode mostrar o que EU marquei e se EU acertei. O
 * que nunca aparece é a resposta certa antes da revelação — senão bastaria
 * olhar o celular do vizinho.
 */
export function QuemErraPagaPlayer({
  state,
  me,
  secondsLeft,
  onAnswer,
}: {
  state: PartyState;
  me: Player;
  secondsLeft: number;
  onAnswer: (optionIndex: number) => void;
}) {
  const question = currentQuestion(state);
  const myAnswer = state.quiz?.answers[me.id];
  const answered = myAnswer !== undefined;
  const total = state.quiz?.order.length ?? 0;

  if (state.phase === "GAME_INTRO") {
    return (
      <Card tilt="tilt-2" className="w-full max-w-md p-7 text-center">
        <h2 className="font-display text-3xl font-extrabold uppercase">Quem Erra, Paga</h2>
        <p className="mt-3 font-ui text-lg leading-snug">
          {total} perguntas. Quem errar roda a roleta e paga uma prenda.
        </p>
      </Card>
    );
  }

  if (state.phase === "ROUND_ACTIVE" && question) {
    return (
      <div className="flex w-full max-w-md flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="border-4 border-ink bg-paper px-3 py-1 font-action text-sm uppercase">
            Pergunta {state.round}/{total}
          </span>
          <span
            className={cn(
              "border-4 border-ink px-4 py-1 font-display text-3xl font-extrabold tabular-nums",
              secondsLeft <= 5 ? "bg-ink text-paper" : "bg-paper text-ink",
            )}
          >
            {secondsLeft}
          </span>
        </div>

        {/* A pergunta vive AQUI também. Sem TV, é o único lugar onde ela existe. */}
        <Card className="p-5">
          <h2 className="font-display text-xl font-extrabold uppercase leading-tight">
            {question.question}
          </h2>
        </Card>

        {answered ? (
          <Knockout tilt="tilt-1" className="p-6 text-center">
            <Hourglass strokeWidth={2.5} className="mx-auto mb-2 size-10" />
            <p className="font-display text-2xl font-extrabold uppercase">Resposta enviada</p>
            <p className="mt-1 font-ui text-base">
              Você marcou <strong>{LETTERS[myAnswer]}</strong>. Não dá para trocar.
            </p>
          </Knockout>
        ) : (
          <div className="flex flex-col gap-2">
            {question.options.map((option, index) => (
              <motion.button
                key={index}
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => onAnswer(index)}
                className="flex min-h-16 cursor-pointer items-center gap-3 border-4 border-ink bg-paper px-3
                           text-left shadow-brutal
                           active:translate-x-1 active:translate-y-1 active:shadow-brutal-sm
                           focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                <span className="grid size-11 shrink-0 place-items-center border-4 border-ink bg-accent font-action text-xl text-on-accent">
                  {LETTERS[index]}
                </span>
                <span className="font-ui text-base font-bold leading-tight">{option}</span>
              </motion.button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (state.phase === "REVEAL_ANSWER" && question) {
    const acertei = isCorrectAnswer(question, myAnswer);
    const pegadinha = question.correctAnswer === null;
    return (
      <div className="flex w-full max-w-md flex-col gap-3">
        <Knockout tilt="tilt-1" className="p-6 text-center">
          <p className="text-5xl">{acertei ? "✅" : "😭"}</p>
          <h2 className="mt-2 font-display text-3xl font-extrabold uppercase">
            {acertei ? "Você acertou" : "Você errou"}
          </h2>
          <p className="mt-2 font-ui text-base leading-snug">
            {acertei
              ? "Esperando a próxima rodada..."
              : "Prepara o coração para a roleta."}
          </p>
        </Knockout>

        <Card className="p-4 text-center">
          <p className="font-action text-xs uppercase opacity-70">
            {pegadinha ? "Era pegadinha" : "Resposta certa"}
          </p>
          <p className="mt-1 font-display text-lg font-extrabold uppercase leading-tight">
            {pegadinha
              ? "Nenhuma alternativa estava certa"
              : `${LETTERS[question.correctAnswer!]} · ${question.options[question.correctAnswer!]}`}
          </p>
        </Card>
      </div>
    );
  }

  if (state.phase === "FORFEIT_WHEEL") {
    const { wrong } = roundOutcome(state);
    const euPago = wrong.some((player) => player.id === me.id);
    const prenda = punishments[state.quiz?.punishmentIndex ?? 0];
    return (
      <div className="flex w-full max-w-md flex-col gap-3">
        <Knockout tilt="tilt-2" className="p-6 text-center">
          <p className="font-action text-sm uppercase">
            {euPago ? "Você paga essa" : "Quem errou paga"}
          </p>
          <p className="mt-2 font-display text-xl font-extrabold uppercase leading-tight">
            {prenda}
          </p>
        </Knockout>
        {!euPago ? (
          <Card className="p-4 text-center">
            <p className="font-ui text-base">
              Dessa vez não foi você. Aproveita e cobra.
            </p>
          </Card>
        ) : null}
        <Card variant="dashed" className="p-3 text-center">
          <p className="font-hand text-base">
            {wrong.map((player) => player.nickname).join(", ")}
          </p>
        </Card>
      </div>
    );
  }

  if (state.phase === "LEADERBOARD" || state.phase === "GAME_OVER") {
    const ranking = leaderboard(state);
    const over = state.phase === "GAME_OVER";
    const top = ranking[0]?.score ?? 0;
    return (
      <div className="flex w-full max-w-md flex-col gap-3">
        <h2 className="text-center font-display text-2xl font-extrabold uppercase text-on-accent">
          {over ? "Fim de jogo" : `Placar · rodada ${state.round}/${total}`}
        </h2>
        <Card className="flex flex-col gap-2 p-4">
          {ranking.map((player, index) => {
            const euSou = player.id === me.id;
            const campeao = over && player.score === top && top > 0;
            return (
              <div
                key={player.id}
                className={cn(
                  "flex items-center gap-3 border-4 border-ink px-3 py-2",
                  campeao ? "bg-accent text-on-accent" : euSou ? "bg-accent-soft" : "bg-paper",
                )}
              >
                <span className="w-6 text-center font-display text-lg font-extrabold">
                  {index + 1}
                </span>
                <span className="flex-1 truncate font-action text-base uppercase">
                  {player.nickname}
                  {euSou ? " (você)" : ""}
                </span>
                {campeao ? <Crown strokeWidth={3} className="size-5" /> : null}
                <span className="font-display text-xl font-extrabold tabular-nums">
                  {player.score}
                </span>
              </div>
            );
          })}
        </Card>
        {over ? (
          <Card variant="dashed" className="flex items-center gap-2 p-3">
            <PartyPopper strokeWidth={2.5} className="size-6 shrink-0" />
            <p className="font-hand text-base">Acabou. O host escolhe o que vem agora.</p>
          </Card>
        ) : null}
      </div>
    );
  }

  return (
    <Card tilt="tilt-3" className="w-full max-w-md p-6 text-center">
      <X strokeWidth={2.5} className="mx-auto mb-2 size-8" />
      <p className="font-hand text-lg">Fase {state.phase}.</p>
    </Card>
  );
}
