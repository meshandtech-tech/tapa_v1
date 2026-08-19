import { SLIDE_OVERRIDES } from "./slideOverrides";

/**
 * O acervo de slides.
 *
 * As imagens são descobertas SOZINHAS: qualquer arquivo em
 * `src/assets/slides/` entra no acervo sem ninguém tocar em código. Era o
 * pedido — adicionar, tirar ou trocar imagem não pode exigir mexer na lógica
 * do jogo.
 *
 * Ficam em `src/assets` e não em `public/` de propósito: assim o Vite carimba
 * um hash no nome, e o navegador (e a CDN da Vercel) podem guardar a imagem
 * para sempre. Em `public/` não haveria hash, então trocar uma imagem
 * arriscaria servir a antiga do cache no meio de uma festa. O hash também é o
 * que permite pré-carregar sem medo.
 */
export interface PresentationSlide {
  id: string;
  src: string;
  active: boolean;
  category?: string;
  /** Imagem de exemplo que vem no repositório, não uma do acervo de verdade. */
  placeholder: boolean;
}

const arquivos = import.meta.glob<string>(
  "../../assets/slides/*.{png,jpg,jpeg,webp,avif,gif,svg}",
  { eager: true, query: "?url", import: "default" },
);

/** `.../assets/slides/tubarao-de-tenis.png` -> `tubarao-de-tenis` */
function idDoCaminho(caminho: string): string {
  const arquivo = caminho.split("/").pop() ?? caminho;
  return arquivo.replace(/\.[^.]+$/, "");
}

const todos: PresentationSlide[] = Object.entries(arquivos)
  .map(([caminho, src]) => {
    const id = idDoCaminho(caminho);
    const ajuste = SLIDE_OVERRIDES[id] ?? {};
    return {
      id,
      src,
      active: ajuste.active ?? true,
      category: ajuste.category,
      // Convenção: exemplo começa com "_".
      placeholder: id.startsWith("_"),
    };
  })
  .sort((a, b) => a.id.localeCompare(b.id));

const reais = todos.filter((slide) => !slide.placeholder);

/**
 * Acervo em uso.
 *
 * Assim que existir UMA imagem de verdade, os exemplos somem sozinhos — não é
 * preciso lembrar de apagá-los, e não há risco de um slide de exemplo aparecer
 * numa festa de verdade.
 */
export const slideLibrary: readonly PresentationSlide[] =
  reais.length > 0 ? reais : todos;

export const activeSlides: readonly PresentationSlide[] = slideLibrary.filter(
  (slide) => slide.active,
);

export const usingPlaceholders = reais.length === 0 && todos.length > 0;

export function slideById(id: string): PresentationSlide | undefined {
  return slideLibrary.find((slide) => slide.id === id);
}

export function slideSrc(id: string): string | null {
  return slideById(id)?.src ?? null;
}

/**
 * Garante que as imagens estejam na memória ANTES da preparação começar.
 *
 * O pedido era explícito: nunca "troca o slide → tela branca → imagem carrega
 * → a pessoa perde cinco segundos". Devolve quais falharam para que a rodada
 * possa trocar a imagem quebrada antes de começar, em vez de descobrir o
 * problema no meio da apresentação de alguém.
 */
export function preloadSlides(
  ids: readonly string[],
  timeoutMs = 8000,
): Promise<{ ok: string[]; failed: string[] }> {
  const tentativas = ids.map(
    (id) =>
      new Promise<{ id: string; ok: boolean }>((resolve) => {
        const src = slideSrc(id);
        if (!src || typeof Image === "undefined") {
          resolve({ id, ok: false });
          return;
        }
        const imagem = new Image();
        const encerrar = (ok: boolean) => resolve({ id, ok });
        const prazo = setTimeout(() => encerrar(false), timeoutMs);
        imagem.onload = () => { clearTimeout(prazo); encerrar(true); };
        imagem.onerror = () => { clearTimeout(prazo); encerrar(false); };
        imagem.src = src;
      }),
  );

  return Promise.all(tentativas).then((resultados) => ({
    ok: resultados.filter((r) => r.ok).map((r) => r.id),
    failed: resultados.filter((r) => !r.ok).map((r) => r.id),
  }));
}
