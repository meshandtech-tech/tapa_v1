import { AnimatePresence, motion } from "motion/react";
import { Check, Crown, RefreshCw, Timer, TriangleAlert, X } from "lucide-react";
import { punishments } from "../data/punishments";
import { leaderboard } from "../party/partyReducer";
import { ROUND_SECONDS, type PartyState } from "../party/types";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Card, Knockout } from "../ui/Card";
import { cn, tiltByIndex } from "../ui/cn";
import { PunishmentWheel } from "./PunishmentWheel";
import { currentQuestion, roundOutcome } from "./quemErraPaga";

const LETTERS = ["A", "B", "C", "D"];

/** Fita de nomes reaproveitada em várias fases. */
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
 * Esta tela é PÚBLICA — todo mundo na sala está olhando. Por isso ela nunca
 * mostra a alternativa correta durante a rodada, e nunca revela o que cada
 * jogador marcou antes de todos terem respondido.
 */
export function QuemErraPagaHost({
  state,
  secondsLeft,
  onAdvance,
  onReroll,
  onBackToLobby,
}: {
  state: PartyState;
  secondsLeft: number;
  onAdvance: () => void;
  onReroll: () => void;
  onBackToLobby: () => void;
}) {
  const question = currentQuestion(state);
  const { correct, wrong, pending } = roundOutcome(state);
  const total = state.quiz?.order.length ?? 0;

  if (state.phase === "GAME_INTRO") {
    return (
      <Card variant="speech" tilt="tilt-1" className="mx-auto max-w-3xl p-10 text-center">
        <p className="font-hand text-2xl uppercase tracking-widest">Prepara que vem</p>
        <h2 className="my-4 font-display text-6xl font-extrabold uppercase leading-none">
          Quem Erra, Paga
        </h2>
        <p className="font-hand text-2xl">
          {total} perguntas. {ROUND_SECONDS} segundos cada. Quem errar roda a
          roleta e paga uma prenda.
        </p>
        <PlayerChips players={state.players} />
        <Button size="tv" variant="solid" className="mt-8" onClick={onAdvance}>
          Bora
        </Button>
      </Card>
    );
  }

  if (state.phase === "ROUND_ACTIVE" && question) {
    const urgent = secondsLeft <= 5;
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <span className="border-4 border-ink bg-paper px-4 py-2 font-action text-xl uppercase">
            Pergunta {state.round} de {total}
          </span>
          {/* O tempo é o elemento mais tenso da tela: knockout + pulso no fim. */}
          <motion.div
            animate={urgent ? { scale: [1, 1.12, 1] } : { scale: 1 }}
            transition={urgent ? { repeat: Infinity, duration: 0.7 } : undefined}
          >
            <Knockout className="flex items-center gap-3 px-6 py-3">
              <Timer strokeWidth={3} className="size-8" />
              <span className="font-display text-5xl font-extrabold leading-none tabular-nums">
                {secondsLeft}
              </span>
            </Knockout>
          </motion.div>
        </div>

        <Card className="p-8 text-center">
          <h2 className="font-display text-[clamp(1.75rem,4vw,3.5rem)] font-extrabold uppercase leading-tight">
            {question.question}
          </h2>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          {question.options.map((option, index) => (
            <Card
              key={index}
              tilt={tiltByIndex(index)}
              className="flex items-center gap-4 p-5"
            >
              <span className="grid size-12 shrink-0 place-items-center border-4 border-ink bg-accent font-action text-2xl text-on-accent">
                {LETTERS[index]}
              </span>
              <span className="font-ui text-2xl leading-snug">{option}</span>
            </Card>
          ))}
        </div>

        {/* Quem já respondeu — sem dizer O QUE respondeu. */}
        <Card variant="dashed" className="p-4 text-center">
          <p className="font-hand text-xl">
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
          <p className="mt-2 font-display text-5xl font-extrabold uppercase leading-tight">
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

        <Button size="tv" variant="solid" className="mx-auto" onClick={onAdvance}>
          {wrong.length > 0 ? "Rodar a roleta" : "Ver o placar"}
        </Button>
      </div>
    );
  }

  if (state.phase === "FORFEIT_WHEEL") {
    const index = state.quiz?.punishmentIndex ?? 0;
    return (
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
        <h2 className="font-display text-5xl font-extrabold uppercase text-on-accent">
          A prenda é...
        </h2>
        <PunishmentWheel punishmentIndex={index} />
        <Knockout tilt="tilt-2" className="p-6">
          <p className="font-display text-3xl font-extrabold uppercase leading-tight">
            {punishments[index]}
          </p>
        </Knockout>
        <div>
          <p className="mb-3 font-hand text-2xl text-on-accent">Pagam a prenda:</p>
          <PlayerChips players={wrong} />
        </div>
        <div className="flex flex-wrap justify-center gap-4">
          <Button size="tv" variant="paper" onClick={onAdvance}>
            Pagaram, seguir
          </Button>
          {/* Válvula de escape: ninguém deve ser obrigado a pagar uma prenda
              com que não esteja confortável. */}
          <Button size="tv" variant="knockout" onClick={onReroll}>
            <RefreshCw strokeWidth={3} className="size-7" />
            Essa não, roda de novo
          </Button>
        </div>
        <p className="font-hand text-lg text-on-accent opacity-80">
          Sem climão: se alguém não estiver de boa com a prenda, roda outra.
        </p>
      </div>
    );
  }

  if (state.phase === "LEADERBOARD" || state.phase === "GAME_OVER") {
    const ranking = leaderboard(state);
    const over = state.phase === "GAME_OVER";
    const top = ranking[0]?.score ?? 0;

    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <h2 className="text-center font-display text-6xl font-extrabold uppercase text-on-accent">
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

        <div className="flex flex-wrap justify-center gap-4">
          {over ? (
            <Button size="tv" variant="solid" onClick={onBackToLobby}>
              Jogar de novo
            </Button>
          ) : (
            <Button size="tv" variant="solid" onClick={onAdvance}>
              Próxima pergunta
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Estado inesperado não pode virar tela branca no meio da festa.
  return (
    <Card variant="dashed" className="mx-auto flex max-w-xl gap-3 p-6">
      <TriangleAlert strokeWidth={2.5} className="size-8 shrink-0" />
      <div>
        <p className="font-display text-2xl font-bold uppercase">Perdi o fio</p>
        <p className="font-hand text-lg">Fase {state.phase} sem tela. Voltando ao lobby.</p>
        <Button size="sm" className="mt-3" onClick={onBackToLobby}>
          Voltar ao lobby
        </Button>
      </div>
    </Card>
  );
}
