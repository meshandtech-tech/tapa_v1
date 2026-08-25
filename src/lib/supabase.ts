import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase.
 *
 * Deixou de ser "só um relay de mensagens". Agora o Postgres é a AUTORIDADE da
 * partida: o celular do host virou um cliente como os outros, com permissão de
 * mandar — não um servidor que, ao dormir, levava a festa junto.
 *
 * A anon key é pública por natureza (vai para o browser de qualquer jeito). O
 * que protege a sala é RLS, não o segredo da chave.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  // Um cliente só para o app inteiro: cada createClient abre um websocket.
  client ??= createClient(url, anonKey, {
    auth: {
      // A sessão PRECISA sobreviver ao F5 — é ela que devolve a pessoa para a
      // própria partida. Guardar a sessão é literalmente a correção do bug de
      // "jogador não consegue voltar".
      persistSession: true,
      autoRefreshToken: true,
      storageKey: "tapa-auth",
    },
    realtime: {
      // Baixo de propósito. O que trafega agora são linhas pequenas (fase da
      // sala, progresso, roster), não o estado inteiro da partida — não há
      // mais rajada a acomodar.
      params: { eventsPerSecond: 10 },
    },
  });
  return client;
}

/** Promessa única: dez chamadas simultâneas no mount não viram dez sessões. */
let signingIn: Promise<string | null> | null = null;

/**
 * Identidade anônima e DURÁVEL deste aparelho.
 *
 * Antes a identidade era um `crypto.randomUUID()` criado a cada montagem da
 * tela, então recarregar a página fazia da pessoa uma estranha e o reducer a
 * recusava com "a partida já começou". O uid da sessão anônima sobrevive ao
 * F5, à troca de rede e ao celular bloqueando.
 */
export async function ensureAnonSession(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  signingIn ??= (async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user?.id) return data.session.user.id;

    const { data: created, error } = await supabase.auth.signInAnonymously();
    if (error) {
      console.error("[tapa] sessão anônima falhou", error);
      return null;
    }
    return created.user?.id ?? null;
  })();

  const id = await signingIn;
  // Falhou: deixa tentar de novo na próxima chamada em vez de cachear o erro.
  if (!id) signingIn = null;
  return id;
}


/**
 * Promove a sessão anônima a conta Google, MANTENDO o mesmo uid.
 *
 * `linkIdentity` e não `signInWithOAuth`: o segundo criaria um usuário novo,
 * com uid novo. Como `players.user_id` guarda o uid da sessão anônima, o host
 * voltaria da tela do Google sem ser reconhecido pelo `join_room` — e perderia
 * o comando da própria sala sem nenhum erro visível. É a diferença entre
 * "logou" e "logou e continua sendo quem era".
 *
 * Se a sessão JÁ for permanente (a pessoa voltou depois), `linkIdentity` falha
 * porque a identidade já está ligada; aí não há o que fazer e devolvemos ok.
 */
export async function linkGoogleAccount(): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: "supabase_nao_configurado" };

  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) return { error: "sem_sessao" };

  // Já tem Google ligado: nada a fazer.
  if (user.identities?.some((identity) => identity.provider === "google")) {
    return { error: null };
  }

  const { error } = await supabase.auth.linkIdentity({
    provider: "google",
    options: { redirectTo: window.location.href },
  });
  return { error: error?.message ?? null };
}

/** A sessão atual já é uma conta de verdade, ou ainda é anônima? */
export async function hasPermanentAccount(): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  const { data } = await supabase.auth.getSession();
  return !!data.session?.user?.identities?.some(
    (identity) => identity.provider !== "anonymous",
  );
}
