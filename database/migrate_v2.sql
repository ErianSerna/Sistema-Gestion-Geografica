-- ============================================================
-- database/migrate_v2.sql
-- Migración para hacer codigo y comuna opcionales en cuadrantes
-- Ejecutar UNA VEZ sobre la BD existente (no borra datos)
-- ============================================================

-- 1. Hacer codigo nullable (era UNIQUE NOT NULL implícitamente)
ALTER TABLE cuadrantes
  ALTER COLUMN codigo DROP NOT NULL;

-- 2. Hacer comuna nullable (si no lo era)
ALTER TABLE cuadrantes
  ALTER COLUMN comuna DROP NOT NULL;

-- 3. Quitar restricción UNIQUE de codigo si existe (permite NULL múltiples)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cuadrantes_codigo_key'
  ) THEN
    ALTER TABLE cuadrantes DROP CONSTRAINT cuadrantes_codigo_key;
  END IF;
END $$;

-- 4. Auto-asignar código a cuadrantes existentes que tengan codigo = ''
UPDATE cuadrantes
SET codigo = 'C' || id
WHERE codigo IS NULL OR codigo = '';

-- 5. Reasignar espacialmente personas a cuadrantes
--    (corrige asignaciones perdidas o incorrectas)
UPDATE personas p
SET cuadrante_id = (
  SELECT c.id FROM cuadrantes c
  WHERE ST_Within(p.geom, c.geom)
  LIMIT 1
),
updated_at = NOW()
WHERE p.geom IS NOT NULL;

SELECT 'Migración v2 completada.' AS resultado;
