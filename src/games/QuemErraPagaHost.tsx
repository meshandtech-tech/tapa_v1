import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Crown, Timer, TriangleAlert, X } from "lucide-react";
import { punishments } from "../data/punishments";
import { leaderboard } from "../party/partyReducer";
import type { PartyState } from "../party/types";
import { Avatar } from "../ui/Avatar";
import { Card, Knockout } from "../ui/Card";
import { Wheel } from "../ui/Wheel";
import { cn, tiltByIndex } from "../ui/cn";
import { currentQuestion, roundOutcome } from "./quemErraPaga";

const LETTERS = ["A", "B", "C", "D"];

/** Rótulos curtos para caber no segmento da roleta. */
// A identidade da fatia é o índice da prenda NO ACERVO, não a posição visual.
// São a mesma coisa aqui (a roleta mostra o acervo inteiro, na ordem), mas
// declarar o id explicitamente impede que uma futura filtragem faça o
// resultado apontar para outra prenda.
const WHEEL_ITEMS = punishments.map((prenda, indice) => ({
  id: `punishment:${indice}`,
  label: prenda.split(" ").slice(0, 3).join(" "),
}));

function PlayerChips({ players }: { players: PartyState["players"] }) {
  if (players.length === 0) return null;
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {players.map((player) => (
        <span
          key={player.id}
          className="border-4 border-ink px-3 py-1 font-action text-lg uppercase text-ink"
          style={{ backgroundColor: player.color }}
        >
          {player.nickname}
        </span>
      ))}
    </div>
  );
}

/**
 * Visão da TV durante o "Quem Erra, Paga".
 *
 * Sem nenhum botão: a partida corre sozinha e os controles de exceção vivem no
 * celular do host. Esta tela é PÚBLICA — nunca mostra a resposta certa durante
 * a rodada, nem a prenda antes da roleta parar.
 */
