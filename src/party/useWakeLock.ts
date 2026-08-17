import { useEffect } from "react";

/**
 * Mantém a tela acesa enquanto `active`.
 *
 * Sem isto, o celular que comanda a partida bloqueia sozinho, o navegador
 * congela os temporizadores e o jogo trava para TODO MUNDO — não só para quem
 * está com o aparelho na mão. É o preço de não ter servidor: a autoridade
 * precisa estar acordada.
 *
 * A API não existe em todo navegador (e falha se a aba estiver oculta). Nada
 * disso é fatal: degrada em silêncio e a recuperação por visibilidade cobre o
 * resto.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const anyNav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
    };
    if (!anyNav.wakeLock) return;

    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;

    const pedir = async () => {
      try {
        const lock = await anyNav.wakeLock!.request("screen");
        if (cancelled) {
          void lock.release();
          return;
        }
        sentinel = lock;
      } catch {
        // Aba oculta ou navegador sem suporte. Segue o jogo.
      }
    };

    // O bloqueio cai sozinho quando a aba sai de foco: repede ao voltar.
    const aoVoltar = () => {
      if (document.visibilityState === "visible" && !sentinel) void pedir();
    };

    void pedir();
    document.addEventListener("visibilitychange", aoVoltar);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", aoVoltar);
      void sentinel?.release().catch(() => {});
      sentinel = null;
    };
  }, [active]);
}

interface WakeLockSentinelLike {
  release: () => Promise<void>;
}
