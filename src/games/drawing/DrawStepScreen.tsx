import { useCallback, useEffect, useRef, useState } from "react";
import { Brush, Check, Eraser, Loader2, Send, Trash2, Undo2 } from "lucide-react";
import { drawingPath, isStorageAvailable, uploadDrawing } from "../../lib/storage";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { cn } from "../../ui/cn";
import {
  BRUSH_COLORS,
  BRUSH_SIZES,
  DEFAULT_BRUSH_SIZE,
  type BrushSize,
} from "./config";
import { DrawingCanvas, type DrawingCanvasHandle } from "./DrawingCanvas";
import { clearDraft, loadDraft, saveDraft } from "./draft";
import { renderToBlob } from "./export";
import { isBlank, serializeStrokes, type Drawing, type StrokeTool } from "./strokes";
import type { DrawingAssignment } from "./state";

type ClientSubmissionStatus = "submitted" | "timeout" | "failed";
type DeliveryStage = "idle" | "saving" | "preparing" | "uploading" | "finalizing" | "failed";

export interface DrawingSubmission {
  url: string | null;
  strokes?: string;
  status?: ClientSubmissionStatus | "pending";
}

/**
 * Finaliza a imagem DEPOIS que os traços já existem no Postgres.
 *
 * Devolvido separado de `onSubmit` de propósito — ver o comentário em
 * `enviar`. A integridade não depende da imagem, mas o passo espera uma
 * confirmação terminal (`submitted`, `timeout` ou `failed`) antes de fechar.
 */
export type DrawingAttach = (
  storagePath: string | null,
  stepIndex: number,
  status: ClientSubmissionStatus,
) => boolean | Promise<boolean>;

/**
 * A tela de desenhar.
 *
 * O canvas manda: cabeçalho compacto, barra de baixo ao alcance do polegar, e
 * o quadrado ocupando tudo o que sobra. É a tela onde a pessoa passa 90
 * segundos com o dedo na tela, então qualquer enfeite aqui custa espaço de
 * desenho.
 */
