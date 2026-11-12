-- Fase 1 — Temas por quadro.
--
-- Cada quadro passa a guardar:
--   theme    : chave do segmento (general, ecommerce, crm, siem, dev);
--   settings : ajustes próprios do quadro em JSON (ex.: nomes das ferramentas
--              de detecção no tema SIEM, marketplaces no E-commerce).
--
-- Não altera nenhum cartão, lista ou quadro existente: os quadros atuais
-- ficam com o tema "general" e continuam funcionando como antes.
-- Executar no SQL Editor do Supabase. Pode ser executada mais de uma vez.

BEGIN;

ALTER TABLE public.boards
  ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Texto + CHECK em vez de ENUM: acrescentar um tema novo no futuro é só
-- recriar esta restrição, sem ALTER TYPE.
ALTER TABLE public.boards DROP CONSTRAINT IF EXISTS boards_theme_check;
ALTER TABLE public.boards
  ADD CONSTRAINT boards_theme_check
  CHECK (theme IN ('general', 'ecommerce', 'crm', 'siem', 'dev'));

COMMIT;

-- Conferência: todos os quadros existentes devem aparecer como "general".
SELECT theme, count(*) AS quadros FROM public.boards GROUP BY theme ORDER BY theme;