export function QuemErraPagaHost({
  state,
  secondsLeft,
}: {
  state: PartyState;
  secondsLeft: number;
}) {
  const question = currentQuestion(state);
  const { correct, wrong, pending } = roundOutcome(state);
  const total = state.quiz?.order.length ?? 0;
  const punishmentIndex = state.quiz?.punishmentIndex ?? 0;

  // O resultado da roleta só existe depois que ela para.
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    setRevealed(false);
  }, [state.phase, punishmentIndex]);

  if (state.phase === "GAME_INTRO") {
    return (
      <Card variant="speech" tilt="tilt-1" className="mx-auto max-w-3xl p-10 text-center">
        <p className="font-hand text-2xl uppercase tracking-widest">Prepara que vem</p>
        <h2 className="my-4 font-display text-[clamp(2.5rem,7vw,5rem)] font-extrabold uppercase leading-none">
          Quem Erra, Paga
        </h2>
        <p className="mb-5 font-hand text-2xl">
          {total} perguntas. Quem errar roda a roleta e paga uma prenda.
        </p>
        <PlayerChips players={state.players} />
      </Card>
    );
  }

  if (state.phase === "ROUND_ACTIVE" && question) {
    const urgent = secondsLeft <= 5;
    return (
      // Ocupa o quadro da TV: sem isto, tudo se aperta no topo e sobra um
      // terço de tela vazia justamente onde o texto precisa ser grande.
      <div className="mx-auto flex min-h-[calc(100dvh-12rem)] w-full max-w-[110rem] flex-col justify-center gap-[2.5vh]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <span className="border-4 border-ink bg-paper px-5 py-2 font-action text-[clamp(1rem,1.6vw,1.75rem)] uppercase">
            Pergunta {state.round} de {total}
          </span>
          <motion.div
            animate={urgent ? { scale: [1, 1.12, 1] } : { scale: 1 }}
            transition={urgent ? { repeat: Infinity, duration: 0.7 } : undefined}
          >
            <Knockout className="flex items-center gap-3 px-[1.5vw] py-[1vh]">
              <Timer strokeWidth={3} className="size-[clamp(1.75rem,3vw,3rem)]" />
              <span className="font-display text-[clamp(2.5rem,6vw,6rem)] font-extrabold leading-none tabular-nums">
                {secondsLeft}
              </span>
            </Knockout>
          </motion.div>
        </div>

        <Card className="px-[3vw] py-[3.5vh] text-center">
          <h2 className="font-display text-[clamp(2rem,5.2vw,5.5rem)] font-extrabold uppercase leading-[1.05]">
            {question.question}
          </h2>
        </Card>

        {/* Alternativas grandes: precisam ser lidas do outro lado da sala. */}
        <div className="grid gap-[1.5vh] sm:grid-cols-2 sm:gap-[1.5vw]">
          {question.options.map((option, index) => (
            <Card
              key={index}
              tilt={tiltByIndex(index)}
              className="flex items-center gap-[1.5vw] px-[1.5vw] py-[2vh]"
            >
              <span className="grid size-[clamp(2.5rem,4vw,4.5rem)] shrink-0 place-items-center border-4 border-ink bg-accent font-action text-[clamp(1.25rem,2.4vw,2.75rem)] text-on-accent">
                {LETTERS[index]}
              </span>
              <span className="font-ui text-[clamp(1.25rem,2.6vw,3rem)] font-bold leading-tight">
                {option}
              </span>
            </Card>
          ))}
        </div>

        <Card variant="dashed" className="px-4 py-[1.5vh] text-center">
          <p className="font-hand text-[clamp(1rem,1.8vw,1.75rem)]">
            {pending.length === 0
              ? "Todo mundo respondeu."
              : `Faltam ${pending.length} de ${state.players.length} responderem...`}
          </p>
        </Card>
      </div>
    );
  }

  if (state.phase === "REVEAL_ANSWER" && question) {
    const trap = question.correctAnswer === null;
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6 text-center">
        <Knockout tilt="tilt-1" className="p-8">
          <p className="font-hand text-2xl uppercase tracking-widest">
            {trap ? "Era pegadinha" : "Resposta certa"}
          </p>
          <p className="mt-2 font-display text-[clamp(1.75rem,4vw,3rem)] font-extrabold uppercase leading-tight">
            {trap
              ? "Nenhuma alternativa estava certa"
              : `${LETTERS[question.correctAnswer!]} · ${question.options[question.correctAnswer!]}`}
          </p>
        </Knockout>

        <div className="grid gap-5 sm:grid-cols-2">
          <Card className="p-5">
            <h3 className="mb-3 flex items-center justify-center gap-2 font-display text-3xl font-bold uppercase">
              <Check strokeWidth={3} className="size-8" />
              Acertaram
            </h3>
            {correct.length === 0 ? (
              <p className="font-hand text-xl opacity-70">Ninguém. Que vergonha.</p>
            ) : (
              <PlayerChips players={correct} />
            )}
          </Card>

          <Card className="p-5">
            <h3 className="mb-3 flex items-center justify-center gap-2 font-display text-3xl font-bold uppercase">
              <X strokeWidth={3} className="size-8" />
              Vão pagar
            </h3>
            {wrong.length === 0 ? (
              <p className="font-hand text-xl opacity-70">Todo mundo acertou. Dessa vez.</p>
            ) : (
              <PlayerChips players={wrong} />
            )}
          </Card>
        </div>
      </div>
    );
  }

  if (state.phase === "FORFEIT_WHEEL") {
    return (
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
        <h2 className="font-display text-[clamp(2rem,5vw,3.5rem)] font-extrabold uppercase text-on-accent">
          {revealed ? "A prenda é" : "Rodando..."}
        </h2>

        {/* Recua um pouco para o card ganhar o palco, mas sem apagar: a roda
            parada com o vencedor destacado é parte do resultado. */}
        <motion.div
          animate={{ scale: revealed ? 0.78 : 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 22 }}
          className="w-full"
        >
          <Wheel
            items={WHEEL_ITEMS}
            winnerIndex={punishmentIndex}
            onFinish={() => setRevealed(true)}
          />
        </motion.div>

        {/* Só depois de parar. Antes disso, entregar o texto mataria o suspense. */}
        <AnimatePresence>
          {revealed ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.7, rotate: -3 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 16 }}
              className="w-full"
            >
              <Knockout tilt="tilt-2" className="p-7">
                <p className="font-display text-[clamp(1.5rem,3.5vw,2.5rem)] font-extrabold uppercase leading-tight">
                  {punishments[punishmentIndex]}
                </p>
              </Knockout>
              <p className="mt-4 font-hand text-2xl text-on-accent">Pagam a prenda:</p>
              <div className="mt-2">
                <PlayerChips players={wrong} />
              </div>
              {/* A TV para aqui de propósito. Dizer que está esperando evita
                  o grupo achar que o jogo travou. */}
              <p className="mt-6 font-action text-xl uppercase text-on-accent opacity-80">
                O host continua quando todo mundo pagar
              </p>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    );
  }

  if (state.phase === "LEADERBOARD" || state.phase === "GAME_OVER") {
    const ranking = leaderboard(state);
    const over = state.phase === "GAME_OVER";
    const top = ranking[0]?.score ?? 0;

    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <h2 className="text-center font-display text-[clamp(2.5rem,7vw,4.5rem)] font-extrabold uppercase text-on-accent">
          {over ? "Fim de jogo" : "Placar"}
        </h2>

        <Card className="flex flex-col gap-3 p-6">
          <AnimatePresence initial={false}>
            {ranking.map((player, index) => {
              const champion = over && player.score === top && top > 0;
              return (
                <motion.div
                  key={player.id}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.06 }}
                  className={cn(
                    "flex items-center gap-4 border-4 border-ink p-3",
                    champion ? "bg-accent text-on-accent" : "bg-paper",
                  )}
                >
                  <span className="w-10 shrink-0 text-center font-display text-3xl font-extrabold">
                    {index + 1}
                  </span>
                  <Avatar seed={player.avatarSeed} color={player.color} size="sm" />
                  <span className="flex-1 truncate font-action text-2xl uppercase">
                    {player.nickname}
                  </span>
                  {champion ? <Crown strokeWidth={3} className="size-8" /> : null}
                  <span className="font-display text-4xl font-extrabold tabular-nums">
                    {player.score}
                  </span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </Card>

        {over ? (
          <p className="text-center font-hand text-2xl text-on-accent">
            O host escolhe o que vem agora, pelo celular.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <Card variant="dashed" className="mx-auto flex max-w-xl gap-3 p-6">
      <TriangleAlert strokeWidth={2.5} className="size-8 shrink-0" />
      <div>
        <p className="font-display text-2xl font-bold uppercase">Perdi o fio</p>
        <p className="font-hand text-lg">Fase {state.phase} sem tela.</p>
      </div>
    </Card>
  );
}
