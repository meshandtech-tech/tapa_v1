import { useCallback, useState } from "react";
import { motion } from "motion/react";
import { Check, Eye, Hourglass, Presentation, Trophy } from "lucide-react";
import { Avatar } from "../../ui/Avatar";
import { Card } from "../../ui/Card";
import { SlotMachine } from "../../ui/SlotMachine";
import { cn } from "../../ui/cn";
import { IMPROV_SLIDES_CONFIG } from "./config";
import { slideSrc, usingPlaceholders } from "./library";
import { SlideStage } from "./SlideStage";
import { useSlidePreload } from "./useSlidePreload";
import {
  currentPresenter,
  eligibleVoters,
  roundAverage,
  slideProgress,
  slidesRanking,
  votesIn,
} from "./slides";
import type { PartyState, Player } from "../../party/types";

/** As cinco notas. O rótulo é a piada; o número é o que vira placar. */
const NOTAS = [
  { value: 1, emoji: "😬", label: "o que foi isso" },
  { value: 2, emoji: "😂", label: "caótico" },
  { value: 3, emoji: "👏", label: "até que sim" },
  { value: 4, emoji: "🔥", label: "mandou bem" },
  { value: 5, emoji: "🧠", label: "nível TED" },
] as const;

type VoteAttempt = {
  roundKey: string;
  status: "sending" | "confirmed" | "failed";
};

/**
 * O Pitch no Escuro inteiro no celular.
 *
 * Funciona com ou sem tela grande: o celular de quem apresenta SEMPRE mostra o
 * slide (é dali que a pessoa fala), e quem assiste vê o mesmo slide em formato
 * reduzido. Com TV na sala, a TV mostra o mesmo estado — não existem duas
 * implementações, só tamanhos diferentes da mesma.
 */
