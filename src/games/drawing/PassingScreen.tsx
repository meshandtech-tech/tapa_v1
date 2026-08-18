import { motion } from "motion/react";
import { Card } from "../../ui/Card";

/**
 * "Passando os cadernos…" — pouco mais de um segundo.
 *
 * Não é enfeite: é o que traduz na tela o gesto que existiria na mesa se o
 * jogo fosse de papel. Sem esse respiro, a tarefa seguinte aparece no mesmo
 * quadro em que a anterior sumiu e ninguém entende que o caderno trocou de
 * mão. Curto de propósito — o spec pede transições de 1 a 2 segundos, e
 * animação longa entre passos é o jeito mais rápido de cansar a sala.
 */
export function PassingScreen() {
  return (
    <Card tilt="tilt-1" className="w-full max-w-md overflow-hidden p-8 text-center">
      <div className="relative mx-auto h-24 w-full max-w-64">
        {[0, 1, 2].map((indice) => (
          <motion.div
            key={indice}
            initial={{ x: -110, rotate: -8, opacity: 0 }}
            animate={{ x: 110, rotate: 8, opacity: [0, 1, 1, 0] }}
            transition={{
              duration: 1.1,
              delay: indice * 0.16,
              ease: "easeInOut",
              repeat: Infinity,
            }}
            className="absolute left-1/2 top-4 size-16 -translate-x-1/2 border-4 border-ink bg-paper shadow-brutal"
          >
            {/* Rabisco de caderno: três linhas tortas. */}
            <span className="mt-3 block h-1 w-9 translate-x-2 bg-ink" />
            <span className="mt-2 block h-1 w-7 translate-x-2 bg-ink" />
            <span className="mt-2 block h-1 w-8 translate-x-2 bg-ink" />
          </motion.div>
        ))}
      </div>
      <h2 className="mt-4 font-display text-2xl font-extrabold uppercase">
        Passando os cadernos…
      </h2>
    </Card>
  );
}
