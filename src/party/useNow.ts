import { useEffect, useState } from "react";

/**
 * Relógio que anda enquanto `active` for verdadeiro.
 *
 * O cronômetro NÃO é contado em estado da party: o que viaja pela rede é o
 * `deadline` (um instante absoluto). Cada aparelho compara com o próprio
 * relógio e desenha os segundos restantes. Assim ninguém precisa transmitir
 * "faltam 14, faltam 13..." e um celular que trave por 2s não fica dessincado.
 *
 * O preço é depender do relógio local estar mais ou menos certo — o que é
 * seguro na prática, porque celulares sincronizam a hora pela rede.
 */
export function useNow(active: boolean, intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [active, intervalMs]);

  return now;
}
