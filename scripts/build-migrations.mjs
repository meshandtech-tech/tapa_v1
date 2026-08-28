/**
 * Junta as migrations num arquivo só, para instalar do zero.
 *
 * O `all-migrations.sql` já dizia "Gerado a partir de supabase/migrations/" e
 * "NAO edite este arquivo" — só que o gerador não existia, então ele era
 * mantido na mão e ficava para trás calado. Um bundle desatualizado é pior que
 * nenhum: quem monta um projeto novo acha que rodou tudo.
 *
 * O bundle serve para BANCO NOVO. Ele começa com `create table` sem
 * `if not exists`, então rodá-lo num banco que já existe falha na primeira
 * tabela e nada depois dele roda. Para atualizar um banco vivo, rode só a
 * migration nova.
 *
 *   node scripts/build-migrations.mjs
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "supabase/migrations";
const SAIDA = "supabase/all-migrations.sql";
/** pg_cron não existe em todo plano, e a partida funciona sem ela. */
const FORA = ["0007_cron.sql"];

const BARRA = "-- ===================================================================";

const PREAMBULO = `-- Tapa — todas as migrations, na ordem.
-- Gerado a partir de supabase/migrations/. NAO edite este arquivo:
-- edite os originais e gere de novo (node scripts/build-migrations.mjs).
--
-- O 0007 (pg_cron) fica de FORA de propósito: ele pode falhar conforme
-- o plano, e é o único opcional. Rode-o depois, separado.
--
-- ATENÇÃO: isto é para banco NOVO. Começa com \`create table\` sem
-- \`if not exists\`, então num banco que já existe ele falha na primeira
-- tabela e nada depois roda. Para atualizar um banco vivo, rode só a
-- migration nova, sozinha.

`;

const arquivos = readdirSync(DIR)
  .filter((nome) => nome.endsWith(".sql") && !FORA.includes(nome))
  .sort();

const corpo = arquivos
  .map((nome) => `\n${BARRA}\n-- ${nome}\n${BARRA}\n${readFileSync(join(DIR, nome), "utf8")}`)
  .join("");

writeFileSync(SAIDA, PREAMBULO + corpo);
console.log(`${SAIDA}: ${arquivos.length} migrations (${arquivos.join(", ")})`);
