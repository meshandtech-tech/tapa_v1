-- O bucket dos desenhos.
--
-- Fica FORA de `migrations/` de propósito: mexe em `storage.buckets` e
-- `storage.objects`, que são da plataforma e não existem num Postgres comum —
-- se estivesse lá dentro, quebraria o `npm run db:verify`, que valida o
-- esquema num banco descartável.
--
-- Rode no SQL Editor depois das migrations. É idempotente: pode rodar de novo
-- sem erro, o que importa numa reconstrução em que você não lembra até onde
-- chegou.
--
-- Sem bucket o jogo NÃO quebra: `uploadDrawing` devolve `null`, a página fica
-- valendo pelos traços e a corrente segue. O que se perde é a imagem — e, com
-- ela, o alívio de banda que a migration 0013 trouxe, porque aí todo desenho
-- volta a viajar como traço.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tapa-desenhos', 'tapa-desenhos', true, 1048576,
        array['image/webp','image/png'])
on conflict (id) do update
   set public             = true,
       file_size_limit    = 1048576,
       allowed_mime_types = array['image/webp','image/png'];

-- `create policy` não aceita `if not exists`, então derruba antes de criar.
-- É o que torna este arquivo repetível.
drop policy if exists "tapa upload"  on storage.objects;
drop policy if exists "tapa leitura" on storage.objects;
drop policy if exists "tapa atualiza" on storage.objects;

-- Escrita: qualquer sessão do app pode subir, mas SÓ neste bucket.
create policy "tapa upload" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'tapa-desenhos');

-- `upload(..., upsert: true)` precisa também de UPDATE. Sem esta policy, uma
-- primeira tentativa que chegou ao Storage mas perdeu a resposta não podia
-- ser repetida com segurança pela rede instável.
create policy "tapa atualiza" on storage.objects
  for update to authenticated
  using (bucket_id = 'tapa-desenhos' and owner_id = (select auth.uid()::text))
  with check (bucket_id = 'tapa-desenhos' and owner_id = (select auth.uid()::text));

-- Leitura: o bucket é público porque a revelação carrega a imagem pela URL.
-- O que protege o desenho alheio durante a partida não é o bucket e sim o
-- CAMINHO: ele leva o id aleatório do caderno (ver `drawingPath`), então não
-- há URL adivinhável. Índice sequencial aqui entregaria o jogo.
create policy "tapa leitura" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'tapa-desenhos');