export function PitchNoEscuroPlayer({
  state,
  me,
  now,
  secondsLeft,
  canReplaceSlides,
  onVote,
  onReplaceSlides,
}: {
  state: PartyState;
  me: Player;
  now: number;
  secondsLeft: number;
  canReplaceSlides: boolean;
  onVote: (rating: number) => boolean | Promise<boolean>;
  onReplaceSlides: (slideIds: string[]) => void;
}) {
  const slides = state.slides;
  const apresentador = currentPresenter(state);
  const souEu = apresentador?.id === me.id;
  const voteRoundKey = `${state.round}:${apresentador?.id ?? "none"}`;
  const [voteAttempt, setVoteAttempt] = useState<VoteAttempt | null>(null);
  // Um resultado atrasado da rodada anterior pode chegar depois da troca de
  // apresentador. A chave torna esse resultado invisível sem efeito de reset
  // nem um frame mostrando "voto registrado" para a pessoa errada.
  const votoLocal = voteAttempt?.roundKey === voteRoundKey ? voteAttempt.status : "idle";

  const votar = useCallback(async (rating: number) => {
    if (votoLocal === "sending" || votoLocal === "confirmed") return;
    setVoteAttempt({ roundKey: voteRoundKey, status: "sending" });
    const confirmed = await onVote(rating);
    setVoteAttempt({
      roundKey: voteRoundKey,
      status: confirmed ? "confirmed" : "failed",
    });
  }, [onVote, voteRoundKey, votoLocal]);

  const espiaPrimeiro = IMPROV_SLIDES_CONFIG.showFirstSlideDuringPreparation;
  const primeiroSlide = slides?.slideIds[0] ? slideSrc(slides.slideIds[0]) : null;

  const trocar = useCallback((ids: string[]) => onReplaceSlides(ids), [onReplaceSlides]);
  // Carrega as imagens na janela entre o sorteio e a preparação.
  useSlidePreload(slides?.slideIds ?? [], canReplaceSlides, trocar);

  if (!slides) return null;

  if (state.phase === "GAME_INTRO") {
    return (
      <Card tilt="tilt-2" className="w-full max-w-md p-7">
        <Presentation strokeWidth={2.5} className="mx-auto mb-3 size-12" />
        <h2 className="text-center font-display text-3xl font-extrabold uppercase">
          Como se joga
        </h2>
        <p className="mt-4 font-ui text-lg leading-snug">
          Você vai fazer a apresentação mais importante da sua vida. Só tem um
          problema: você nunca viu os slides.
        </p>
        <ul className="mt-4 flex flex-col gap-2 font-ui text-base">
          <li className="border-l-4 border-ink pl-3">
            <strong>5 slides aleatórios</strong>, {IMPROV_SLIDES_CONFIG.slideDurationSeconds}s cada
          </li>
          <li className="border-l-4 border-ink pl-3">
            <strong>{IMPROV_SLIDES_CONFIG.preparationTimeSeconds}s</strong> para preparar o primeiro slide
          </li>
          <li className="border-l-4 border-ink pl-3">
            Os slides <strong>passam sozinhos</strong>. Não dá para segurar.
          </li>
        </ul>
        <p className="mt-4 font-hand text-xl">
          Sua missão: começo, meio e fim. Não pare de falar. Finja que era tudo planejado.
        </p>
        {usingPlaceholders ? (
          <p className="mt-4 border-4 border-ink bg-accent-soft p-3 font-action text-xs uppercase leading-relaxed">
            Rodando com slides de exemplo. Jogue os PNG em src/assets/slides para
            valer de verdade.
          </p>
        ) : null}
      </Card>
    );
  }

  if (state.phase === "PLAYER_SPIN") {
    return (
      <div className="flex w-full max-w-md flex-col items-center gap-4">
        <p className="font-action text-sm uppercase tracking-[0.2em] text-on-accent">
          Próximo a apresentar
        </p>
        <SlotMachine
          items={slides.order.map(
            (id) => state.players.find((p) => p.id === id)?.nickname ?? "?",
          )}
          winnerIndex={slides.index}
          className="w-full"
        />
      </div>
    );
  }

  if (state.phase === "PLAYER_REVEAL") {
    return (
      <Card tilt="tilt-3" className="w-full max-w-md p-8 text-center">
        {apresentador ? (
          <>
            <Avatar
              seed={apresentador.avatarSeed}
              color={apresentador.color}
              size="md"
              className="mx-auto"
            />
            <h2 className="mt-4 font-display text-4xl font-extrabold uppercase leading-none">
              {souEu ? "É você" : apresentador.nickname}
            </h2>
            <p className="mt-3 font-hand text-xl">
              {souEu ? "Respira. Você consegue." : "Boa sorte pra ele."}
            </p>
          </>
        ) : null}
      </Card>
    );
  }

  if (state.phase === "PREPARATION") {
    return (
      <Card tilt="tilt-1" className="w-full max-w-md p-7 text-center">
        <p className="font-action text-xs uppercase tracking-[0.2em] opacity-70">
          {souEu ? "Você é o próximo" : `${apresentador?.nickname ?? "Alguém"} está se preparando`}
        </p>
        <p className="mt-2 font-display text-7xl font-extrabold tabular-nums leading-none">
          {Math.max(0, secondsLeft)}
        </p>
        {souEu ? (
          <div className="mt-5 flex flex-col gap-3">
            {/* A primeira imagem, e só ela. Serve para a pessoa ter por onde
                COMEÇAR — os outros quatro slides continuam surpresa, que é
                onde o jogo realmente mora. */}
            {espiaPrimeiro && primeiroSlide ? (
              <div className="flex flex-col items-center gap-2">
                <p className="font-action text-xs uppercase tracking-[0.2em] opacity-70">
                  Seu primeiro slide
                </p>
                <img
                  src={primeiroSlide}
                  alt="Primeiro slide da sua apresentação"
                  className="block max-h-[34vh] max-w-full border-4 border-ink bg-white object-contain shadow-brutal"
                />
                <p className="font-hand text-lg">Começa por aqui. O resto é surpresa.</p>
              </div>
            ) : null}

            <div className="flex flex-col gap-2 text-left font-ui text-base">
              <p className="border-l-4 border-ink pl-3">
                5 slides · {IMPROV_SLIDES_CONFIG.slideDurationSeconds}s cada
              </p>
              <p className="border-l-4 border-ink pl-3">Um começo, um meio, um fim</p>
              <p className="border-l-4 border-ink pl-3">Eles passam sozinhos</p>
            </div>
          </div>
        ) : (
          <p className="mt-4 font-hand text-xl">Prepara o dedo pra nota.</p>
        )}
      </Card>
    );
  }

  if (state.phase === "COUNTDOWN") {
    const conta = Math.max(1, Math.min(3, secondsLeft));
    return (
      <div className="flex w-full max-w-md flex-col items-center gap-3">
        <motion.p
          key={conta}
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 320, damping: 18 }}
          className="font-display text-[9rem] font-extrabold leading-none text-on-accent"
        >
          {conta}
        </motion.p>
        <p className="font-action text-sm uppercase tracking-[0.3em] text-on-accent">
          {souEu ? "boa sorte" : "vai começar"}
        </p>
      </div>
    );
  }

  if (state.phase === "PRESENTATION") {
    const { index, remainingMs } = slideProgress(state, now);
    return (
      <SlideStage
        slideId={slides.slideIds[index] ?? null}
        index={index}
        presenterName={apresentador?.nickname ?? ""}
        remainingMs={remainingMs}
        compact={!souEu}
      />
    );
  }

  if (state.phase === "VOTING") {
    const jaVotei = slides.votes[me.id] !== undefined || votoLocal === "confirmed";
    const faltam = eligibleVoters(state).length - votesIn(state);

    if (souEu) {
      return (
        <Card tilt="tilt-2" className="w-full max-w-md p-7 text-center">
          <Eye strokeWidth={2.5} className="mx-auto mb-3 size-12" />
          <h2 className="font-display text-2xl font-extrabold uppercase">
            Estão te julgando
          </h2>
          <p className="mt-3 font-display text-5xl font-extrabold tabular-nums">
            {votesIn(state)} / {eligibleVoters(state).length}
          </p>
          <p className="font-action text-xs uppercase opacity-70">votos</p>
        </Card>
      );
    }

    if (jaVotei) {
      return (
        <Card tilt="tilt-1" className="w-full max-w-md p-7 text-center">
          <Check strokeWidth={3.5} className="mx-auto mb-3 size-12" />
          <h2 className="font-display text-2xl font-extrabold uppercase">Voto registrado</h2>
          <p className="mt-2 font-hand text-lg">
            {faltam > 0 ? `Faltam ${faltam}` : "Esperando o host fechar"}
          </p>
        </Card>
      );
    }

    return (
      <div className="flex w-full max-w-md flex-col gap-3">
        <Card className="p-4 text-center">
          <p className="font-action text-xs uppercase tracking-wide opacity-70">Que nota para</p>
          <p className="font-display text-2xl font-extrabold uppercase leading-tight">
            {apresentador?.nickname}
          </p>
          <p className="mt-1 font-hand text-base">
            Ele transformou 5 imagens aleatórias numa história?
          </p>
        </Card>
        <div className="flex flex-col gap-2">
          {NOTAS.map((nota) => (
            <button
              key={nota.value}
              type="button"
              onClick={() => void votar(nota.value)}
              disabled={votoLocal === "sending"}
              className="flex min-h-14 cursor-pointer items-center gap-3 border-4 border-ink bg-paper px-4
                         text-left shadow-brutal transition-transform
                         focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-ink
                         disabled:cursor-wait disabled:opacity-60 motion-safe:hover:-translate-y-0.5"
            >
              <span className="text-3xl leading-none">{nota.emoji}</span>
              <span className="font-action text-base uppercase">{nota.label}</span>
            </button>
          ))}
        </div>
        {votoLocal === "failed" ? (
          <p role="alert" className="border-4 border-ink bg-paper px-3 py-2 text-center font-action text-xs uppercase">
            A rede não confirmou seu voto. Toque novamente.
          </p>
        ) : null}
      </div>
    );
  }

  if (state.phase === "SCORE_REVEAL") {
    const media = roundAverage(state) ?? slides.scores[apresentador?.id ?? ""] ?? null;
    return (
      <Card tilt="tilt-3" className="w-full max-w-md p-8 text-center">
        {apresentador ? (
          <Avatar seed={apresentador.avatarSeed} color={apresentador.color} size="md" className="mx-auto" />
        ) : null}
        <h2 className="mt-4 font-display text-2xl font-extrabold uppercase">
          {apresentador?.nickname}
        </h2>
        <p className="mt-2 font-display text-6xl font-extrabold tabular-nums leading-none">
          {media === null ? "—" : media.toFixed(1)}
          <span className="text-2xl opacity-50"> / 5</span>
        </p>
        <p className="mt-3 font-hand text-xl">{veredito(media)}</p>
      </Card>
    );
  }

  if (state.phase === "GAME_OVER") {
    const ranking = slidesRanking(state);
    const topo = ranking[0]?.score ?? 0;
    return (
      <div className="flex w-full max-w-md flex-col gap-3">
        <h2 className="text-center font-display text-2xl font-extrabold uppercase text-on-accent">
          Resultado final
        </h2>
        <Card className="flex flex-col gap-2 p-4">
          {ranking.map(({ player, score }, index) => {
            const campeao = score === topo && topo > 0;
            return (
              <div
                key={player.id}
                className={cn(
                  "flex items-center gap-3 border-4 border-ink px-3 py-2",
                  campeao ? "bg-accent text-on-accent" : player.id === me.id ? "bg-accent-soft" : "bg-paper",
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
                  {score.toFixed(1)}
                </span>
              </div>
            );
          })}
        </Card>
        <p className="text-center font-hand text-lg text-on-accent">
          Quem fez o nada parecer estratégia leva.
        </p>
      </div>
    );
  }

  return (
    <Card className="w-full max-w-md p-7 text-center">
      <Hourglass strokeWidth={2.5} className="mx-auto size-10 opacity-50" />
    </Card>
  );
}

function veredito(media: number | null): string {
  if (media === null) return "Ninguém votou. Constrangedor.";
  if (media >= 4.5) return "Isso aí fazia sentido. Assustador.";
  if (media >= 3.5) return "Quase convenceu a mesa.";
  if (media >= 2.5) return "Teve momentos.";
  if (media >= 1.5) return "Foi um passeio.";
  return "Melhor esquecer.";
}
