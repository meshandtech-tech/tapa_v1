/**
 * Efeitos sonoros do Tapa.
 *
 * Nenhum arquivo existe ainda, e isso é proposital: a aplicação funciona
 * exatamente igual com ou sem áudio. Falta de som NUNCA derruba nada nem
 * imprime erro — a festa não pode parar porque um mp3 sumiu.
 *
 * Para ativar: coloque os arquivos em `public/sounds/` e registre em
 * SOUND_FILES. Só isso; nenhuma tela precisa mudar.
 *
 * Navegadores bloqueiam áudio antes de qualquer gesto do usuário. Por isso
 * nada toca até `unlockAudio()` ser chamado — o clique em "Começar" serve de
 * destravamento, e antes disso as chamadas viram silêncio em vez de erro.
 */
export type SoundEvent =
  | "player-joined"
  | "countdown"
  | "correct"
  | "wrong"
  | "wheel-spin"
  | "wheel-tick"
  | "wheel-result"
  | "topic-reveal"
  | "slot-spin"
  | "player-reveal"
  | "time-up"
  | "vote-in"
  | "score-reveal"
  | "winner";

/** Vazio de propósito: cada entrada aponta para um arquivo em public/sounds/. */
const SOUND_FILES: Partial<Record<SoundEvent, string>> = {};

const cache = new Map<SoundEvent, HTMLAudioElement>();
let unlocked = false;
let muted = false;

/** Chame no primeiro gesto do usuário — o clique em "Começar", por exemplo. */
export function unlockAudio(): void {
  unlocked = true;
}

export function setMuted(value: boolean): void {
  muted = value;
}

export function isMuted(): boolean {
  return muted;
}

/**
 * Toca um efeito, se houver arquivo e o áudio já tiver sido destravado.
 * Silencioso e sem exceção em qualquer outro caso.
 */
export function playSound(event: SoundEvent, volume = 0.6): void {
  if (!unlocked || muted) return;
  const file = SOUND_FILES[event];
  if (!file || typeof Audio === "undefined") return;

  try {
    let audio = cache.get(event);
    if (!audio) {
      audio = new Audio(file);
      audio.preload = "auto";
      cache.set(event, audio);
    }
    audio.currentTime = 0;
    audio.volume = Math.min(1, Math.max(0, volume));
    // play() devolve promise: sem o catch, um bloqueio do navegador vira
    // "unhandled rejection" no console durante a festa inteira.
    void audio.play().catch(() => {});
  } catch {
    // Áudio é enfeite. Nunca pode escalar para o jogo.
  }
}
