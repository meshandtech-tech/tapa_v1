/**
 * Os sorteios do jogo de desenho, isolados aqui.
 *
 * Ficam fora do reducer de propósito: o reducer é puro e recebe o resultado
 * pronto. É isso que garante que dois aparelhos nunca discordem sobre qual
 * tema saiu para qual caderno — quem sorteia é só a autoridade, uma vez.
 */

/** Id curto e imprevisível. Vira caminho no Storage, então não pode ser óbvio. */
export function randomId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  }
  return Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 8);
}

/** Fisher-Yates com cópia: a lista de origem nunca é mexida. */
export function shuffle<T>(items: readonly T[], random: () => number = secureRandom): T[] {
  const saida = [...items];
  for (let i = saida.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [saida[i], saida[j]] = [saida[j], saida[i]];
  }
  return saida;
}

/** Aleatório do sistema quando existe; `Math.random` quando não. */
export function secureRandom(): number {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return buffer[0] / 2 ** 32;
  }
  return Math.random();
}
