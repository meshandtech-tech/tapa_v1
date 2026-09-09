/**
 * Reconstrói o banco inteiro num Postgres descartável e confere o resultado.
 *
 * Existe porque uma reconstrução do zero é justamente quando não se pode
 * descobrir um erro de SQL no meio do caminho: metade das migrations aplicadas
 * é o pior estado possível. Aqui o mesmo `all-migrations.sql` que vai para o
 * SQL Editor roda primeiro contra um banco local, em segundos.
 *
 * O que ele NÃO prova: nada do Supabase em si — Realtime de verdade, Storage,
 * login anônimo. Prova o ESQUEMA: que as migrations aplicam limpas, na ordem,
 * e que o banco resultante tem o que o cliente chama.
 *
 *   npm run db:verify
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORTA = 55432;
const BANCO = "tapa_verify";
const V = "\x1b[32m✓\x1b[0m", X = "\x1b[31m✗\x1b[0m";

const falhas = [];
const ok = (cond, msg) => {
  console.log(`  ${cond ? V : X} ${msg}`);
  if (!cond) falhas.push(msg);
};

function temPg() {
  for (const bin of ["initdb", "pg_ctl", "psql"]) {
    if (spawnSync(bin, ["--version"], { stdio: "ignore" }).status !== 0) return false;
  }
  return true;
}

if (!temPg()) {
  console.log("\n  Postgres local não encontrado (initdb/pg_ctl/psql).");
  console.log("  Instale com `brew install postgresql@17` para validar as migrations offline.\n");
  process.exit(0);
}

const dir = mkdtempSync(join(tmpdir(), "tapa-verify-"));
const data = join(dir, "pgdata");
let subiu = false;

const psql = (args, opts = {}) =>
  execFileSync("psql", ["-h", "127.0.0.1", "-p", String(PORTA), "-U", "postgres", ...args],
    { encoding: "utf8", ...opts });
const q = (sql) => psql(["-d", BANCO, "-tAc", sql]).trim();

try {
  execFileSync("initdb", ["-D", data, "-U", "postgres", "--auth=trust"], { stdio: "ignore" });
  execFileSync("pg_ctl", ["-D", data, "-l", join(dir, "pg.log"), "-o",
    `-p ${PORTA} -c listen_addresses=127.0.0.1 -c unix_socket_directories='' -c wal_level=logical`,
    "-w", "start"], { stdio: "ignore" });
  subiu = true;

  psql(["-qc", `drop database if exists ${BANCO};`, "-c", `create database ${BANCO};`],
    { stdio: "ignore" });

  console.log("\n  Reconstruindo do zero...\n");
  psql(["-d", BANCO, "-v", "ON_ERROR_STOP=1", "-qf", "supabase/local-shim.sql"], { stdio: "ignore" });
  psql(["-d", BANCO, "-v", "ON_ERROR_STOP=1", "-qf", "supabase/all-migrations.sql"], { stdio: "inherit" });
  ok(true, "all-migrations.sql aplica limpo num banco vazio");

  // --- o que o app precisa encontrar do outro lado ---
  const tabelas = q(`select string_agg(table_name,',' order by table_name)
                       from information_schema.tables
                      where table_schema='public' and table_type='BASE TABLE'`).split(",");
  for (const t of ["rooms", "players", "matches", "chains", "contributions",
                   "match_topics", "votes", "answers", "phase_config", "game_rules", "profiles"]) {
    ok(tabelas.includes(t), `tabela ${t}`);
  }

  const semRls = q(`select coalesce(string_agg(tablename,', '),'')
                      from pg_tables where schemaname='public' and not rowsecurity`);
  ok(semRls === "", `RLS ligada em todas as tabelas${semRls ? ` (faltando: ${semRls})` : ""}`);

  /**
   * A regra de banda e de segredo, junta: só linhas PEQUENAS no Realtime.
   * `contributions` no stream significaria desenho viajando no canal para
   * todo mundo — foi o que derrubava a sala antes da migração.
   */
  const rt = q(`select string_agg(tablename,',' order by tablename)
                  from pg_publication_tables where pubname='supabase_realtime'`);
  ok(rt === "matches,players,rooms", `Realtime só em matches, players, rooms (achado: ${rt})`);

  ok(q(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.proname='start_match'`) === "1",
    "existe exatamente UMA start_match (a 0012 derrubou a sobrecarga velha)");

  // Toda RPC que `api.ts` chama tem de existir. É a fronteira que quebra calada.
  const api = readFileSync("src/party/cloud/api.ts", "utf8");
  const chamadas = [...new Set([...api.matchAll(/rpc<[^>]*>\("([a-z_]+)"|rpc\("([a-z_]+)"/g)]
    .map((m) => m[1] ?? m[2]))].sort();
  const existentes = new Set(q(`select string_agg(distinct p.proname,',')
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public'`).split(","));
  const ausentes = chamadas.filter((f) => !existentes.has(f));
  ok(ausentes.length === 0,
    `as ${chamadas.length} RPCs chamadas pelo cliente existem${ausentes.length ? ` (faltando: ${ausentes})` : ""}`);

  /**
   * A 0013. Sem ela a revelação manda imagem E traços, e o cliente descarta os
   * traços sem ler — 96% da foto era isso.
   */
  // A 0014 põe um wrapper de isolamento na frente do snapshot. A montagem da
  // foto continua na função interna, sem permissão direta para o cliente.
  const corpo = q(`select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                    where n.nspname='public' and p.proname='room_snapshot_internal'`);
  ok(corpo.includes("co.storage_path is null then co.strokes"),
    "room_snapshot não manda traços quando já existe imagem (0013)");
  ok(corpo.includes("not v_reveal or m.id is null then '[]'"),
    "room_snapshot esconde os cadernos fora da revelação");

  const createRoomBody = q(`select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                             where n.nspname='public' and p.proname='create_room'`);
  ok(createRoomBody.includes("exception when unique_violation")
     && !createRoomBody.includes("update rooms set closed_at"),
    "colisão de PIN não encerra a sala existente");

  const joinRoomBody = q(`select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                           where n.nspname='public' and p.proname='join_room'`);
  ok(joinRoomBody.includes("for update"), "entradas da mesma sala são serializadas");

  const roomPolicy = q(`select coalesce(qual,'') from pg_policies
                         where schemaname='public' and tablename='rooms'
                           and policyname='rooms_select'`);
  ok(roomPolicy.includes("is_member_of"), "salas abertas não podem ser enumeradas");

  ok(q(`select has_function_privilege(
          'authenticated', 'public.room_snapshot_internal(uuid)', 'EXECUTE')`) === "f",
    "snapshot interno não é chamável pelo cliente");
  ok(q(`select has_function_privilege(
          'authenticated', 'public.advance_phase_internal(uuid,text,timestamptz,boolean)', 'EXECUTE')`) === "f",
    "avanço interno não é chamável por outra sala");

  const lifecycleSnapshotBody = q(`select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                    where n.nspname='public' and p.proname='room_snapshot'`);
  ok(lifecycleSnapshotBody.includes("r.phase <> 'LOBBY'")
     && lifecycleSnapshotBody.includes("room_expired"),
    "pré-entrada no lobby não é bloqueada por associação antiga");

  const resolutionBody = q(`select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                    where n.nspname='public' and p.proname='resolve_room_state'`);
  ok(resolutionBody.includes("room_not_found")
     && resolutionBody.includes("room_closed")
     && resolutionBody.includes("room_expired"),
    "resolução distingue sala inexistente, encerrada e expirada");

  const replaceSlidesBody = q(`select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                where n.nspname='public' and p.proname='replace_slides'`);
  ok(replaceSlidesBody.includes("not is_host_of"), "replace_slides exige host");
  ok(replaceSlidesBody.includes("'PREPARATION'")
     && replaceSlidesBody.includes("<> 5"),
    "replace_slides recupera preload lento sem aceitar apresentação incompleta");

  ok(q(`select duration_ms from phase_config
         where game_id='improv-slides' and phase='PREPARATION'`) === "20000",
    "Pitch mantém os 20 segundos de preparação prometidos na interface");

  ok(q(`select submit_grace_ms('drawing-telephone','DRAW_STEP')`) === "10000",
    "Desenho tem 10 segundos para confirmar/repetir a entrega no 5G");

  const contributionBody = q(`select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                where n.nspname='public' and p.proname='submit_contribution'`);
  ok(contributionBody.includes("for share") && contributionBody.includes("'status', v_status"),
    "Contribuição recebe ACK e termina antes de o passo ser avançado");

  for (const action of ["submit_vote_confirmed", "submit_answer"]) {
    const body = q(`select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                     where n.nspname='public' and p.proname='${action}'`);
    ok(body.includes("any(m.seat_order)"), `${action} aceita só participante da partida`);
  }

  const voteBody = q(`select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                        where n.nspname='public' and p.proname='submit_vote_confirmed'`);
  ok(voteBody.includes("for share") && voteBody.includes("'accepted', true"),
    "voto recebe ACK e termina antes de a votação ser pontuada");

  // Exercita o trigger de verdade: a primeira apresentação recebe cinco
  // itens; a segunda recebe os outros cinco e um refresh só releria a coluna.
  q(`do $verify$
     declare v_room uuid; v_match uuid; v_first text[]; v_refresh text[]; v_second text[];
     begin
       insert into rooms(pin, game_id) values ('9876','improv-slides') returning id into v_room;
       insert into matches(room_id, game_id, slide_ids)
       values (v_room, 'improv-slides',
               array['s1','s2','s3','s4','s5','s6','s7','s8','s9','s10'])
       returning id into v_match;

       if cardinality((select slide_ids from matches where id=v_match)) <> 0 then
         raise exception 'o acervo vazou como apresentacao';
       end if;
       update matches set presenter_index=0 where id=v_match returning slide_ids into v_first;
       select slide_ids into v_refresh from matches where id=v_match;
       if v_refresh is distinct from v_first then
         raise exception 'refresh mudou os slides persistidos';
       end if;
       update matches set presenter_index=1 where id=v_match returning slide_ids into v_second;
       if cardinality(v_first) <> 5 or cardinality(v_second) <> 5 then
         raise exception 'apresentacao incompleta';
       end if;
       if v_first && v_second then
         raise exception 'duas apresentacoes repetiram slides com acervo suficiente';
       end if;
     end $verify$;`);
  ok(true, "Pitch persiste cinco slides diferentes por apresentador consecutivo");

  // Exercita a barreira de desenho como ela acontece na festa: os traços
  // chegam como pending, a fase não é liberada, a finalização confirma um
  // jogador e o timeout materializa o ausente sem deixar buraco na chain.
  q(`do $verify$
     declare
       v_room uuid; v_match uuid; v_p1 uuid; v_p2 uuid;
       v_u1 uuid := gen_random_uuid(); v_u2 uuid := gen_random_uuid();
       v_result jsonb; v_contribution uuid;
     begin
       insert into rooms(pin, game_id, phase)
       values ('8765','drawing-telephone','DRAW_STEP') returning id into v_room;
       insert into players(room_id,user_id,nickname,color,avatar_seed)
       values (v_room,v_u1,'Um','#000','um') returning id into v_p1;
       insert into players(room_id,user_id,nickname,color,avatar_seed)
       values (v_room,v_u2,'Dois','#111','dois') returning id into v_p2;
       update rooms set host_player_id=v_p1 where id=v_room;
       insert into matches(room_id,game_id,seat_order,step_index,step_count)
       values (v_room,'drawing-telephone',array[v_p1,v_p2],0,2)
       returning id into v_match;
       insert into chains(match_id,owner_player_id,prompt_id,original_prompt,position)
       values
         (v_match,v_p1,'t1','tema 1',0),
         (v_match,v_p2,'t2','tema 2',1);

       perform set_config('request.jwt.claim.sub', v_u1::text, true);
       select submit_contribution(
         v_room, null, '{"v":2,"g":2048,"s":[]}'::jsonb, '', 'pending'
       ) into v_result;
       if v_result->>'contribution_id' is null then
         raise exception 'pending nao foi persistido';
       end if;
       v_contribution := (v_result->>'contribution_id')::uuid;
       select submit_contribution(
         v_room, null, '{"v":2,"g":2048,"s":[]}'::jsonb, '', 'pending'
       ) into v_result;
       if (v_result->>'contribution_id')::uuid is distinct from v_contribution
          or (select count(*) from contributions
               where match_id=v_match and step_index=0 and player_id=v_p1) <> 1 then
         raise exception 'reenvio duplicou a contribuicao';
       end if;
       if all_submitted(v_match) then
         raise exception 'pending liberou o passo cedo';
       end if;
       if array_position((select submitted_player_ids from matches where id=v_match), v_p1) is not null then
         raise exception 'pending apareceu como concluido na UI';
       end if;

       select finalize_drawing(v_room,0,null,'failed') into v_result;
       if not coalesce((v_result->>'accepted')::boolean,false) then
         raise exception 'fallback nao foi confirmado';
       end if;
       if array_position((select submitted_player_ids from matches where id=v_match), v_p1) is null then
         raise exception 'finalizacao nao atualizou progresso';
       end if;
       if all_submitted(v_match) then
         raise exception 'jogador ausente foi ignorado cedo';
       end if;

       perform backfill_step(v_match);
       if not all_submitted(v_match) then
         raise exception 'fallback nao liberou o passo';
       end if;
       if exists (select 1 from contributions where match_id=v_match and status='pending') then
         raise exception 'pending sobreviveu ao timeout maximo';
       end if;
       if not exists (select 1 from contributions
                       where match_id=v_match and player_id=v_p2 and status='missed') then
         raise exception 'ausente nao ganhou pagina explicita';
       end if;
     end $verify$;`);
  ok(true, "Desenho espera finalização real e materializa ausentes no timeout");

  // Mesma sessão anônima + mesmo PIN é reconexão, não um novo jogador. Até
  // depois de `left_at`, o índice único permite reativar a mesma identidade.
  q(`do $verify$
     declare v_room uuid; v_user uuid := gen_random_uuid(); v_first uuid; v_second uuid;
             v_result jsonb;
     begin
       insert into rooms(pin,game_id) values ('7654','drawing-telephone') returning id into v_room;
       perform set_config('request.jwt.claim.sub', v_user::text, true);
       select join_room('7654','Pessoa','#222','avatar') into v_result;
       v_first := (v_result->>'player_id')::uuid;
       update players set left_at=now() where id=v_first;
       select join_room('7654','Pessoa','#222','avatar') into v_result;
       v_second := (v_result->>'player_id')::uuid;

       if v_first is distinct from v_second then
         raise exception 'reconexao criou jogador duplicado';
       end if;
       if (select count(*) from players where room_id=v_room and user_id=v_user) <> 1 then
         raise exception 'identidade duplicada na sala';
       end if;
       if (select left_at from players where id=v_first) is not null then
         raise exception 'reconexao nao reativou jogador';
       end if;
     end $verify$;`);
  ok(true, "Refresh/reconexão reutiliza player_id e assento da sessão anônima");

  // Regressão do bloqueio observado no celular: a mesma sessão ainda estava
  // ativa na sala A, criava a sala B, mas o snapshot de B devolvia
  // `room_forbidden` e a UI dizia "sala fechada". O lobby novo precisa abrir;
  // só depois do join confirmado a troca remove a associação antiga.
  q(`do $verify$
     declare
       v_old uuid; v_new uuid; v_third uuid;
       v_user uuid := gen_random_uuid(); v_guest_user uuid := gen_random_uuid();
       v_old_host uuid; v_old_guest uuid; v_result jsonb;
     begin
       insert into rooms(pin,game_id) values ('7640','quem-erra-paga') returning id into v_old;
       insert into players(room_id,user_id,nickname,color,avatar_seed)
       values (v_old,v_user,'Host antigo','#111','old-host') returning id into v_old_host;
       insert into players(room_id,user_id,nickname,color,avatar_seed)
       values (v_old,v_guest_user,'Convidado antigo','#222','old-guest') returning id into v_old_guest;
       update rooms set host_player_id=v_old_host where id=v_old;

       insert into rooms(pin,game_id) values ('7641','quem-erra-paga') returning id into v_new;
       perform set_config('request.jwt.claim.sub', v_user::text, true);

       select room_snapshot(v_new) into v_result;
       if v_result->>'error' is not null then
         raise exception 'lobby novo foi bloqueado: %', v_result->>'error';
       end if;

       select join_room('7641','Host novo','#333','new-host') into v_result;
       if v_result->>'error' is not null then
         raise exception 'entrada na sala nova falhou: %', v_result->>'error';
       end if;
       if (select left_at from players where id=v_old_host) is null then
         raise exception 'associacao antiga continuou ativa';
       end if;
       if (select host_player_id from rooms where id=v_old) is distinct from v_old_guest then
         raise exception 'host da sala antiga nao foi transferido';
       end if;
       if (select closed_at from rooms where id=v_old) is not null then
         raise exception 'sala antiga com convidado foi encerrada';
       end if;

       insert into rooms(pin,game_id) values ('7642','quem-erra-paga') returning id into v_third;
       select room_snapshot(v_third) into v_result;
       if v_result->>'error' is not null then
         raise exception 'terceiro lobby foi bloqueado';
       end if;
       select join_room('7642','Host terceiro','#444','third-host') into v_result;
       if v_result->>'error' is not null then
         raise exception 'segunda troca de sala falhou';
       end if;
       if (select close_reason from rooms where id=v_new) is distinct from 'empty' then
         raise exception 'sala vazia nao foi encerrada';
       end if;
     end $verify$;`);
  ok(true, "sessão antiga não bloqueia sala nova e troca de sala limpa lifecycle");

  // Regressão de concorrência encontrada no stress 2×10: uma sala fica
  // legitimamente vazia entre create_room e o primeiro join. A entrada de uma
  // identidade em OUTRA sala nunca pode encerrar esse lobby recém-criado.
  q(`do $verify$
     declare
       v_waiting uuid; v_joining uuid;
       v_user uuid := gen_random_uuid(); v_result jsonb;
     begin
       insert into rooms(pin,game_id) values ('7638','drawing-telephone')
       returning id into v_waiting;
       insert into rooms(pin,game_id) values ('7639','quem-erra-paga')
       returning id into v_joining;

       perform set_config('request.jwt.claim.sub', v_user::text, true);
       select join_room('7639','Concorrente','#666','parallel') into v_result;
       if v_result->>'error' is not null then
         raise exception 'join de controle falhou: %', v_result->>'error';
       end if;
       if (select closed_at from rooms where id=v_waiting) is not null then
         raise exception 'uma sala vazia de outra identidade foi encerrada';
       end if;
       if (select closed_at from rooms where id=v_joining) is not null then
         raise exception 'sala de controle foi encerrada';
       end if;
     end $verify$;`);
  ok(true, "join concorrente não encerra lobby recém-criado de outra sala");

  q(`do $verify$
     declare v_room uuid; v_user uuid := gen_random_uuid(); v_result jsonb;
     begin
       insert into rooms(pin,game_id,expires_at)
       values ('7643','quem-erra-paga',now() - interval '1 second')
       returning id into v_room;
       perform set_config('request.jwt.claim.sub', v_user::text, true);
       select resolve_room_state('7643') into v_result;
       if v_result->>'status' is distinct from 'room_expired' then
         raise exception 'status inesperado: %', v_result->>'status';
       end if;
       if (select close_reason from rooms where id=v_room) is distinct from 'expired' then
         raise exception 'expiracao nao foi persistida';
       end if;
     end $verify$;`);
  ok(true, "sala expirada é fechada e identificada sem depender de cache/cron");

  q(`do $verify$
     declare
       v_user uuid := gen_random_uuid(); v_room uuid; v_previous uuid;
       v_result jsonb; v_pin text; i int;
     begin
       perform set_config('request.jwt.claim.sub', v_user::text, true);
       for i in 1..30 loop
         v_pin := lpad((8000 + i)::text, 4, '0');
         insert into rooms(pin,game_id) values (v_pin,'quem-erra-paga') returning id into v_room;

         select room_snapshot(v_room) into v_result;
         if v_result->>'error' is not null then
           raise exception 'ciclo % bloqueado antes do join: %', i, v_result->>'error';
         end if;
         select join_room(v_pin,'Ciclico','#555','cycle') into v_result;
         if v_result->>'error' is not null then
           raise exception 'ciclo % falhou no join: %', i, v_result->>'error';
         end if;

         if v_previous is not null
            and (select close_reason from rooms where id=v_previous) is distinct from 'empty' then
           raise exception 'ciclo % deixou sala anterior aberta', i;
         end if;
         if (select count(*) from players p join rooms r on r.id=p.room_id
              where p.user_id=v_user and p.left_at is null and r.closed_at is null) <> 1 then
           raise exception 'ciclo % deixou associacao ativa ambigua', i;
         end if;
         v_previous := v_room;
       end loop;
       perform leave_room(v_previous);
       if (select close_reason from rooms where id=v_previous) is distinct from 'empty' then
         raise exception 'ultimo ciclo nao limpou a sala';
       end if;
     end $verify$;`);
  ok(true, "30 ciclos criar → entrar → trocar/encerrar não prendem a identidade");

  q(`do $verify$
     declare v_room uuid; v_match uuid; v_present uuid; v_voter uuid;
             v_present_user uuid := gen_random_uuid(); v_voter_user uuid := gen_random_uuid();
             v_result jsonb;
     begin
       insert into rooms(pin,game_id,phase,round)
       values ('6543','improv-slides','VOTING',1) returning id into v_room;
       insert into players(room_id,user_id,nickname,color,avatar_seed)
       values (v_room,v_present_user,'Apresenta','#333','apresenta') returning id into v_present;
       insert into players(room_id,user_id,nickname,color,avatar_seed)
       values (v_room,v_voter_user,'Vota','#444','vota') returning id into v_voter;
       update rooms set host_player_id=v_present where id=v_room;
       insert into matches(room_id,game_id,seat_order,presenter_index)
       values (v_room,'improv-slides',array[v_present,v_voter],0) returning id into v_match;

       perform set_config('request.jwt.claim.sub', v_voter_user::text, true);
       select submit_vote_confirmed(v_room,5) into v_result;
       if not coalesce((v_result->>'accepted')::boolean,false) then
         raise exception 'primeiro voto recusado';
       end if;
       select submit_vote_confirmed(v_room,1) into v_result;
       if not coalesce((v_result->>'duplicate')::boolean,false) then
         raise exception 'reenvio nao foi reconhecido como duplicado';
       end if;
       if (select count(*) from votes where match_id=v_match and round=1) <> 1
          or (select rating from votes where match_id=v_match and round=1) <> 5 then
         raise exception 'voto duplicado alterou a linha original';
       end if;

       perform set_config('request.jwt.claim.sub', v_present_user::text, true);
       select submit_vote_confirmed(v_room,5) into v_result;
       if v_result->>'skipped' is distinct from 'presenter' then
         raise exception 'apresentador conseguiu votar em si';
       end if;
     end $verify$;`);
  ok(true, "Voto é idempotente e o apresentador não vota em si mesmo");

  const claimHostBody = q(`select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                            where n.nspname='public' and p.proname='claim_host'`);
  ok(claimHostBody.includes("interval '30 seconds'") && claimHostBody.includes("for update"),
    "Host só transfere após 30 segundos sem presença e com lock da sala");

  const views = q(`select string_agg(table_name,',' order by table_name)
                     from information_schema.views where table_schema='public'`);
  ok((views ?? "").includes("metrics_daily"), "views de métricas criadas");
} catch (erro) {
  console.error(`\n  ${X} a reconstrução falhou:\n`);
  console.error(String(erro.stdout ?? "") + String(erro.stderr ?? erro.message));
  falhas.push("all-migrations.sql não aplicou");
} finally {
  if (subiu) spawnSync("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"], { stdio: "ignore" });
  rmSync(dir, { recursive: true, force: true });
}

console.log(falhas.length
  ? `\n  ${falhas.length} falha(s). O banco NÃO está pronto.\n`
  : "\n  Esquema íntegro. `all-migrations.sql` reconstrói o banco inteiro.\n");
process.exit(falhas.length ? 1 : 0);
