-- ============================================================
-- database/migrate_v5.sql
-- 1. Columnas de rol en personas (por si no se ejecutó migrate_v4)
-- ============================================================

-- 1. Columnas de rol en personas
ALTER TABLE personas
  ADD COLUMN IF NOT EXISTS es_lider       BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS es_coordinador BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_personas_lider       ON personas(es_lider);
CREATE INDEX IF NOT EXISTS idx_personas_coordinador ON personas(es_coordinador);
