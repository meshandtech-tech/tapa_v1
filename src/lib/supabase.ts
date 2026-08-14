import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase — usado APENAS para canais de Realtime (broadcast).
 * Nenhuma tabela, nenhum login: o PIN é a chave da sala.
 *
 * As duas variáveis são públicas por natureza (a anon key vai para o browser
 * de qualquer jeito). Sem RLS e sem tabela, não há o que vazar.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Sem credenciais, o app cai no transporte local. Nada quebra. */
export const isSupabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  // Um cliente só para o app inteiro: cada createClient abre um websocket.
  client ??= createClient(url, anonKey, {
    auth: { persistSession: false },
    realtime: { params: { eventsPerSecond: 20 } },
  });
  return client;
}
