# Slides do "Pitch no Escuro"

## O jeito normal: `photos_slides/`

Jogue as imagens em **`tapa_v1/photos_slides/`** (na raiz do repositório, um
nível acima desta pasta) e rode:

```
npm run slides:sync
```

Pronto. O script copia, arruma os nomes e apaga os slides de exemplo.

**Por que precisa do comando:** o Vite só enxerga o que está dentro de
`despedida_de_solteiro_/`. A `photos_slides` fica fora, então de lá as imagens
nunca entrariam no acervo sozinhas. O `sync` faz essa ponte.

Pode rodar quantas vezes quiser: só copia o que mudou e nunca apaga o que você
tenha colocado à mão aqui.

## O jeito direto

Copiar a imagem para **esta pasta** também funciona, e nem precisa de comando —
qualquer `.png`, `.jpg`, `.webp`, `.avif` ou `.gif` aqui entra no acervo
sozinho. O nome do arquivo (sem extensão) vira o id da imagem.

## Tirar uma imagem de circulação sem apagar

Em `src/games/slides/slideOverrides.ts`:

```ts
export const SLIDE_OVERRIDES = {
  "john-pork": { active: false },
};
```

## Por que aqui e não em `public/`

O Vite carimba um hash no nome do arquivo, então o navegador e a CDN podem
guardar a imagem para sempre. Em `public/` não haveria hash, e trocar uma
imagem arriscaria servir a antiga do cache no meio de uma festa.

## Tamanho

Não precisa converter nada à mão. Mas imagem de 8 MB atrasa o
pré-carregamento, e a apresentação depende dele: o jogo só entra na preparação
depois que os cinco slides estão na memória.
