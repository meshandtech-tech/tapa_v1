import { getSupabase, isSupabaseConfigured } from "./supabase";

/**
 * Guarda dos desenhos.
 *
 * Bucket público, criado à mão no painel do Supabase (instruções no
 * `.env.example`). Só imagem entra, e o caminho usa o id ALEATÓRIO do caderno
 * — com índice sequencial daria para chutar a URL dos cadernos alheios no meio
 * da partida, que é justamente o que o jogo precisa esconder.
 */
export const DRAWINGS_BUCKET = "tapa-desenhos";

/** Duas tentativas: rede de bar oscila, mas insistir demais atrasa a rodada. */
const TENTATIVAS = 2;
/** Acima disto vale mais entregar pelos traços do que continuar esperando. */
const TIMEOUT_MS = 8000;

export function isStorageAvailable(): boolean {
  return isSupabaseConfigured && getSupabase() !== null;
}

export function drawingPath(parts: {
  pin: string;
  matchId: string;
  chainId: string;
  stepIndex: number;
  extension: string;
}): string {
  return `${parts.pin}/${parts.matchId}/${parts.chainId}/step-${parts.stepIndex}.${parts.extension}`;
}

/**
 * Sobe a imagem e devolve o CAMINHO do objeto. `null` quando não deu.
 *
 * O banco guarda esse caminho relativo e a projeção o transforma em URL só
 * quando lê a página. Guardar a URL completa aqui faria a rodada seguinte
 * passar uma URL como se fosse caminho e gerar um endereço inválido.
 *
 * Nunca lança: falhar aqui não pode derrubar a rodada. Quem chama trata o
 * `null` caindo para os traços pelo canal, e a corrente segue.
 */
export async function uploadDrawing(path: string, blob: Blob): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa += 1) {
    try {
      const envio = supabase.storage.from(DRAWINGS_BUCKET).upload(path, blob, {
        contentType: blob.type || "image/webp",
        // Reenvio do mesmo passo sobrescreve em vez de dar conflito — é o que
        // torna a entrega idempotente se o dedo bater duas vezes.
        upsert: true,
        cacheControl: "3600",
      });

      const { error } = await comLimiteDeTempo(envio, TIMEOUT_MS);
      if (error) throw error;

      return path;
    } catch (erro) {
      const ultima = tentativa === TENTATIVAS;
      console.error(`[tapa] envio do desenho falhou (${tentativa}/${TENTATIVAS})`, erro);
      if (ultima) return null;
    }
  }
  return null;
}

/** Promessa com prazo: sem isto um upload pendurado seguraria a rodada inteira. */
async function comLimiteDeTempo<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("tempo esgotado")), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
