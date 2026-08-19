import { Eye, Presentation, Trophy } from "lucide-react";
import { Avatar } from "../../ui/Avatar";
import { Card, Knockout } from "../../ui/Card";
import { SlotMachine } from "../../ui/SlotMachine";
import { cn } from "../../ui/cn";
import { SlideStage } from "./SlideStage";
import {
  currentPresenter,
  eligibleVoters,
  roundAverage,
  slideProgress,
  slidesRanking,
  votesIn,
} from "./slides";
import type { PartyState } from "../../party/types";

/**
 * O Pitch no Escuro na tela grande.
 *
 * Mesmo estado, mesma conta de slide — a TV não decide nada, só mostra maior.
 * Existe porque este é o único jogo do Tapa em que a plateia ganha alguma coisa
 * com uma tela compartilhada: todo mundo olhando para a MESMA imagem
 * constrangedora ao mesmo tempo é metade da graça.
 */
export function PitchNoEscuroHost({
  state,
  now,
  secondsLeft,
}: {
  state: PartyState;
  now: number;
  secondsLeft: number;
}) {
  const slides = state.slides;
  if (!slides) return null;
  const apresentador = currentPresenter(state);

  if (state.phase === "PRESENTATION") {
    const { index, remainingMs } = slideProgress(state, now);
    return (
      <div className="grid h-full place-items-center">
        <SlideStage
          slideId={slides.slideIds[index] ?? null}
          index={index}
          presenterName={apresentador?.nickname ?? ""}
          remainingMs={remainingMs}
        />
      </div>
    );
  }

  if (state.phase === "PLAYER_SPIN") {
    return (
      <Centro titulo="Próximo a apresentar">
        <SlotMachine
          items={slides.order.map((id) => state.players.find((p) => p.id === id)?.nickname ?? "?")}
          winnerIndex={slides.index}
          className="w-full max-w-xl"
        />
      </Centro>
    );
  }

  if (state.phase === "PLAYER_REVEAL" && apresentador) {
    return (
      <Centro>
        <Avatar seed={apresentador.avatarSeed} color={apresentador.color} size="tv" />
        <p className="font-display text-6xl font-extrabold uppercase text-on-accent">
          {apresentador.nickname}
        </p>
        <p className="font-hand text-3xl text-on-accent">é com você</p>
      </Centro>
    );
  }

  if (state.phase === "PREPARATION" || state.phase === "COUNTDOWN") {
    const contando = state.phase === "COUNTDOWN";
    return (
      <Centro titulo={contando ? "" : `${apresentador?.nickname ?? "Alguém"} está se preparando`}>
        <p className="font-display text-[16vh] font-extrabold leading-none tabular-nums text-on-accent">
          {contando ? Math.max(1, Math.min(3, secondsLeft)) : Math.max(0, secondsLeft)}
        </p>
        {!contando ? (
          <p className="font-hand text-3xl text-on-accent">
            5 slides que ninguém viu · 20 segundos cada
          </p>
        ) : null}
      </Centro>
    );
  }

  if (state.phase === "VOTING") {
    return (
      <Centro titulo={`Que nota para ${apresentador?.nickname ?? ""}?`}>
        <Eye strokeWidth={2.5} className="size-16 text-on-accent" />
        <p className="font-display text-8xl font-extrabold tabular-nums text-on-accent">
          {votesIn(state)} / {eligibleVoters(state).length}
        </p>
        <p className="font-hand text-3xl text-on-accent">votem no celular</p>
      </Centro>
    );
  }

  if (state.phase === "SCORE_REVEAL") {
    const media = roundAverage(state) ?? slides.scores[apresentador?.id ?? ""] ?? null;
    return (
      <Centro>
        {apresentador ? (
          <Avatar seed={apresentador.avatarSeed} color={apresentador.color} size="tv" />
        ) : null}
        <p className="font-display text-5xl font-extrabold uppercase text-on-accent">
          {apresentador?.nickname}
        </p>
        <Knockout tilt="tilt-2" className="px-10 py-5">
          <p className="font-display text-7xl font-extrabold tabular-nums">
            {media === null ? "—" : media.toFixed(1)}
            <span className="text-3xl opacity-60"> / 5</span>
          </p>
        </Knockout>
      </Centro>
    );
  }

  if (state.phase === "GAME_OVER") {
    const ranking = slidesRanking(state);
    const topo = ranking[0]?.score ?? 0;
    return (
      <div className="mx-auto flex h-full w-full max-w-3xl flex-col justify-center gap-3">
        <p className="text-center font-display text-4xl font-extrabold uppercase text-on-accent">
          Resultado final
        </p>
        <Card className="flex flex-col gap-2 p-5">
          {ranking.map(({ player, score }, index) => (
            <div
              key={player.id}
              className={cn(
                "flex items-center gap-4 border-4 border-ink px-4 py-3",
                score === topo && topo > 0 ? "bg-accent text-on-accent" : "bg-paper",
              )}
            >
              <span className="w-8 text-center font-display text-2xl font-extrabold">
                {score === topo && topo > 0 ? <Trophy strokeWidth={3} className="size-7" /> : index + 1}
              </span>
              <Avatar seed={player.avatarSeed} color={player.color} size="sm" />
              <span className="flex-1 truncate font-action text-2xl uppercase">{player.nickname}</span>
              <span className="font-display text-4xl font-extrabold tabular-nums">
                {score.toFixed(1)}
              </span>
            </div>
          ))}
        </Card>
      </div>
    );
  }

  // GAME_INTRO: as instruções são lidas em voz alta pelo host.
  return (
    <Centro titulo="Como se joga">
      <Presentation strokeWidth={2.5} className="size-20 text-on-accent" />
      <p className="max-w-3xl text-center font-hand text-3xl text-on-accent">
        Cinco slides que você nunca viu. Vinte segundos cada. Eles passam
        sozinhos. Faça parecer que era tudo planejado.
      </p>
    </Centro>
  );
}

function Centro({ titulo, children }: { titulo?: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
      {titulo ? (
        <p className="font-action text-xl uppercase tracking-[0.25em] text-on-accent opacity-80">
          {titulo}
        </p>
      ) : null}
      {children}
    </div>
  );
}
