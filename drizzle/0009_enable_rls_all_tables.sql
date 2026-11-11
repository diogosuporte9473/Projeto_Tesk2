-- Fecha o acesso direto ao banco pela chave pública (anon).
--
-- Situação encontrada em produção: RLS desligado em todas as tabelas do schema
-- public e a role "anon" com permissão total. Como a anon key vai embutida no
-- frontend, qualquer visitante conseguia ler e apagar tudo pela API REST.
--
-- Depois desta migração só o backend (service role, que ignora RLS) lê e grava.
-- Efeito colateral conhecido: o Realtime do navegador roda como "anon" e deixa
-- de receber eventos até o cliente passar a se autenticar no Supabase.
--
-- Substitui a antiga 0007_harden_users_rls.sql. Pode ser executada mais de uma vez.

BEGIN;

-- 1. RLS em todas as tabelas do schema public (inclusive as que vierem depois
--    precisam do mesmo cuidado: tabela nova = ENABLE ROW LEVEL SECURITY).
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

-- 2. Política aberta que manteria os cartões legíveis por qualquer pessoa.
DROP POLICY IF EXISTS "Permitir leitura para todos" ON public.cards;

-- 3. A policy antiga de "users" permitia ao usuário alterar o próprio role/tenant.
DROP POLICY IF EXISTS user_self_policy ON public.users;

-- 4. Funções usadas pelas policies de isolamento: search_path fixo.
ALTER FUNCTION public.get_current_tenant_id() SET search_path = public;
ALTER FUNCTION public.get_current_user_id() SET search_path = public;

COMMIT;

-- Conferência: nenhuma tabela deve aparecer aqui.
SELECT c.relname AS tabela_sem_rls
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
