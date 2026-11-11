-- Renomeia o aplicativo para "DStasks" no banco.
--
-- O nome antigo ("Maju Tasks") só existe como valor padrão da coluna
-- app_settings.app_name e nas linhas que herdaram esse padrão.
-- Executar manualmente no SQL Editor do Supabase. Pode ser executado mais de
-- uma vez sem efeito colateral.

DO $$
BEGIN
  -- A tabela app_settings pode não existir em bancos mais antigos.
  IF to_regclass('public.app_settings') IS NOT NULL THEN
    ALTER TABLE public.app_settings ALTER COLUMN app_name SET DEFAULT 'DStasks';

    UPDATE public.app_settings
       SET app_name = 'DStasks',
           updated_at = now()
     WHERE app_name IN ('Maju Tasks', 'Maju Task Manager', 'DMS Tasks');
  END IF;
END $$;

-- Conferência: deve listar o novo padrão e nenhuma linha com o nome antigo.
SELECT column_default
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'app_settings' AND column_name = 'app_name';

-- O nome exibido para quem pertence a uma empresa vem de tenants.name (nome da
-- empresa) e NÃO é alterado aqui. Para ver se alguma empresa usa o nome antigo:
--   SELECT id, name, slug FROM public.tenants WHERE name ILIKE '%maju%';
-- e, se for o caso, renomear uma delas:
--   UPDATE public.tenants SET name = 'DStasks', updated_at = now() WHERE id = '<id-da-empresa>';
