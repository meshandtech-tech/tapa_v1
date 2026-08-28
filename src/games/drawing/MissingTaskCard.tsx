import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";

/** Quantas releituras automáticas antes de admitir que deu errado. */
const TENTATIVAS = 4;
/** Espaçamento entre elas. Sobe a cada volta: rede de bar volta em segundos. */
const ESPERA_MS = [400, 1200, 2500, 4000];

/**
 * "A sua vez está chegando" — e nunca "desenho enviado".
 *
 * Esta tela existe por causa do playtest de 10 jogadores. A tarefa do passo
 * não chegava, `assignmentFor` devolvia `null`, e a tela caía no MESMO cartão
 * de quem já tinha entregado: dez celulares dizendo "Desenho enviado / 0 / 10
 * prontos" sem uma única pessoa ter desenhado. A mesa não tinha como saber se
 * o jogo estava carregando, travado ou quebrado — e nós também não.
 *
 * Duas regras saem daqui:
 *
 * 1. "Esperando a galera" é para DEPOIS de entregar. Antes disso, o que a
 *    pessoa vê é o que está realmente acontecendo.
 * 2. Espera sem fim é proibida. Rebusca a foto autoritativa algumas vezes,
 *    sozinha, e se ainda assim não vier, DIZ que não veio e oferece o botão.
 *    Um spinner eterno é a única falha que ninguém consegue depurar depois.
 */
export function MissingTaskCard({
  stepIndex,
  stepCount,
  onRetry,
}: {
  stepIndex: number;
  stepCount: number;
  /** Rebusca a foto do servidor. Ausente no caminho local, onde não há foto. */
  onRetry?: () => void;
}) {
  const [tentativa, setTentativa] = useState(0);
  const desistiu = tentativa >= TENTATIVAS;
  const retryRef = useRef(onRetry);
  retryRef.current = onRetry;

  useEffect(() => {
    if (desistiu || !retryRef.current) return;
    const timer = window.setTimeout(() => {
      retryRef.current?.();
      setTentativa((n) => n + 1);
    }, ESPERA_MS[tentativa] ?? 4000);
    return () => window.clearTimeout(timer);
  }, [tentativa, desistiu]);

  if (desistiu) {
    return (
      <Card tilt="tilt-1" className="w-full max-w-md p-7 text-center">
        <AlertTriangle strokeWidth={2.5} className="mx-auto mb-3 size-12" />
        <h2 className="font-display text-2xl font-extrabold uppercase leading-tight">
          Seu caderno não chegou
        </h2>
        <p className="mt-3 font-ui text-lg leading-snug">
          A partida está rolando, mas este aparelho não recebeu a tarefa do
          passo {stepIndex + 1}. Normalmente é a rede.
        </p>
        <p className="mt-2 font-hand text-lg">
          Tenta de novo — o passo continua aberto para você.
        </p>
        <Button
          size="md"
          variant="solid"
          className="mt-5 w-full"
          onClick={() => {
            setTentativa(0);
            onRetry?.();
          }}
        >
          <RefreshCw strokeWidth={3} className="size-5" />
          Buscar de novo
        </Button>
        <p className="mt-3 font-action text-[0.65rem] uppercase tracking-wide opacity-60">
          Se insistir, peça ao host para pular a espera
        </p>
      </Card>
    );
  }

  return (
    <Card tilt="tilt-3" className="w-full max-w-md p-7 text-center">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 1.4, ease: "linear" }}
        className="mx-auto mb-3 w-fit"
      >
        <Loader2 strokeWidth={2.5} className="size-12" />
      </motion.div>
      <h2 className="font-display text-2xl font-extrabold uppercase leading-tight">
        Preparando seu caderno
      </h2>
      <p className="mt-3 font-hand text-xl">
        {stepIndex === 0 ? "Sua palavra secreta está a caminho…" : "O caderno do vizinho está chegando…"}
      </p>
      <p className="mt-4 font-action text-[0.7rem] uppercase tracking-wide opacity-70">
        Passo {stepIndex + 1} de {stepCount}
      </p>
    </Card>
  );
}
