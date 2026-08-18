# Checklist — Telefone Sem Fio de Desenho

Ordem de implementação. Atualizado a cada commit.
Plano completo: `PLANO-JOGO-DESENHO.txt`

## Núcleo lógico (puro, testável sem navegador)

- [x] `config.ts` — tempos e limites num lugar só (4–10 jogadores, 90s/60s)
- [x] `routing.ts` — o caderno andando um assento por rodada
- [x] `routing.test.ts` — **73 testes**, invariantes provadas de 4 a 10 jogadores
- [x] `matching.ts` — comparar palpite final com o tema (acento, caixa, pontuação)
- [x] `matching.test.ts` — 9 testes
- [x] `data/drawingPrompts.ts` — 120 temas originais em PT-BR
- [x] `strokes.ts` — traço normalizado 0–1, serialização, replay
- [x] `strokes.test.ts` — 12 testes, ida e volta e imunidade a viewport

## Estado da party

- [x] `types.ts` — `DrawingState`, `DrawingChain`, `DrawingPage` + 5 fases novas
- [x] `partyStorage.ts` — `PHASES` e `isDrawingState` *(armadilha conhecida: fase
      esquecida aqui derruba a sala num F5, sem erro visível)*
- [x] `partyReducer.ts` — `advanceDrawing`, submissões idempotentes, timeout
- [x] `state.test.ts` — 51 testes: submissão dupla vira no-op, timeout segue,
      tema não repete na mesma partida
- [x] `PartyChannel.ts` — eventos de submissão e comandos de revelação
- [x] `usePartyRoom.ts` — generalizar o "todos já responderam" (hoje preso ao quiz)

## Desenho

- [x] `DrawingCanvas.tsx` — Pointer Events, DPR, ref + rAF, traço suavizado
- [x] `export.ts` — WebP com queda para PNG
- [x] `lib/storage.ts` — Supabase Storage com repetição, queda para traços pelo canal
- [x] `draft.ts` — rascunho local, volta depois de um F5
- [ ] **Bucket no Supabase** — instruções no `.env.example` *(precisa de você)*

## Telas

- [x] `identity.ts` — paleta papel + `playerTheme(color)` por jogador
- [x] `DrawStepScreen.tsx`
- [x] `GuessStepScreen.tsx` — teclado do mobile sem salto de página
- [x] `WaitingCard.tsx` — `6 / 8 PRONTOS`, avatares acendendo
- [x] `PassingScreen.tsx`
- [x] `RevealScreen.tsx` — slideshow, autoria, começou × terminou, compartilhar
- [x] `DrawingHostActions.tsx`
- [x] `registry.ts` + `PlayerLobbyScreen.tsx` + `PlayerLobbyScreen.tsx` — ligar tudo

## Fechamento

- [ ] `npm test` verde (baseline eram 131)
- [x] `npm run build` limpo (`tsc -b` é a checagem estática; não há lint)
- [ ] Partida completa no navegador com 4 jogadores, depois 5 (ímpar)
- [ ] Desenho: mouse, toque, desfazer, borracha, limpar, rotação de tela
- [ ] F5 antes de enviar (rascunho volta) e depois de enviar (não reenvia)
- [ ] Revelação nos dois ritmos + compartilhar
