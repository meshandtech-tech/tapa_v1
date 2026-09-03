-- Pitch no Escuro: tolerância a imagem quebrada em rede móvel.
--
-- O preload começa no PLAYER_SPIN, mas seu timeout pode terminar já durante a
-- PREPARATION. A apresentação ainda não começou nesse ponto, portanto essa é
-- uma janela segura para o host substituir somente os arquivos que falharam.
-- O tamanho exato evita que um cliente defeituoso deixe alguém com menos de
-- cinco slides.

create or replace function replace_slides(p_room uuid, p_slide_ids text[])
returns rooms language plpgsql security definer set search_path = public as $$
declare r rooms%rowtype;
begin
  if not is_host_of(p_room) then raise exception 'apenas o host'; end if;
  select * into r from rooms where id = p_room;
  if r.phase not in ('PLAYER_SPIN','PLAYER_REVEAL','PREPARATION') then return r; end if;
  if coalesce(array_length(p_slide_ids, 1), 0) <> 5 then return r; end if;

  update matches
     set slide_ids = p_slide_ids,
         used_slide_ids = used_slide_ids || p_slide_ids
   where room_id = p_room and ended_at is null;
  return r;
end;
$$;

revoke all on function replace_slides(uuid, text[]) from public, anon;
grant execute on function replace_slides(uuid, text[]) to authenticated;
