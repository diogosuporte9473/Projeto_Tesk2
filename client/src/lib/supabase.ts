import { createClient } from "@supabase/supabase-js";

// Em produção (Vercel) as variáveis vêm da integração do Supabase com o prefixo
// NEXT_PUBLIC_; em desenvolvimento local, do .env com o prefixo VITE_.
// Ambas são públicas por natureza (URL do projeto e chave anon).
const env = import.meta.env;
const configuredUrl = (env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const configuredAnonKey = (env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();

if (!configuredUrl || !configuredAnonKey) {
  console.error("[Supabase] URL ou chave anon não configuradas no build: o tempo real ficará desativado.");
}

// createClient lança erro com URL vazia e derrubaria o app inteiro; o Supabase
// no cliente só é usado para tempo real, então caímos em um endereço inerte.
const supabaseUrl = configuredUrl || "https://supabase.invalid";
const supabaseAnonKey = configuredAnonKey || "missing-anon-key";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 20,
    },
    heartbeatIntervalMs: 15000,
    timeout: 30000,
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  }
});
