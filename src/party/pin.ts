const PIN_LENGTH = 4;

function randomDigit(): number {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return buffer[0] % 10;
  }
  return Math.floor(Math.random() * 10);
}

/** PIN de 4 dígitos. Pode começar com zero — é sempre tratado como string. */
export function generatePin(): string {
  let pin = "";
  for (let index = 0; index < PIN_LENGTH; index += 1) pin += String(randomDigit());
  return pin;
}

/**
 * PIN que não colide com uma sala já existente. Sem isto, criar uma party pode
 * cair num PIN cujo estado antigo ainda está no localStorage — e o host
 * reidrata o roster da festa passada em vez de abrir uma sala limpa.
 *
 * Recebe o teste de ocupação por parâmetro para não criar ciclo de import com
 * `partyStorage` (que já importa `isValidPin` daqui).
 *
 * Se todas as tentativas colidirem — improvável com 10 000 PINs possíveis —
 * devolve a última mesmo assim: uma sala reidratada é melhor que travar.
 */
export function generateFreePin(
  isTaken: (pin: string) => boolean,
  attempts = 10,
): string {
  let pin = generatePin();
  for (let index = 0; index < attempts && isTaken(pin); index += 1) {
    pin = generatePin();
  }
  return pin;
}

export function isValidPin(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}$/.test(value);
}

/** Normaliza o que o jogador digitou: só dígitos, no máximo 4. */
export function sanitizePinInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, PIN_LENGTH);
}

export function buildInviteUrl(pin: string, origin: string): string {
  return `${origin.replace(/\/$/, "")}/join?pin=${pin}`;
}
