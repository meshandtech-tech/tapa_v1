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

  const replaceSlidesBody = q(`select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                where n.nspname='public' and p.proname='replace_slides'`);
  ok(replaceSlidesBody.includes("not is_host_of"), "replace_slides exige host");
  ok(replaceSlidesBody.includes("'PREPARATION'")
     && replaceSlidesBody.includes("<> 5"),
    "replace_slides recupera preload lento sem aceitar apresentação incompleta");

  for (const action of ["submit_vote", "submit_answer"]) {
    const body = q(`select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                     where n.nspname='public' and p.proname='${action}'`);
    ok(body.includes("any(m.seat_order)"), `${action} aceita só participante da partida`);
  }

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
