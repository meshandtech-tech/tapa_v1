export type SoundEvent = "correct" | "wrong" | "wheel" | "punishment" | "victory";

// Adicione caminhos como "/sounds/correct.mp3" quando os arquivos existirem.
const soundPaths: Partial<Record<SoundEvent, string>> = {};

export function playSound(event: SoundEvent): void {
  const path = soundPaths[event];
  if (!path || typeof Audio === "undefined") return;

  const audio = new Audio(path);
  audio.play().catch(() => {
    // Áudio é opcional; bloqueios de autoplay não interrompem o jogo.
  });
}
