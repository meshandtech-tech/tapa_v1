/**
 * Para onde vai cada caderno, a cada passo.
 *
 * O caderno anda UM ASSENTO por rodada, sempre no mesmo sentido — como um
 * relógio. As pessoas ficam paradas; o que gira é o caderno. No passo 0 cada
 * um desenha o próprio tema secreto; no passo 1 eu recebo o caderno do meu
 * vizinho; no passo 2, o do vizinho do vizinho.
 *
 * Tudo aqui é função pura de índices: nada de sorteio por rodada. O único
 * aleatório da partida é o embaralhar do `seatOrder`, uma vez só, no início —
 * é isso que permite reconstruir qualquer atribuição a partir do estado, sem
 * ninguém precisar guardar histórico de quem recebeu o quê.
 */
export type StepType = "draw" | "guess";

/**
 * Quantas contribuições a partida tem.
 *
 * Ímpar vira par por baixo porque o último passo TEM de ser um palpite escrito
 * — é a frase final que se compara com o tema original. Com um número ímpar de
 * passos a corrente terminaria num desenho, e não haveria o que comparar.
 * O preço é que, em sala ímpar, cada caderno não passa por uma pessoa; todo
 * mundo continua jogando todos os passos, só não naquele caderno.
 */
export function contributionStepCount(playerCount: number): number {
  if (playerCount < 2) return 0;
  return playerCount % 2 === 0 ? playerCount : playerCount - 1;
}

/** Passo par desenha, ímpar descreve. O passo 0 é sempre desenho. */
export function stepType(stepIndex: number): StepType {
  return stepIndex % 2 === 0 ? "draw" : "guess";
}

/** Quem cuida do caderno `chainIndex` no passo `step`. Índice no `seatOrder`. */
export function assigneeIndex(chainIndex: number, step: number, playerCount: number): number {
  return (chainIndex + step) % playerCount;
}

/** O inverso: que caderno cai na mão do assento `seatIndex` no passo `step`. */
export function chainIndexFor(seatIndex: number, step: number, playerCount: number): number {
  return ((seatIndex - step) % playerCount + playerCount) % playerCount;
}
