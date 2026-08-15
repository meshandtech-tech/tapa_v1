import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Crown, Flame, Timer } from "lucide-react";
import type { PartyState } from "../party/types";
import { Avatar } from "../ui/Avatar";
import { Card, Knockout } from "../ui/Card";
import { SlotMachine } from "../ui/SlotMachine";
import { Wheel } from "../ui/Wheel";
import { cn } from "../ui/cn";
import {
  currentPresenter,
  currentTopicText,
  devilLeaderboard,
  eligibleVoters,
  remainingPresenters,
  roundAverage,
  topicText,
  votesIn,
} from "./advogadoDoDiabo";

/** Aviso permanente. Curto para não competir com o jogo, mas sempre visível. */
function Disclaimer() {
  return (
    <p className="mx-auto mt-[2vh] max-w-5xl text-center font-ui text-[clamp(0.6rem,1vw,0.85rem)] uppercase leading-snug text-on-accent opacity-70">
      Advogado do Diabo é um jogo de improviso e argumentação. As posições
      sorteadas não representam a opinião de quem joga, do grupo ou da
      plataforma. Se um tema for desconfortável, peça outro.
    </p>
  );
}

function Palco({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-[2.5vh] text-center">
      {children}
    </div>
  );
}

export function AdvogadoDoDiaboHost({
  state,
  secondsLeft,
}: {
  state: PartyState;
  secondsLeft: number;
}) {
  const devil = state.devil;
  const presenter = currentPresenter(state);
  const tema = currentTopicText(state);
  const [temaRevelado, setTemaRevelado] = useState(false);

  useEffect(() => {
    setTemaRevelado(false);
  }, [state.phase, devil?.winner]);

  if (!devil) return null;

  const totalRodadas = devil.order.length;
  const rodada = Math.max(1, devil.index + 1);

  switch (state.phase) {
    /** Aviso inicial. Não corre sozinho: o host precisa aceitar. */
    case "GAME_INTRO":
      return (
        <Palco>
          <Knockout tilt="tilt-1" className="max-w-5xl px-[3vw] py-[4vh]">
            <Flame strokeWidth={2.5} className="mx-auto mb-[2vh] size-[clamp(2.5rem,5vw,4rem)]" />
            <h2 className="font-display text-[clamp(2rem,5vw,4.5rem)] font-extrabold uppercase leading-none">
              Advogado do Diabo
            </h2>
            <p className="mt-[2.5vh] font-ui text-[clamp(0.95rem,1.7vw,1.5rem)] leading-snug">
              Você vai receber teses absurdas, controversas ou desconfortáveis —
              e vai ter que defendê-las mesmo discordando. Os argumentos não
              representam a opinião de ninguém aqui. O objetivo é pensar sob
              pressão, improvisar e convencer.
              <br />
              <strong>Se um tema for pesado demais, o host pede outro.</strong>
            </p>
          </Knockout>
          <p className="font-action text-[clamp(1rem,2vw,1.75rem)] uppercase text-on-accent">
            O host começa pelo celular
          </p>
        </Palco>
      );

    /** A roleta de teses. O texto fica escondido até ela parar. */
    case "TOPIC_SPIN":
      return (
        <Palco>
          <h2 className="font-display text-[clamp(1.5rem,3.5vw,3rem)] font-extrabold uppercase text-on-accent">
            Sorteando a tese
          </h2>
          <div className="w-full max-w-[min(62vh,38rem)]">
            <Wheel
              items={devil.candidates.map((_, i) => String(i + 1))}
              winnerIndex={devil.winner}
              onFinish={() => setTemaRevelado(true)}
            />
          </div>
          {temaRevelado ? (
            <p className="font-action text-[clamp(1rem,2vw,1.75rem)] uppercase text-on-accent">
              Saiu...
            </p>
          ) : null}
          <Disclaimer />
        </Palco>
      );

    /** O momento de reação: a tese domina a TV. */
    case "TOPIC_REVEAL":
      return (
        <Palco>
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-action text-[clamp(1rem,2.2vw,2rem)] uppercase text-on-accent"
          >
            A tese é
          </motion.p>
          <motion.div
            initial={{ opacity: 0, scale: 0.7, rotate: -2 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 15 }}
            className="w-full max-w-6xl"
          >
            <Card className="px-[3vw] py-[5vh]">
              <p className="font-display text-[clamp(2rem,6vw,6rem)] font-extrabold uppercase leading-[1.05]">
                {tema}
              </p>
            </Card>
          </motion.div>
          <Disclaimer />
        </Palco>
      );

    /** Caça-níquel: quem vai ter que defender isso? */
    case "PLAYER_SPIN": {
      const candidatos = [...remainingPresenters(state), presenter].filter(
        (p): p is NonNullable<typeof p> => !!p,
      );
      const nomes = candidatos.map((p) => p.nickname);
      const vencedor = Math.max(0, nomes.indexOf(presenter?.nickname ?? ""));
      return (
        <Palco>
          <h2 className="font-display text-[clamp(1.5rem,3.5vw,3rem)] font-extrabold uppercase text-on-accent">
            Quem vai defender?
          </h2>
          <div className="w-full max-w-5xl">
            <SlotMachine items={nomes} winnerIndex={vencedor} />
          </div>
          <Disclaimer />
        </Palco>
      );
    }

    case "PLAYER_REVEAL":
      return (
        <Palco>
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 240, damping: 14 }}
            className="flex flex-col items-center gap-[2vh]"
          >
            {presenter ? (
              <Avatar seed={presenter.avatarSeed} color={presenter.color} size="tv" />
            ) : null}
            <h2 className="font-display text-[clamp(3rem,10vw,10rem)] font-extrabold uppercase leading-none text-on-accent">
              {presenter?.nickname}
            </h2>
            <Knockout tilt="tilt-2" className="px-[2.5vw] py-[1.5vh]">
              <p className="font-action text-[clamp(1rem,2.4vw,2.25rem)] uppercase">
                Você é o advogado do diabo
              </p>
            </Knockout>
          </motion.div>
          <Disclaimer />
        </Palco>
      );

    /** Preparação. Nos últimos 3s a tela vira contagem gigante. */
    case "PREPARATION":
    case "COUNTDOWN": {
      const contando = state.phase === "COUNTDOWN" || secondsLeft <= 3;
      if (contando) {
        const numero = state.phase === "COUNTDOWN" ? Math.max(1, secondsLeft) : secondsLeft;
        return (
          <Palco>
            <AnimatePresence mode="wait">
              <motion.p
                key={numero}
                initial={{ opacity: 0, scale: 2.2 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.4 }}
                transition={{ duration: 0.35 }}
                className="font-display text-[clamp(8rem,32vw,24rem)] font-extrabold leading-none text-on-accent"
              >
                {numero > 0 ? numero : "JÁ!"}
              </motion.p>
            </AnimatePresence>
          </Palco>
        );
      }
      return (
        <Palco>
          <p className="font-action text-[clamp(1rem,2vw,1.75rem)] uppercase text-on-accent">
            {presenter?.nickname} · prepara o argumento
          </p>
          <Card className="w-full max-w-6xl px-[3vw] py-[4vh]">
            <p className="font-display text-[clamp(1.5rem,4.5vw,4rem)] font-extrabold uppercase leading-[1.05]">
              {tema}
            </p>
          </Card>
          <Knockout className="flex items-center gap-[1.5vw] px-[2.5vw] py-[1.5vh]">
            <Timer strokeWidth={3} className="size-[clamp(1.5rem,3vw,2.75rem)]" />
            <span className="font-display text-[clamp(2.5rem,7vw,6rem)] font-extrabold leading-none tabular-nums">
              {secondsLeft}
            </span>
          </Knockout>
          <Disclaimer />
        </Palco>
      );
    }

    case "PRESENTATION": {
      const urgente = secondsLeft <= 10;
      return (
        <Palco>
          <div className="flex flex-wrap items-center justify-center gap-[1.5vw]">
            {presenter ? (
              <Avatar seed={presenter.avatarSeed} color={presenter.color} size="md" />
            ) : null}
            <h2 className="font-display text-[clamp(2rem,6vw,5rem)] font-extrabold uppercase leading-none text-on-accent">
              {presenter?.nickname}
            </h2>
          </div>

          <Card className="w-full max-w-6xl px-[3vw] py-[3.5vh]">
            <p className="font-display text-[clamp(1.25rem,4vw,3.5rem)] font-extrabold uppercase leading-[1.1]">
              {tema}
            </p>
          </Card>

          <motion.div
            animate={urgente ? { scale: [1, 1.1, 1] } : { scale: 1 }}
            transition={urgente ? { repeat: Infinity, duration: 0.6 } : undefined}
          >
            <Knockout className="flex items-center gap-[1.5vw] px-[3vw] py-[2vh]">
              <span className="font-display text-[clamp(3rem,10vw,8rem)] font-extrabold leading-none tabular-nums">
                {secondsLeft}
              </span>
            </Knockout>
          </motion.div>

          <p className="font-hand text-[clamp(0.9rem,1.6vw,1.4rem)] text-on-accent opacity-80">
            Rodada {rodada} de {totalRodadas} · o host encerra quando quiser
          </p>
          <Disclaimer />
        </Palco>
      );
    }

    /** Votação: mostra o progresso, nunca as notas. */
    case "VOTING": {
      const total = eligibleVoters(state).length;
      const feitos = votesIn(state);
      return (
        <Palco>
          <h2 className="font-display text-[clamp(2rem,6vw,5rem)] font-extrabold uppercase text-on-accent">
            Avaliem {presenter?.nickname}
          </h2>
          <Card className="w-full max-w-5xl px-[3vw] py-[3vh]">
            <p className="font-display text-[clamp(1.1rem,3vw,2.5rem)] font-extrabold uppercase leading-tight">
              {tema}
            </p>
          </Card>
          {/* Só a contagem. Nota individual e média ficam escondidas até fechar. */}
          <Knockout tilt="tilt-1" className="px-[3vw] py-[2.5vh]">
            <p className="font-display text-[clamp(3rem,9vw,7rem)] font-extrabold leading-none tabular-nums">
              {feitos}/{total}
            </p>
            <p className="font-action text-[clamp(0.9rem,1.8vw,1.5rem)] uppercase">votos</p>
          </Knockout>
          <p className="font-hand text-[clamp(0.9rem,1.6vw,1.4rem)] text-on-accent opacity-80">
            O host fecha a votação pelo celular
          </p>
          <Disclaimer />
        </Palco>
      );
    }

    case "SCORE_REVEAL": {
      const nota = presenter ? (devil.scores[presenter.id] ?? roundAverage(state)) : null;
      const veredito =
        nota === null ? "Sem votos" : nota >= 4.5 ? "Convenceu" : nota >= 3.5 ? "Mandou bem" : nota >= 2.5 ? "Deu para o gasto" : "Que vergonha";
      return (
        <Palco>
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 240, damping: 14 }}
            className="flex flex-col items-center gap-[2vh]"
          >
            <h2 className="font-display text-[clamp(2rem,6vw,5rem)] font-extrabold uppercase text-on-accent">
              {presenter?.nickname}
            </h2>
            <Knockout tilt="tilt-2" className="px-[4vw] py-[3vh]">
              <p className="font-display text-[clamp(4rem,14vw,11rem)] font-extrabold leading-none tabular-nums">
                {nota === null ? "—" : nota.toFixed(1)}
              </p>
              <p className="font-action text-[clamp(1rem,2vw,1.75rem)] uppercase">de 5</p>
            </Knockout>
            <p className="font-display text-[clamp(1.25rem,3.5vw,3rem)] font-extrabold uppercase text-on-accent">
              {veredito}
            </p>
          </motion.div>
          <Disclaimer />
        </Palco>
      );
    }

    case "GAME_OVER": {
      const ranking = devilLeaderboard(state);
      const campeao = ranking[0];
      return (
        <div className="flex h-full flex-col gap-[2vh] overflow-hidden">
          <h2 className="text-center font-display text-[clamp(2rem,6vw,4.5rem)] font-extrabold uppercase text-on-accent">
            O melhor advogado do diabo
          </h2>
          {campeao ? (
            <Knockout tilt="tilt-1" className="mx-auto flex items-center gap-[2vw] px-[3vw] py-[2vh]">
              <Crown strokeWidth={3} className="size-[clamp(2rem,4vw,3.5rem)]" />
              <span className="font-display text-[clamp(1.75rem,5vw,4rem)] font-extrabold uppercase">
                {campeao.player.nickname}
              </span>
              <span className="font-display text-[clamp(1.75rem,5vw,4rem)] font-extrabold tabular-nums">
                {campeao.score.toFixed(1)}
              </span>
            </Knockout>
          ) : null}
          <Card className="mx-auto flex w-full max-w-4xl min-h-0 flex-1 flex-col gap-[1vh] overflow-auto p-[1.5vw]">
            {ranking.map((linha, index) => (
              <div
                key={linha.player.id}
                className={cn(
                  "flex items-center gap-[1.5vw] border-4 border-ink px-[1.5vw] py-[1vh]",
                  index === 0 ? "bg-accent text-on-accent" : "bg-paper",
                )}
              >
                <span className="w-[3ch] text-center font-display text-[clamp(1rem,2.2vw,2rem)] font-extrabold">
                  {index + 1}
                </span>
                <Avatar seed={linha.player.avatarSeed} color={linha.player.color} size="sm" />
                <span className="flex-1 truncate font-action text-[clamp(1rem,2.2vw,2rem)] uppercase">
                  {linha.player.nickname}
                </span>
                <span className="font-display text-[clamp(1.25rem,2.8vw,2.5rem)] font-extrabold tabular-nums">
                  {linha.score.toFixed(1)}
                </span>
              </div>
            ))}
          </Card>
          <p className="text-center font-hand text-[clamp(0.9rem,1.6vw,1.4rem)] text-on-accent">
            O host escolhe o que vem agora, pelo celular.
          </p>
        </div>
      );
    }

    default:
      return (
        <Palco>
          <Card variant="dashed" className="p-6">
            <p className="font-display text-2xl font-bold uppercase">Fase {state.phase}</p>
          </Card>
        </Palco>
      );
  }
}

/** Reexportado para a TV montar a lista da roleta com o texto certo. */
export { topicText };
