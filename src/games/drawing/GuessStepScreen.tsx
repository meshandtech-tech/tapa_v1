import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { cn } from "../../ui/cn";
import { DrawingReplay } from "./DrawingReplay";
import type { DrawingAssignment } from "./state";

/**
 * A tela de adivinhar.
 *
 * Mostra o desenho e MAIS NADA: nem quem desenhou, nem de que caderno veio,
 * nem o que estava escrito antes. É a regra que faz o jogo funcionar —
 * qualquer pista aqui encurta a corrente e mata a revelação.
 */
export function GuessStepScreen({
  assignment,
  secondsLeft,
  onSubmit,
}: {
  assignment: DrawingAssignment;
  secondsLeft: number;
  onSubmit: (text: string) => void;
}) {
  const [texto, setTexto] = useState("");
  const enviadoRef = useRef(false);
  const textoRef = useRef("");
  textoRef.current = texto;

  // Prazo vencido: manda o que já estava digitado. Só não INVENTA palpite —
  // campo vazio vira página em branco, e a revelação mostra isso como tal.
  useEffect(() => {
    if (secondsLeft > 0 || enviadoRef.current) return;
    enviadoRef.current = true;
    const atual = textoRef.current.trim();
    if (atual) onSubmit(atual);
  }, [secondsLeft, onSubmit]);

  /**
   * O celular saiu de cena com palpite digitado.
   *
   * Este é o caso do teclado aberto: no iOS, trocar de app ou bloquear a tela
   * SUSPENDE a aba, os temporizadores param, e o efeito acima só rodaria muito
   * depois — com o passo já fechado e o texto perdido. Quem escreveu
   * "elefante andando de bicicleta" e não apertou Enviar merece que valha.
   */
  useEffect(() => {
    const salvar = () => {
      if (enviadoRef.current) return;
      const atual = textoRef.current.trim();
      if (!atual) return;
      enviadoRef.current = true;
      onSubmit(atual);
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
  }, [onSubmit]);

  const enviar = () => {
    const limpo = texto.trim();
    if (!limpo || enviadoRef.current) return;
    enviadoRef.current = true;
    onSubmit(limpo);
  };

  const urgente = secondsLeft <= 10;
  const desenho = assignment.previous?.kind === "drawing" ? assignment.previous.page : null;

  return (
    <div className="flex w-full max-w-md flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Card className="min-w-0 flex-1 px-3 py-2">
          <p className="font-display text-xl font-extrabold uppercase leading-tight">
            O que é isso?
          </p>
        </Card>
        <span
          className={cn(
            "shrink-0 border-4 border-ink px-3 py-2 font-display text-3xl font-extrabold tabular-nums",
            urgente ? "animate-pulse bg-ink text-paper" : "bg-paper",
          )}
        >
          {Math.max(0, secondsLeft)}
        </span>
      </div>

      <div className="aspect-square w-full border-4 border-ink bg-white shadow-brutal">
        {desenho ? (
          <DrawingReplay page={desenho} />
        ) : (
          <div className="grid size-full place-items-center p-6 text-center">
            <p className="font-hand text-xl">Chegou uma folha em branco. Chuta alguma coisa.</p>
          </div>
        )}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          enviar();
        }}
        className="flex flex-col gap-2"
      >
        <input
          type="text"
          value={texto}
          onChange={(event) => setTexto(event.target.value)}
          maxLength={60}
          // Autocorreção do teclado fica LIGADA de propósito: é palpite de
          // festa, não ditado — brigar com o corretor só atrasa quem digita.
          autoComplete="off"
          enterKeyHint="send"
          placeholder="escreve seu palpite…"
          aria-label="Seu palpite"
          className="min-h-14 w-full border-4 border-ink bg-paper px-4 font-ui text-lg
                     shadow-brutal placeholder:opacity-50
                     focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-ink"
        />
        <Button type="submit" size="md" variant="solid" disabled={!texto.trim()}>
          <Send strokeWidth={3} className="size-5" />
          Enviar palpite
        </Button>
      </form>
    </div>
  );
}
