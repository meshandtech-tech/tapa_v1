/**
 * O palpite final bateu com o tema original?
 *
 * Comparação de string crua não serve: ninguém digita acento no celular com
 * pressa, e "Macaco!" e "macaco" são a mesma resposta. Errar isso estraga o
 * melhor momento do jogo — a sala vê que acertou e o placar diz que não.
 *
 * Mesmo assim a comparação automática nunca vai pegar "carro" e "automóvel".
 * Por isso o host tem `CONTAR COMO ACERTO` na revelação: a máquina resolve o
 * óbvio, a mesa resolve o resto.
 */

/**
 * Palavras que só enfeitam a frase. Tirar artigo e preposição faz
 * "um cachorro pilotando uma moto" bater com "cachorro pilotando moto" —
 * que é a mesma resposta dita por duas pessoas diferentes.
 */
const ENFEITES = new Set([
  "o", "a", "os", "as",
  "um", "uma", "uns", "umas",
  "de", "do", "da", "dos", "das",
  "em", "no", "na", "nos", "nas",
  "ao", "aos", "e",
]);

/** Minúscula, sem acento, sem pontuação, sem espaço sobrando. */
export function normalizeAnswer(text: string): string {
  return text
    .normalize("NFD")
    // Tira os diacríticos separados pelo NFD, deixando a letra base.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    // Pontuação e símbolo viram espaço; letra e número de qualquer idioma ficam.
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** A mesma frase, sem os enfeites. Só usada para comparar, nunca para exibir. */
export function looseAnswer(text: string): string {
  const palavras = normalizeAnswer(text)
    .split(" ")
    .filter((palavra) => palavra && !ENFEITES.has(palavra));
  // Frase que era só enfeite volta inteira: melhor comparar demais que virar "".
  return palavras.length > 0 ? palavras.join(" ") : normalizeAnswer(text);
}

/**
 * Bateu? Compara com o tema e com as respostas alternativas declaradas no
 * banco de temas ("celular" também é "telefone", "smartphone").
 */
export function answersMatch(
  guess: string,
  prompt: string,
  acceptedAnswers: readonly string[] = [],
): boolean {
  const palpite = normalizeAnswer(guess);
  if (!palpite) return false;

  const alvos = [prompt, ...acceptedAnswers];
  return alvos.some((alvo) => {
    const exato = normalizeAnswer(alvo);
    if (!exato) return false;
    return palpite === exato || looseAnswer(guess) === looseAnswer(alvo);
  });
}
