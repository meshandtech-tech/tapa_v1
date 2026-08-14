/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL do projeto Supabase. Ausente = transporte local (só abas). */
  readonly VITE_SUPABASE_URL?: string;
  /** Chave anon/publishable. Pública por natureza — nunca a service_role. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
