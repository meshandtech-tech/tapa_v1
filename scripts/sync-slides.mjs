/**
 * Copia as imagens de `photos_slides/` para dentro do app.
 *
 * A pasta `photos_slides` fica na RAIZ do repositório, um nível acima do app.
 * É cômoda para largar arquivo, e é onde o dono do projeto já joga as imagens —
 * mas o Vite só enxerga o que está dentro de `despedida_de_solteiro_/`, então
 * de lá elas nunca entrariam no acervo. Este script faz a ponte.
 *
 *   npm run slides:sync
 *
 * Roda quantas vezes quiser: só copia o que mudou, e nunca apaga nada que você
 * tenha colocado à mão em `src/assets/slides/`.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const origem = resolve(aqui, "../../photos_slides");
const destino = resolve(aqui, "../src/assets/slides");

const ACEITOS = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif"]);

/** `images (12).jpeg` -> `images-12`. Vira o id da imagem no jogo. */
function idLimpo(arquivo) {
  return arquivo
    .replace(/\.[^.]+$/, "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

if (!existsSync(origem)) {
  console.error(`[tapa] pasta não encontrada: ${origem}`);
  console.error("       crie photos_slides/ na raiz do repositório e jogue as imagens lá.");
  process.exit(1);
}
mkdirSync(destino, { recursive: true });

const arquivos = readdirSync(origem).filter((nome) => ACEITOS.has(extname(nome).toLowerCase()));
let copiados = 0;
let pulados = 0;

for (const nome of arquivos) {
  const ext = extname(nome).toLowerCase();
  const alvo = join(destino, `${idLimpo(nome)}${ext}`);
  const fonte = join(origem, nome);

  // Já está lá com o mesmo tamanho: não mexe.
  if (existsSync(alvo) && statSync(alvo).size === statSync(fonte).size) {
    pulados += 1;
    continue;
  }
  copyFileSync(fonte, alvo);
  copiados += 1;
}

// Com imagem de verdade no acervo, os exemplos só ocupam espaço no bundle.
const exemplos = readdirSync(destino).filter((nome) => nome.startsWith("_exemplo-"));
if (arquivos.length > 0 && exemplos.length > 0) {
  for (const nome of exemplos) unlinkSync(join(destino, nome));
  console.log(`[tapa] ${exemplos.length} slides de exemplo removidos`);
}

console.log(`[tapa] ${copiados} copiados, ${pulados} já estavam lá — ${arquivos.length} imagens no acervo`);
