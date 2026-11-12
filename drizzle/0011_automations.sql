-- Fase 4 — Automações por quadro.
--
-- Cria:
--   automations      : regras QUANDO → SE → ENTÃO de cada quadro;
--   automation_runs  : histórico de execuções (o que rodou, em qual cartão);
--   notifications    : só se ainda não existir (avisos gerados pelas regras).
--
-- Não altera quadros, listas nem cartões. RLS fica ligado nas três tabelas e
-- sem policy: só o backend (service role) lê e grava, como no restante do app.
-- Executar no SQL Editor do Supabase. Pode ser executada mais de uma vez.

BEGIN;

CREATE TABLE IF NOT EXISTS public.automations (
  id              serial PRIMARY KEY,
  board_id        integer NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  tenant_id       uuid    NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name            text    NOT NULL,
  trigger         jsonb   NOT NULL,
  conditions      jsonb   NOT NULL DEFAULT '[]'::jsonb,
  actions         jsonb   NOT NULL DEFAULT '[]'::jsonb,
  enabled         boolean NOT NULL DEFAULT true,
  created_by      integer REFERENCES public.users(id) ON DELETE SET NULL,
  run_count       integer NOT NULL DEFAULT 0,
  last_run_at     timestamptz,
  last_checked_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS automations_board_idx ON public.automations (board_id);

CREATE TABLE IF NOT EXISTS public.automation_runs (
  id            serial PRIMARY KEY,
  automation_id integer NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  board_id      integer NOT NULL,
  tenant_id     uuid    NOT NULL,
  card_id       integer,
  card_title    text,
  status        text    NOT NULL DEFAULT 'ok',   -- 'ok' | 'error'
  detail        text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS automation_runs_automation_idx ON public.automation_runs (automation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS automation_runs_board_idx ON public.automation_runs (board_id, created_at DESC);

-- Bancos antigos podem ter uma "notifications" de outro formato (sem user_id),
-- que o app nunca usou. Ela é preservada com outro nome, sem apagar dados.
DO $$
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'user_id'
     ) THEN
    ALTER TABLE public.notifications RENAME TO notifications_legacy;
    ALTER INDEX IF EXISTS public.notifications_pkey RENAME TO notifications_legacy_pkey;
    ALTER SEQUENCE IF EXISTS public.notifications_id_seq RENAME TO notifications_legacy_id_seq;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.notifications (
  id               serial PRIMARY KEY,
  user_id          integer NOT NULL,
  tenant_id        uuid    NOT NULL REFERENCES public.tenants(id),
  type             text    NOT NULL,
  related_card_id  integer,
  related_board_id integer,
  title            varchar(255) NOT NULL,
  message          text,
  read             boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications (user_id, read, created_at DESC);

ALTER TABLE public.automations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications   ENABLE ROW LEVEL SECURITY;

COMMIT;

-- Conferência: as três tabelas devem aparecer com rls = true.
SELECT c.relname AS tabela, c.relrowsecurity AS rls
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relname IN ('automations', 'automation_runs', 'notifications')
 ORDER BY 1;
