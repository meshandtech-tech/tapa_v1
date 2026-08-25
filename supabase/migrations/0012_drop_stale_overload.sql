-- Correção: `start_match` ficou duplicada.
--
-- `create or replace function` só SUBSTITUI quando a assinatura bate exatamente.
-- O `0011` acrescentou `p_punishment_count`, então em vez de substituir criou
-- uma SOBRECARGA — e o Postgres passou a ter duas `start_match`.
--
-- O app não quebrou porque `api.startMatch` sempre manda os sete argumentos, e
-- aí o PostgREST consegue escolher. Mas qualquer chamada que omita um
-- argumento morre com "Could not choose the best candidate function", e a
-- função velha continua lá, sem a checagem de mínimo de jogadores — quem a
-- chamasse contornaria a regra sem perceber.
--
-- Lição para as próximas: mudar a lista de parâmetros de uma função exige
-- DROP explícito da versão antiga. `create or replace` não avisa.

drop function if exists start_match(uuid, jsonb, jsonb, int[], int[], text[]);

-- Confere que sobrou uma só. Estoura a migration se não sobrou — melhor
-- falhar aqui do que descobrir no meio da festa.
do $$
declare v_n int;
begin
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'start_match';
  if v_n <> 1 then
    raise exception 'start_match tem % versoes, esperado 1', v_n;
  end if;
end;
$$;
