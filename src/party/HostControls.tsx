import { useState, memo } from "react";
import {
  ChevronDown,
  DoorOpen,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  SkipForward,
  Sliders,
} from "lucide-react";
import { ThemeSwitcher } from "../theme/ThemeSwitcher";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { cn } from "../ui/cn";
import type { PartyState } from "./types";

/**
 * Painel do host, no celular dele.
 *
 * Fica aqui — e não na TV — por dois motivos: a TV é a tela pública que o
 * grupo assiste, e o host é um jogador como os outros. Com o auto-host, estes
 * botões são exceção, não o fluxo normal: vem recolhido de propósito.
 */
function HostControlsBase({
  state,
  onSkipPhase,
  onPause,
  onResume,
  onReroll,
  onRestart,
  onEndParty,
  onThemeChange,
  onThemeModeChange,
}: {
  state: PartyState;
  onSkipPhase: () => void;
  onPause: () => void;
  onResume: () => void;
  onReroll: () => void;
  onRestart: () => void;
  onEndParty: () => void;
  onThemeChange: (themeId: PartyState["settings"]["themeId"]) => void;
  onThemeModeChange: (mode: PartyState["settings"]["themeMode"]) => void;
}) {
  const [open, setOpen] = useState(false);
  const paused = state.pausedAt !== null;
  const emJogo = state.phase !== "LOBBY";

  return (
    <Card variant="dashed" className="w-full max-w-md p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between gap-2 font-action text-base uppercase
                   focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <span className="flex items-center gap-2">
          <Sliders strokeWidth={3} className="size-5" />
          Controles do host
        </span>
        <ChevronDown
          strokeWidth={3}
          className={cn("size-5 transition-transform", open ? "rotate-180" : "")}
        />
      </button>

      {open ? (
        <div className="mt-4 flex flex-col gap-3 border-t-4 border-dashed border-ink pt-4">
          {emJogo ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" variant="paper" onClick={paused ? onResume : onPause}>
                  {paused ? (
                    <Play strokeWidth={3} className="size-4" />
                  ) : (
                    <Pause strokeWidth={3} className="size-4" />
                  )}
                  {paused ? "Retomar" : "Pausar"}
                </Button>
                <Button size="sm" variant="paper" onClick={onSkipPhase}>
                  <SkipForward strokeWidth={3} className="size-4" />
                  Pular
                </Button>
              </div>

              {state.phase === "FORFEIT_WHEEL" ? (
                <Button size="sm" variant="knockout" onClick={onReroll}>
                  <RefreshCw strokeWidth={3} className="size-4" />
                  Outra prenda
                </Button>
              ) : null}

              <Button size="sm" variant="paper" onClick={onRestart}>
                <RotateCcw strokeWidth={3} className="size-4" />
                Voltar ao lobby
              </Button>
            </>
          ) : null}

          <ThemeSwitcher onThemeChange={onThemeChange} onModeChange={onThemeModeChange} />

          <Button size="sm" variant="knockout" onClick={onEndParty}>
            <DoorOpen strokeWidth={3} className="size-4" />
            Encerrar sala
          </Button>
        </div>
      ) : null}
    </Card>
  );
}


/**
 * Memoizado de propósito.
 *
 * O relógio da sala re-renderiza a tela do host 4x por segundo. Sem esta
 * barreira, cada tique reconstruía também os controles — na mesma tela que já
 * carrega o jogo inteiro e, antes, serializava o estado da partida. Era daí
 * que vinha a travadinha no celular do host.
 */
export const HostControls = memo(HostControlsBase);
