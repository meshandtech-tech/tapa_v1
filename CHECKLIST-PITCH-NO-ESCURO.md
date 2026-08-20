# Checklist — Pitch no Escuro (apresentação improvisada)

Chave interna: `improv-slides`. Título público: **Pitch no Escuro** —
o card "em breve" já descrevia este jogo, então foi preenchido em vez de
virar um segundo card igual.

## Núcleo lógico

- [x] `slides/config.ts` — 5 slides, 20s de preparo, 20s por slide, 3–10 jogadores
- [x] `slides/library.ts` — acervo que se descobre sozinho + pré-carregamento
- [x] `slides/slides.ts` — sorteio, rodízio, tempo derivado, votos, placar
- [x] `slides/slides.test.ts` — **21 testes**
- [x] `slideOverrides.ts` — desligar imagem sem apagar arquivo

## Estado

- [x] `SlidesState` em `PartyState`, ao lado de quiz/devil/drawing
- [x] Reaproveita as fases do Advogado do Diabo (mesmas batidas)
- [x] `partyStorage` — validador (senão um F5 derruba a sala)
- [x] `SKIP_SLIDE` e `REPLACE_SLIDES`

## Telas

- [x] Instruções, sorteio, revelação, preparo, 3-2-1
- [x] `SlideStage` — moldura 4:3, `object-contain`, progresso, batida narrativa
- [x] Votação em 5 emojis, nota, resultado final
- [x] `SlidesHostActions` — pausar, pular slide, encerrar, fechar votação
- [x] `PitchNoEscuroHost` — tela grande
- [x] `TelefoneSemFioHost` — tela grande do jogo de desenho (estava caindo no quiz)

## Conferido no navegador

- [x] Partida completa com 4 jogadores, todos apresentaram uma vez
- [x] Slides trocam exatamente em 20/40/60/80s, sincronizados nos 4 aparelhos
- [x] 5 imagens distintas por apresentação
- [x] Apresentador não vota em si; ninguém vota duas vezes
- [x] Host fecha a votação; média calculada; placar final ordenado
- [x] Jogar de novo mantém a sala e zera as notas
- [x] F5 no meio da apresentação volta no slide certo
- [x] Sem vazamento horizontal de 360px a 1440px
- [x] TV: slide de 800x600 em 1440x900, sem rolagem

## Falta

- [x] **32 imagens de verdade no acervo** — vindas de `photos_slides/` via
      `npm run slides:sync`; os exemplos saíram sozinhos
- [ ] Jogar com gente de verdade
- [ ] Ganchos de áudio (a plataforma inteira ainda não tem arquivo de som)
