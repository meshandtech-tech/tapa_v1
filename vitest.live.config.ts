/**
 * Configuração do teste ao vivo.
 *
 * Separado do `npm test` de propósito: este fala com o Supabase de verdade,
 * gasta cota de cadastro anônimo e demora minutos. O suite normal tem de
 * continuar rodando em menos de dois segundos, sem rede.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.live.test.ts"],
    // Uma partida por vez: dez sessões anônimas simultâneas já são a carga.
    fileParallelism: false,
    testTimeout: 600000,
    hookTimeout: 180000,
  },
});
