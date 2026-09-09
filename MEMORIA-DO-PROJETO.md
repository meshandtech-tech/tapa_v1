# Memória do projeto TAPA

Última atualização: 2026-09-09

Este arquivo é o ponto de retomada. Antes de implementar, leia também:

- `AUDIT-CONFIABILIDADE-MULTIPLAYER-2026-09-09.md`
- `PLANO-IOS-E-BACKEND.md`
- `apps/ios/README.md`

## Estado confirmado

- Frontend web: React + Vite, hospedado na Vercel.
- Backend autoritativo: Supabase Auth, Postgres/RPCs, Realtime e Storage.
- Migrations 0021 e 0022 aplicadas no projeto Supabase canônico.
- Gate público das migrations 0015–0022 aprovado em produção.
- Testes web: 422/422 aprovados; build Vite aprovado.
- Banco completo reconstrói do zero e passou 30 ciclos de lifecycle.
- Stress pós-correção: 1×10, 2×10 e 6×10 aprovados.
- Resultado 6×10: 60 identidades/canais, 5.986 RPCs, zero retry, zero erro
  persistente e 6/6 partidas concluídas.
- Cortes offline automatizados de 5 e 30 segundos preservaram sala, jogador e
  host e convergiram ao voltar.
- Scaffold SwiftUI em `apps/ios` compila e o XCTest de snapshot passa quando
  usado o toolchain completo do Xcode.

## Bugs corrigidos

1. Uma sessão presa na sala A criava a B, recebia `room_forbidden` e a UI dizia
   incorretamente “sala fechada”.
2. A primeira correção de lifecycle fechava globalmente lobbies ainda vazios
   entre `create_room` e o primeiro `join_room`; a 0022 limitou a limpeza às
   salas anteriores da mesma identidade.
3. Falha de rede, autenticação, sala expirada, fechada ou inexistente agora têm
   estados diferentes; offline preserva o último snapshot e tenta recuperar.

## Decisões que não devem ser revertidas sem nova evidência

- Manter Supabase + Vercel nesta fase.
- Postgres/RPCs são a fonte de verdade; Realtime apenas invalida e dispara novo
  snapshot.
- Swift e React consomem o mesmo contrato e não duplicam regras dos jogos.
- Nunca desabilitar RLS ou colocar `service_role` no frontend/Swift.
- Não reescrever migrations já aplicadas; correções novas recebem novo número.
- Confiabilidade e playtest vêm antes de novas funcionalidades.

## Próxima sequência

1. Confirmar que a Vercel publicou o commit com o cliente de reconexão.
2. Fazer um smoke no domínio publicado: criar, entrar, iniciar e encerrar.
3. Validar em Safari/iPhone real e realizar uma troca Wi-Fi ↔ 5G.
4. Se o gate continuar verde, começar a fatia vertical iOS:
   - configuração segura e Anonymous Auth;
   - criar/entrar em sala;
   - snapshot + Realtime + reconexão;
   - lobby SwiftUI;
   - primeiro jogo completo: Quem Erra, Paga.
5. Só depois portar os outros jogos, começando por Advogado do Diabo e deixando
   Telefone Sem Fio/PencilKit por último.

## Configuração local conhecida

O Xcode está em `/Applications/Xcode.app`, mas `xcode-select` ainda apontava
para `/Library/Developer/CommandLineTools`. O teste funcionou com:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer swift test --package-path apps/ios
```

Não registrar chaves reais. `apps/ios/Config/Secrets.xcconfig` permanece
ignorado; somente o exemplo pode entrar no Git.

## Implementação iOS em andamento

- O cliente Swift passou a consumir `resolve_room_state` e a distinguir sala
  inexistente, encerrada, expirada, PIN inválido e sessão expirada.
- Próximo incremento: preservar o último snapshot durante falha de transporte e
  ressincronizar ao reconectar, antes de implementar comandos de jogo.
