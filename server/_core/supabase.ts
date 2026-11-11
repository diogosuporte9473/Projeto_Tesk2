import { createClient } from "@supabase/supabase-js";
import { ENV } from "./env.js";

if (!ENV.supabaseUrl) {
  console.error("[Supabase] CRITICAL: SUPABASE_URL is missing!");
}

if (!ENV.supabaseAnonKey) {
  console.error("[Supabase] CRITICAL: SUPABASE_ANON_KEY is missing!");
}

const serverKey =
  ENV.supabaseServiceRoleKey?.trim() ||
  ENV.supabaseAnonKey?.trim() ||
  "";

if (!serverKey) {
  console.error("[Supabase] CRITICAL: missing SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY!");
}

if (!ENV.supabaseServiceRoleKey?.trim()) {
  console.warn(
    "[Supabase] WARNING: SUPABASE_SERVICE_ROLE_KEY is not set. Using SUPABASE_ANON_KEY (may break with RLS enabled)."
  );
}

export const supabase = createClient(
  ENV.supabaseUrl.trim(),
  serverKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      }
    }
  }
);

/**
 * Cliente descartável para login/cadastro (signInWithPassword / signUp).
 *
 * NUNCA faça login no cliente `supabase` acima: o supabase-js guarda a sessão
 * em memória e passa a enviar o JWT do usuário em todas as consultas seguintes
 * daquela instância do servidor, no lugar da service role key. Com RLS ligado
 * isso faz as consultas voltarem vazias (e, sem RLS, faria um usuário "herdar"
 * a identidade do último que fez login). Um cliente novo por chamada isola a
 * sessão de cada login.
 */
export function createAuthClient() {
  return createClient(ENV.supabaseUrl.trim(), serverKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
