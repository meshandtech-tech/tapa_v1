/**
 * O perfil do host.
 *
 * Separado de `api.ts` de propósito: aquele arquivo é sobre a PARTIDA, este é
 * sobre a pessoa. São ciclos de vida diferentes — o perfil sobrevive a todas
 * as salas.
 */
import { getSupabase } from "../../lib/supabase";

export interface Profile {
  id: string;
  email: string | null;
  nickname: string | null;
  birth_year: number | null;
}

/** Idade mínima declarada na landing ("16+"). */
export const MIN_AGE = 16;

/** `null` quando a sessão ainda é anônima ou não há perfil. */
export async function fetchMyProfile(): Promise<Profile | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("my_profile");
  if (error) {
    console.error("[tapa] my_profile falhou", error);
    return null;
  }
  return (data as Profile) ?? null;
}

export async function saveMyProfile(patch: {
  nickname?: string;
  birthYear?: number;
}): Promise<Profile | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("upsert_profile", {
    p_nickname: patch.nickname ?? null,
    p_birth_year: patch.birthYear ?? null,
  });
  if (error) {
    console.error("[tapa] upsert_profile falhou", error);
    return null;
  }
  return (data as Profile) ?? null;
}

/**
 * Idade a partir do ano de nascimento.
 *
 * Aproximação por ano, sem mês nem dia — é o suficiente para uma porta de
 * 16+, e guardar data completa seria pedir mais do que o necessário.
 */
export function ageFromBirthYear(birthYear: number | null): number | null {
  if (!birthYear) return null;
  return new Date().getFullYear() - birthYear;
}
