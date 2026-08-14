/** Junta classes ignorando falsy. Suficiente aqui — não misturamos utilitários conflitantes. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/**
 * Inclinação artesanal determinística pelo índice.
 * Determinístico de propósito: `Math.random()` em render faz o elemento
 * tremer a cada re-render, o que numa TV de festa fica péssimo.
 */
export function tiltByIndex(index: number): string {
  return `tilt-${(index % 4) + 1}`;
}
