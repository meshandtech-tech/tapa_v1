/**
 * Executa salas completas em paralelo, cada uma com dez sessões anônimas e
 * seu próprio canal Realtime. Use depois de aplicar todas as migrations:
 *
 *   npm run stress:1
 *   npm run stress:2
 *   npm run stress:6
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const roomCount = Number(process.argv[2] ?? 1);
if (![1, 2, 6].includes(roomCount)) {
  throw new Error("a quantidade de salas deve ser 1, 2 ou 6");
}

const games = [
  "quem-erra-paga",
  "drawing-telephone",
  "advogado-do-diabo",
  "improv-slides",
  "quem-erra-paga",
  "drawing-telephone",
];
const runner = fileURLToPath(new URL("./stress-players.mjs", import.meta.url));

function runRoom(index) {
  return new Promise((resolve) => {
    const game = games[index];
    const child = spawn(process.execPath, [runner, "10", game], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ index, game, code, stdout, stderr }));
  });
}

console.log(`\nSTRESS MULTISSALA — ${roomCount} sala(s), 10 jogadores por sala\n`);
const results = await Promise.all(Array.from({ length: roomCount }, (_, index) => runRoom(index)));

for (const result of results) {
  console.log(`\n========== SALA ${result.index + 1}: ${result.game} ==========`);
  process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

const failures = results.filter((result) => result.code !== 0);
console.log(`\nRESULTADO: ${results.length - failures.length}/${results.length} sala(s) concluídas sem falha.`);
process.exit(failures.length ? 1 : 0);