export function DrawStepScreen({
  pin,
  matchId,
  assignment,
  playerId,
  secondsLeft,
  onSubmit,
  onAttach,
}: {
  pin: string;
  matchId: string;
  assignment: DrawingAssignment;
  playerId: string;
  secondsLeft: number;
  onSubmit: (submission: DrawingSubmission) => boolean | Promise<boolean>;
  onAttach?: DrawingAttach;
}) {
  const canvasRef = useRef<DrawingCanvasHandle | null>(null);
  const [tool, setTool] = useState<StrokeTool>("brush");
  const [color, setColor] = useState(0);
  const [size, setSize] = useState<BrushSize>(DEFAULT_BRUSH_SIZE);
  const [enviando, setEnviando] = useState(false);
  const [etapaEnvio, setEtapaEnvio] = useState<DeliveryStage>("idle");
  const [falhaEnvio, setFalhaEnvio] = useState(false);
  const [confirmandoLimpar, setConfirmandoLimpar] = useState(false);
  const enviadoRef = useRef(false);

  const { chain, stepIndex } = assignment;
  // Rascunho salvo neste aparelho: volta se o navegador recarregar no meio.
  const [rascunho] = useState<Drawing | null>(() =>
    loadDraft(pin, playerId, stepIndex, chain.id),
  );
  // Começa ligado quando veio rascunho: desfazer e limpar precisam valer para
  // um desenho recuperado, não só para o que foi traçado depois do F5.
  const [temTraco, setTemTraco] = useState(() => (rascunho?.length ?? 0) > 0);

  const oQueDesenhar =
    assignment.previous?.kind === "prompt"
      ? assignment.previous.text
      : assignment.previous?.kind === "guess"
        ? assignment.previous.text
        : "";

  /**
   * Entrega o desenho.
   *
   * REGISTRA PRIMEIRO, SOBE DEPOIS — e é essa ordem que conserta o bug do
   * playtest. Antes, a entrega esperava `renderToBlob` + `uploadDrawing`
   * (até 2 x 8s) enquanto a fase fechava com 3s de folga: quem desenhou 90
   * segundos numa rede ruim via a própria página virar branco, porque o envio
   * chegava depois do passo já encerrado.
   *
   * Agora os traços vão antes da imagem e ficam no rascunho até o Postgres
   * confirmar a finalização. A chamada é repetida no 5G; a imagem melhora a
   * página, e uma falha explícita usa os traços sem quebrar a corrente.
   */
  const enviar = useCallback(
    async (status: ClientSubmissionStatus = "submitted") => {
      // Trava contra dedo batendo duas vezes E contra o auto-envio do prazo
      // atropelar um envio manual. A trava definitiva é a unique do banco;
      // esta só evita o trabalho repetido.
      if (enviadoRef.current) return;
      enviadoRef.current = true;
      setEnviando(true);
      setFalhaEnvio(false);
      setEtapaEnvio("saving");

      const strokes = canvasRef.current?.getStrokes() ?? [];
      const vazio = isBlank(strokes);
      const precisaImagem = !vazio && isStorageAvailable() && !!onAttach;

      // 1. Os traços chegam primeiro ao Postgres. Quando haverá imagem, entram
      // como `pending`: estão seguros, mas ainda não liberam o próximo passo.
      const confirmed = await onSubmit({
        url: null,
        ...(vazio ? {} : { strokes: serializeStrokes(strokes) }),
        status: precisaImagem ? "pending" : status,
      });
      if (!confirmed) {
        enviadoRef.current = false;
        setEnviando(false);
        setFalhaEnvio(true);
        setEtapaEnvio("failed");
        return;
      }

      if (!precisaImagem || !onAttach) {
        clearDraft(pin, playerId, stepIndex, chain.id);
        return;
      }

      // 2. Gera e sobe a imagem. Se qualquer parte falhar, o backend fecha a
      // contribuição como `failed` e conserva os traços como fallback. Só o
      // ACK desta finalização limpa o rascunho do aparelho.
      setEtapaEnvio("preparing");
      const imagem = await renderToBlob(strokes);
      setEtapaEnvio("uploading");
      const storagePath = imagem
        ? await uploadDrawing(
          drawingPath({
            pin, matchId, chainId: chain.id, stepIndex, extension: imagem.extension,
          }),
          imagem.blob,
        )
        : null;

      setEtapaEnvio("finalizing");
      const finalized = await onAttach(
        storagePath,
        stepIndex,
        storagePath ? status : "failed",
      );
      if (!finalized) {
        enviadoRef.current = false;
        setEnviando(false);
        setFalhaEnvio(true);
        setEtapaEnvio("failed");
        return;
      }
      clearDraft(pin, playerId, stepIndex, chain.id);
    },
    [chain.id, matchId, onAttach, onSubmit, pin, playerId, stepIndex],
  );

  // Prazo vencido: entrega o que estiver na tela, mesmo em branco. Travar a
  // partida esperando alguém seria pior do que uma página vazia no caderno.
  useEffect(() => {
    if (secondsLeft > 0 || enviadoRef.current) return;
    void enviar("timeout");
  }, [secondsLeft, enviar]);

  /**
   * O celular saiu de cena com desenho na tela.
   *
   * No iOS a aba é SUSPENSA ao trocar de app ou bloquear o aparelho: os
   * temporizadores param e o efeito acima só rodaria muito depois, com o passo
   * já fechado. Entregar aqui é a diferença entre o desenho existir e virar
   * página em branco.
   */
  useEffect(() => {
    const salvar = () => {
      if (enviadoRef.current) return;
      const strokes = canvasRef.current?.getStrokes() ?? [];
      if (isBlank(strokes)) return;
      void enviar("timeout");
    };
    const aoEsconder = () => {
      if (document.visibilityState === "hidden") salvar();
    };
    document.addEventListener("visibilitychange", aoEsconder);
    window.addEventListener("pagehide", salvar);
    return () => {
      document.removeEventListener("visibilitychange", aoEsconder);
      window.removeEventListener("pagehide", salvar);
    };
  }, [enviar]);

  const guardarRascunho = useCallback(
    (strokes: Drawing) => {
      setTemTraco(strokes.length > 0);
      if (!enviadoRef.current) saveDraft(pin, playerId, stepIndex, chain.id, strokes);
    },
    [chain.id, pin, playerId, stepIndex],
  );

  const urgente = secondsLeft <= 10;
  const textoEtapa = etapaEnvio === "saving"
    ? "Salvando traços…"
    : etapaEnvio === "preparing"
      ? "Preparando imagem…"
      : etapaEnvio === "uploading"
        ? "Enviando imagem…"
        : etapaEnvio === "finalizing"
          ? "Confirmando envio…"
          : "Enviando…";

  return (
    <div className="flex w-full max-w-md flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <Card className="min-w-0 flex-1 px-3 py-2">
          <p className="font-action text-[0.65rem] uppercase tracking-wide opacity-70">
            {stepIndex === 0 ? "Sua palavra secreta" : "Desenhe isto"}
          </p>
          <p className="break-words font-display text-xl font-extrabold uppercase leading-tight">
            {oQueDesenhar || "—"}
          </p>
        </Card>
        <span
          className={cn(
            "shrink-0 border-4 border-ink px-3 py-2 font-display text-3xl font-extrabold tabular-nums",
            // Pulso nos últimos segundos, sem número gigante cobrindo a tela:
            // a pessoa ainda precisa desses segundos para desenhar.
            urgente ? "animate-pulse bg-ink text-paper" : "bg-paper",
          )}
        >
          {Math.max(0, secondsLeft)}
        </span>
      </div>

      <div className="relative aspect-square w-full border-4 border-ink bg-white shadow-brutal">
        <DrawingCanvas
          ref={canvasRef}
          tool={tool}
          color={color}
          size={size}
          initialStrokes={rascunho ?? undefined}
          disabled={enviando}
          onStrokesChange={guardarRascunho}
        />
        {enviando ? (
          <div className="absolute inset-0 grid place-items-center bg-paper/80">
            <span className="flex items-center gap-2 font-action text-sm uppercase">
              <Loader2 strokeWidth={3} className="size-5 animate-spin" />
              {textoEtapa}
            </span>
          </div>
        ) : null}
      </div>

      {/* Cor e espessura numa faixa só: o canvas é o que não pode encolher,
          então controle novo entra em altura mínima, nunca em área de desenho. */}
      <div className="flex items-center gap-2">
        <div className="flex flex-1 flex-wrap gap-1.5">
          {BRUSH_COLORS.map((cor, indice) => {
            const ativo = indice === color && tool === "brush";
            return (
              <button
                key={cor}
                type="button"
                aria-label={`Cor ${indice + 1}`}
                aria-pressed={ativo}
                onClick={() => {
                  setColor(indice);
                  // Escolher cor volta para o pincel: ninguém escolhe uma cor
                  // querendo continuar apagando.
                  setTool("brush");
                }}
                style={{ backgroundColor: cor }}
                className={cn(
                  "grid size-8 shrink-0 place-items-center border-4 border-ink transition-transform",
                  "focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-ink",
                  ativo ? "scale-110 shadow-brutal" : "opacity-80",
                )}
              >
                {ativo ? <Check strokeWidth={4} className="size-4 text-white mix-blend-difference" /> : null}
              </button>
            );
          })}
        </div>

        <div className="flex shrink-0 gap-1">
          {(Object.keys(BRUSH_SIZES) as BrushSize[]).map((nome) => {
            const ativo = nome === size;
            return (
              <button
                key={nome}
                type="button"
                aria-label={`Espessura ${nome}`}
                aria-pressed={ativo}
                onClick={() => setSize(nome)}
                className={cn(
                  "grid size-8 place-items-center border-4 border-ink transition-transform",
                  "focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-ink",
                  ativo ? "scale-110 bg-ink shadow-brutal" : "bg-paper",
                )}
              >
                <span
                  className={cn("block rounded-full", ativo ? "bg-paper" : "bg-ink")}
                  style={{
                    width: nome === "small" ? 4 : nome === "medium" ? 8 : 13,
                    height: nome === "small" ? 4 : nome === "medium" ? 8 : 13,
                  }}
                />
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-center font-action text-[0.65rem] uppercase tracking-wide opacity-70">
        Sem letras nem números — só desenho
      </p>

      <div className="flex items-stretch gap-2">
        <ToolButton
          label="Pincel"
          ativo={tool === "brush"}
          onClick={() => setTool("brush")}
          icon={<Brush strokeWidth={3} className="size-5" />}
        />
        <ToolButton
          label="Borracha"
          ativo={tool === "eraser"}
          onClick={() => setTool("eraser")}
          icon={<Eraser strokeWidth={3} className="size-5" />}
        />
        <ToolButton
          label="Voltar"
          disabled={!temTraco}
          onClick={() => canvasRef.current?.undo()}
          icon={<Undo2 strokeWidth={3} className="size-5" />}
        />
        <ToolButton
          label="Limpar"
          disabled={!temTraco}
          onClick={() => setConfirmandoLimpar(true)}
          icon={<Trash2 strokeWidth={3} className="size-5" />}
        />
      </div>

      {falhaEnvio ? (
        <p role="alert" className="border-4 border-ink bg-paper px-3 py-2 text-center font-action text-xs uppercase">
          Seu desenho está salvo. A rede falhou — tente enviar de novo.
        </p>
      ) : null}

      <Button
        size="md"
        variant="solid"
        disabled={enviando || !temTraco}
        onClick={() => void enviar()}
      >
        <Send strokeWidth={3} className="size-5" />
        {falhaEnvio ? "Tentar enviar de novo" : "Enviar desenho"}
      </Button>

      {/* Limpar apaga 90 segundos de trabalho: nunca no primeiro toque. */}
      {confirmandoLimpar ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/60 p-5">
          <Card tilt="tilt-2" className="w-full max-w-xs p-6 text-center">
            <h3 className="font-display text-2xl font-extrabold uppercase">Limpar tudo?</h3>
            <p className="mt-2 font-hand text-lg">Não dá para voltar atrás.</p>
            <div className="mt-5 flex flex-col gap-2">
              <Button size="md" variant="knockout" onClick={() => setConfirmandoLimpar(false)}>
                Cancelar
              </Button>
              <Button
                size="md"
                variant="paper"
                onClick={() => {
                  canvasRef.current?.clear();
                  setConfirmandoLimpar(false);
                }}
              >
                Limpar
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function ToolButton({
  label,
  icon,
  ativo,
  disabled,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  ativo?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={ativo}
      className={cn(
        // Alvo alto: barra de ferramentas usada com o polegar, no meio da pressa.
        "flex min-h-14 flex-1 cursor-pointer flex-col items-center justify-center gap-0.5",
        "border-4 border-ink font-action text-[0.6rem] uppercase shadow-brutal",
        "focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-ink",
        "disabled:cursor-not-allowed disabled:opacity-40",
        ativo ? "bg-ink text-paper" : "bg-paper text-ink",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
