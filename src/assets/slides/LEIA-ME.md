# Slides do "Apresentação Improvisada"

Jogue os PNG aqui dentro. **Só isso.**

Qualquer arquivo `.png`, `.jpg`, `.webp`, `.avif`, `.gif` ou `.svg` nesta pasta
entra no acervo sozinho — não precisa registrar em lista nenhuma nem tocar em
código.

## Adicionar

1. Copie a imagem para esta pasta.
2. Dê um nome descritivo em minúsculas, com hífen: `tubarao-de-tenis.png`.
   O nome do arquivo (sem extensão) vira o id da imagem.
3. Pronto. No `npm run dev` aparece na hora.

## Os arquivos `_exemplo-*.svg`

São slides de mentira, só para o jogo rodar antes de você subir as imagens de
verdade. **Assim que existir UMA imagem sem `_` no começo, os exemplos somem
sozinhos do acervo.** Não precisa apagar (mas pode).

## Tirar uma imagem de circulação sem apagar

Em `src/games/slides/slideOverrides.ts`:

```ts
export const SLIDE_OVERRIDES = {
  "tubarao-de-tenis": { active: false },
};
```

## Por que aqui e não em `public/`

O Vite carimba um hash no nome do arquivo, então o navegador e a CDN podem
guardar a imagem para sempre. Em `public/` não haveria hash, e trocar uma
imagem arriscaria servir a antiga do cache no meio de uma festa.

## Tamanho

Não precisa converter nada à mão. Mas imagem de 8 MB atrasa o pré-carregamento
e a apresentação depende dele: o jogo só entra na preparação depois que os
cinco slides estão na memória. Se der para exportar em ~1280px de largura,
melhor.
