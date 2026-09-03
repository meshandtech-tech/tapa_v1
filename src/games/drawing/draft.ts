import { parseStrokes, serializeStrokes, type Drawing } from "./strokes";

/**
 * Rascunho do desenho em andamento, neste aparelho.
 *
 * Noventa segundos é tempo suficiente para o navegador recarregar sozinho, o
 * celular travar ou alguém puxar a aba errada. Sem isto, o desenho inteiro
 * some e a pessoa volta para uma tela em branco com 20 segundos no relógio.
 *
 * A chave leva passo E caderno: a mesma pessoa desenha várias vezes na
 * partida, e o rascunho de um passo não pode reaparecer no seguinte.
 */
function draftKey(pin: string, playerId: string, stepIndex: number, chainId: string): string {
  return `tapa:draw:${pin}:${playerId}:${stepIndex}:${chainId}`;
}

export function saveDraft(
  pin: string,
  playerId: string,
  stepIndex: number,
  chainId: string,
  strokes: Drawing,
): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(draftKey(pin, playerId, stepIndex, chainId), serializeStrokes(strokes));
  } catch {
    // Cota estourada não pode derrubar o desenho em andamento.
  }
}

export function loadDraft(
  pin: string,
  playerId: string,
  stepIndex: number,
  chainId: string,
): Drawing | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return parseStrokes(localStorage.getItem(draftKey(pin, playerId, stepIndex, chainId)));
  } catch {
    // Safari privado pode expor localStorage e ainda assim negar a leitura.
    return null;
  }
}

export function clearDraft(pin: string, playerId: string, stepIndex: number, chainId: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(draftKey(pin, playerId, stepIndex, chainId));
  } catch {
    // A contribuição já foi confirmada; falhar ao limpar cache não pode
    // transformar sucesso em erro para a pessoa.
  }
}

/** Limpa o que sobrou de partidas anteriores nesta sala. */
export function clearAllDrafts(pin: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    const prefixo = `tapa:draw:${pin}:`;
    const chaves: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const chave = localStorage.key(i);
      if (chave?.startsWith(prefixo)) chaves.push(chave);
    }
    chaves.forEach((chave) => localStorage.removeItem(chave));
  } catch {
    // Mesmo caso do Safari privado: limpeza oportunista, nunca fatal.
  }
}
