import { motion } from "motion/react";
import { Check, Flame, Timer } from "lucide-react";
import type { PartyState, Player } from "../party/types";
import { Card, Knockout } from "../ui/Card";
import { cn } from "../ui/cn";
import { currentPresenter, currentTopicText } from "./advogadoDoDiabo";

/** As cinco notas. O número é o que vale; o emoji só ajuda a escolher rápido. */
export const RATINGS = [
  { value: 1, emoji: "👎", label: "Péssimo" },
  { value: 2, emoji: "😬", label: "Fraco" },
  { value: 3, emoji: "😐", label: "Ok" },
  { value: 4, emoji: "👏", label: "Bom" },
  { value: 5, emoji: "🔥", label: "Incrível" },
] as const;

/**
 * O celular no Advogado do Diabo.
 *
 * Deliberadamente simples: quem apresenta vê a própria tese e o relógio; quem
 * assiste vê o que está acontecendo e, na hora, cinco botões grandes. Ninguém
 * deveria precisar pensar sobre o que apertar.
 */
export function AdvogadoDoDiaboPlayer({
  state,
  me,
  secondsLeft,
  onVote,
}: {
  state: PartyState;
  me: Player;
  secondsLeft: number;
  onVote: (rating: number) => void;
}) {
  const presenter = currentPresenter(state);
  const souEu = presenter?.id === me.id;
  const tema = currentTopicText(state);
  const meuVoto = state.devil?.votes[me.id];

  const Aviso = ({ children }: { children: React.ReactNode }) => (
    <Card tilt="tilt-2" className="w-full max-w-md p-6 text-center">
      {children}
    </Card>
  );

  switch (state.phase) {
    case "GAME_INTRO":
      return (
        <Aviso>
          <Flame strokeWidth={2.5} className="mx-auto mb-3 size-10" />
          <h2 className="font-display text-2xl font-bold uppercase">Advogado do Diabo</h2>
          <p className="mt-3 font-ui text-base leading-snug">
            Você vai defender teses que talvez ache absurdas. Não representa a
            sua opinião — é improviso. Se o tema pesar, o host pede outro.
          </p>
          <p className="mt-4 font-action text-sm uppercase opacity-70">Olha a TV</p>
        </Aviso>
      );

    case "TOPIC_SPIN":
    case "TOPIC_REVEAL":
    case "PLAYER_SPIN":
      return (
        <Aviso>
          <h2 className="font-display text-2xl font-bold uppercase">
            {state.phase === "PLAYER_SPIN" ? "Sorteando quem defende" : "Sorteando a tese"}
          </h2>
          <p className="mt-3 font-hand text-lg">Olha a TV.</p>
          <motion.div
            className="mt-4 flex justify-center gap-2"
            animate={{ opacity: [0.35, 1, 0.35] }}
            transition={{ repeat: Infinity, duration: 1.4 }}
            aria-hidden="true"
          >
            <span className="size-3 rounded-full bg-ink" />
            <span className="size-3 rounded-full bg-ink" />
            <span className="size-3 rounded-full bg-ink" />
          </motion.div>
        </Aviso>
      );

    case "PLAYER_REVEAL":
    case "PREPARATION":
    case "COUNTDOWN":
    case "PRESENTATION": {
      if (!souEu) {
        return (
          <Aviso>
            <h2 className="font-display text-3xl font-bold uppercase">
              {presenter?.nickname}
            </h2>
            <p className="mt-2 font-action text-sm uppercase text-accent-dark">
              {state.phase === "PRESENTATION" ? "está defendendo" : "está se preparando"}
            </p>
            <p className="mt-4 font-ui text-base leading-snug">{tema}</p>
            {state.phase === "PRESENTATION" ? (
              <p className="mt-4 font-display text-5xl font-extrabold tabular-nums">
                {secondsLeft}
              </p>
            ) : null}
          </Aviso>
        );
      }
      // Sou eu. A tese e o relógio precisam estar grandes e sozinhos na tela.
      return (
        <div className="flex w-full max-w-md flex-col gap-4">
          <Knockout tilt="tilt-1" className="p-5 text-center">
            <p className="font-action text-sm uppercase">
              {state.phase === "PRESENTATION" ? "Defenda agora" : "Sua tese"}
            </p>
            <p className="mt-2 font-display text-2xl font-extrabold uppercase leading-tight">
              {tema}
            </p>
          </Knockout>
          <Card className="flex items-center justify-center gap-3 p-5">
            <Timer strokeWidth={3} className="size-8" />
            <span className="font-display text-6xl font-extrabold tabular-nums">
              {secondsLeft}
            </span>
          </Card>
        </div>
      );
    }

    case "VOTING": {
      if (souEu) {
        return (
          <Aviso>
            <h2 className="font-display text-2xl font-bold uppercase">Acabou</h2>
            <p className="mt-3 font-hand text-lg">
              O pessoal está te avaliando. Não dá para votar em você mesmo.
            </p>
          </Aviso>
        );
      }
      if (meuVoto !== undefined) {
        const escolhido = RATINGS.find((r) => r.value === meuVoto);
        return (
          <Aviso>
            <Check strokeWidth={3} className="mx-auto mb-2 size-10" />
            <h2 className="font-display text-2xl font-bold uppercase">Voto enviado</h2>
            <p className="mt-2 text-5xl">{escolhido?.emoji}</p>
            <p className="mt-3 font-hand text-lg">Esperando todo mundo...</p>
          </Aviso>
        );
      }
      return (
        <div className="flex w-full max-w-md flex-col gap-4">
          <Card className="p-5 text-center">
            <h2 className="font-display text-xl font-bold uppercase leading-tight">
              Quão bem {presenter?.nickname} defendeu?
            </h2>
            <p className="mt-2 font-ui text-sm leading-snug opacity-80">{tema}</p>
          </Card>
          <div className="flex flex-col gap-3">
            {RATINGS.map((rating) => (
              <button
                key={rating.value}
                type="button"
                onClick={() => onVote(rating.value)}
                className={cn(
                  "flex min-h-16 cursor-pointer items-center gap-4 border-4 border-ink bg-paper px-5",
                  "font-action text-xl uppercase shadow-brutal",
                  "active:translate-x-1 active:translate-y-1 active:shadow-brutal-sm",
                  "focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-ink",
                )}
              >
                <span className="text-4xl">{rating.emoji}</span>
                {rating.label}
              </button>
            ))}
          </div>
        </div>
      );
    }

    case "SCORE_REVEAL":
      return (
        <Aviso>
          <h2 className="font-display text-2xl font-bold uppercase">
            {souEu ? "Sua nota" : `Nota de ${presenter?.nickname}`}
          </h2>
          <p className="mt-3 font-display text-6xl font-extrabold tabular-nums">
            {(state.devil?.scores[presenter?.id ?? ""] ?? 0).toFixed(1)}
          </p>
          <p className="mt-1 font-action text-sm uppercase">de 5</p>
        </Aviso>
      );

    case "GAME_OVER":
      return (
        <Aviso>
          <h2 className="font-display text-2xl font-bold uppercase">Fim de jogo</h2>
          <p className="mt-3 font-hand text-lg">O ranking está na TV.</p>
        </Aviso>
      );

    default:
      return (
        <Aviso>
          <p className="font-hand text-lg">Olha a TV.</p>
        </Aviso>
      );
  }
}
