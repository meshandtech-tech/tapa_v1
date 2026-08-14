import { motion } from "motion/react";
import { Check, Hourglass, PartyPopper, X } from "lucide-react";
import { punishments } from "../data/punishments";
import { leaderboard } from "../party/partyReducer";
import type { PartyState, Player } from "../party/types";
import { Button } from "../ui/Button";
import { Card, Knockout } from "../ui/Card";
import { cn } from "../ui/cn";
import { currentQuestion, isCorrectAnswer } from "./quemErraPaga";

const LETTERS = ["A", "B", "C", "D"];

/**
 * Visão do celular durante o "Quem Erra, Paga".
 *
 * O celular é PRIVADO: aqui pode aparecer o que EU marquei e se EU acertei.
 * O que nunca aparece é a resposta certa antes da TV revelar — senão bastava
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

  if (state.phase === "GAME_INTRO") {
    return (
      <Card tilt="tilt-2" className="w-full max-w-md p-7 text-center">
        <h2 className="font-display text-3xl font-bold uppercase">Segura o celular</h2>
        <p className="mt-2 font-hand text-xl">
          As perguntas aparecem na tela grande. Você responde por aqui.
        </p>
      </Card>
    );
  }

  if (state.phase === "ROUND_ACTIVE" && question) {
    return (
      <Card tilt="tilt-1" className="w-full max-w-md p-6">
        <div className="mb-4 flex items-center justify-between">
          <span className="font-action text-lg uppercase">Pergunta {state.round}</span>
          <span
            className={cn(
              "border-4 border-ink px-3 py-1 font-display text-2xl font-extrabold tabular-nums",
              secondsLeft <= 5 ? "bg-ink text-paper" : "bg-paper text-ink",
            )}
          >
            {secondsLeft}
          </span>
        </div>

        {answered ? (
          <div className="py-6 text-center">
            <Hourglass strokeWidth={2.5} className="mx-auto mb-3 size-12" />
            <p className="font-display text-2xl font-bold uppercase">Resposta enviada</p>
            <p className="mt-1 font-hand text-lg">
              Você marcou <strong>{LETTERS[myAnswer]}</strong>. Agora aguenta o coração.
            </p>
          </div>
        ) : (
          <>
            {/* O texto da pergunta fica na TV; aqui só as letras, para o
                jogador olhar para cima em vez de para o celular. */}
            <p className="mb-4 text-center font-hand text-lg">
              Olha a pergunta na tela e escolhe:
            </p>
            <div className="grid gap-3">
              {question.options.map((option, index) => (
                <motion.button
                  key={index}
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  onClick={() => onAnswer(index)}
                  className="flex cursor-pointer items-center gap-3 border-4 border-ink bg-paper p-3
                             text-left shadow-brutal transition-transform
                             focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-ink
                             motion-safe:hover:-translate-y-0.5"
                >
                  <span className="grid size-11 shrink-0 place-items-center border-4 border-ink bg-accent font-action text-xl text-on-accent">
                    {LETTERS[index]}
                  </span>
                  <span className="font-ui text-base leading-snug">{option}</span>
                </motion.button>
              ))}
            </div>
          </>
        )}
      </Card>
    );
  }

  if (state.phase === "REVEAL_ANSWER" && question) {
    const hit = isCorrectAnswer(question, myAnswer);
    return (
      <Card tilt="tilt-3" className="w-full max-w-md p-7 text-center">
        {hit ? (
          <Check strokeWidth={3} className="mx-auto mb-3 size-16" />
        ) : (
          <X strokeWidth={3} className="mx-auto mb-3 size-16" />
        )}
        <h2 className="font-display text-4xl font-extrabold uppercase leading-tight">
          {hit ? "Acertou!" : answered ? "Errou!" : "Deixou passar!"}
        </h2>
        <p className="mt-2 font-hand text-xl">
          {hit
            ? "Um ponto para você. Olha o placar na tela."
            : question.correctAnswer === null
              ? "Era pegadinha: não tinha resposta certa. Todo mundo paga."
              : "Prepara o bolso: a roleta vem aí."}
        </p>
      </Card>
    );
  }

  if (state.phase === "FORFEIT_WHEEL") {
    const index = state.quiz?.punishmentIndex ?? 0;
    const paying = !isCorrectAnswer(question!, myAnswer);
    return (
      <Card tilt="tilt-2" className="w-full max-w-md p-7 text-center">
        <h2 className="font-display text-3xl font-bold uppercase">
          {paying ? "Você paga essa" : "Você escapou"}
        </h2>
        <Knockout className="mt-4 p-5">
          <p className="font-display text-xl font-extrabold uppercase leading-snug">
            {punishments[index]}
          </p>
        </Knockout>
        {paying ? (
          // A pessoa precisa SABER que pode recusar, senão a válvula de escape
          // só existe para quem está perto da TV.
          <p className="mt-4 font-hand text-lg">
            Não curtiu essa? Pede pro host rodar de novo — sem climão.
          </p>
        ) : (
          <p className="mt-4 font-hand text-lg">Aproveita e assiste ao vexame.</p>
        )}
      </Card>
    );
  }

  if (state.phase === "LEADERBOARD" || state.phase === "GAME_OVER") {
    const ranking = leaderboard(state);
    const position = ranking.findIndex((player) => player.id === me.id) + 1;
    const mine = ranking.find((player) => player.id === me.id);
    const over = state.phase === "GAME_OVER";

    return (
      <Card tilt="tilt-1" className="w-full max-w-md p-7 text-center">
        {over ? <PartyPopper strokeWidth={2.5} className="mx-auto mb-3 size-14" /> : null}
        <h2 className="font-display text-3xl font-bold uppercase">
          {over ? "Fim de jogo" : "Placar parcial"}
        </h2>
        <p className="mt-4 font-display text-6xl font-extrabold leading-none">
          {position}º
        </p>
        <p className="mt-1 font-hand text-xl">
          {mine?.score ?? 0} {mine?.score === 1 ? "ponto" : "pontos"}
        </p>
        {over ? (
          <p className="mt-4 font-hand text-lg">
            {position === 1 ? "Você venceu. Pode se gabar." : "Fica pra próxima."}
          </p>
        ) : (
          <p className="mt-4 font-hand text-lg">Olha a próxima pergunta na tela.</p>
        )}
      </Card>
    );
  }

  return (
    <Card tilt="tilt-2" className="w-full max-w-md p-7 text-center">
      <h2 className="font-display text-2xl font-bold uppercase">Aguenta aí</h2>
      <p className="mt-2 font-hand text-lg">Esperando a TV.</p>
      <Button size="sm" variant="ghost" className="mt-4" disabled>
        {state.phase}
      </Button>
    </Card>
  );
}
