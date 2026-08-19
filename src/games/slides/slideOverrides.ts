/**
 * Ajustes por imagem, sem renomear arquivo.
 *
 * A chave é o nome do arquivo SEM extensão. Serve para tirar uma imagem de
 * circulação numa noite específica sem apagá-la do repositório, ou para marcar
 * categoria antes de existir filtro por categoria na interface.
 *
 * Exemplo:
 *
 *   export const SLIDE_OVERRIDES = {
 *     "tubarao-de-tenis": { active: false },
 *     "favela": { category: "lugares" },
 *   };
 */
export const SLIDE_OVERRIDES: Record<
  string,
  { active?: boolean; category?: string }
> = {};
