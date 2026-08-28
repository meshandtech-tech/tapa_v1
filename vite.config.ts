import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // O teste ao vivo fala com o Supabase de verdade e demora minutos: roda
    // sob demanda (`npm run test:live`), nunca no suite de sempre.
    exclude: ["**/node_modules/**", "**/dist/**", "src/**/*.live.test.ts"],
  },
});
