-- Desativação de usuários.
--
-- Um usuário com histórico (auditoria, cartões, comentários) não pode ser
-- excluído sem apagar esse histórico. Em vez disso a conta é desativada:
-- não entra mais no app, e os registros continuam.
--
-- Cria:
--   users.disabled_at : data em que a conta foi desativada (nulo = ativa).
-- Repara:
--   vínculos em user_tenants que faltam para usuários com empresa válida.
--
-- Não apaga nada. Executar no SQL Editor do Supabase. Pode rodar mais de uma vez.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS disabled_at timestamptz;

-- O reparo dos vínculos é opcional: se falhar, a coluna acima continua criada.
DO $$
BEGIN
  INSERT INTO public.user_tenants (user_id, tenant_id, role)
  SELECT u.id, u.tenant_id, CASE WHEN u.role::text = 'user' THEN 'member' ELSE 'admin' END
    FROM public.users u
   WHERE u.tenant_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.tenants t WHERE t.id::text = u.tenant_id::text)
     AND NOT EXISTS (
           SELECT 1 FROM public.user_tenants ut
            WHERE ut.user_id = u.id AND ut.tenant_id::text = u.tenant_id::text
         );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Reparo de user_tenants ignorado: %', SQLERRM;
END $$;

-- Conferência: todos devem aparecer com situacao = 'ativa' e vinculo = true.
SELECT u.id, u.username, u.role,
       CASE WHEN u.disabled_at IS NULL THEN 'ativa' ELSE 'desativada' END AS situacao,
       EXISTS (SELECT 1 FROM public.user_tenants ut WHERE ut.user_id = u.id) AS vinculo
  FROM public.users u
 ORDER BY u.id;
