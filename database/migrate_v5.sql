-- ============================================================
-- database/migrate_v5.sql
-- 1. Columnas de rol en personas (por si no se ejecutó migrate_v4)
-- 2. Backfill: generar código para cuadrantes con codigo NULL
-- 3. Índice en personas para los nuevos campos de rol
-- Ejecutar UNA VEZ sobre la BD existente (no borra datos)
-- ============================================================

-- 1. Columnas de rol en personas
ALTER TABLE personas
  ADD COLUMN IF NOT EXISTS es_lider       BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS es_coordinador BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_personas_lider       ON personas(es_lider);
CREATE INDEX IF NOT EXISTS idx_personas_coordinador ON personas(es_coordinador);

-- 2. Backfill de códigos NULL en cuadrantes existentes
--    Formato: C{id}-{Barrio} o C{id} si no tiene barrio
--    Preserva tildes y capitalización original del barrio
UPDATE cuadrantes
SET codigo = (
  CASE
    -- Si el nombre ya sigue el patrón C\d+ (ej: C1, C2) → usarlo como prefijo
    WHEN nombre ~ '^[Cc]\d+$'
    THEN
      UPPER(nombre) ||
      CASE WHEN barrio IS NOT NULL AND TRIM(barrio) != ''
           THEN '-' || REPLACE(TRIM(barrio), ' ', '_')
           ELSE '' END
    -- Si no → usar C{id} como prefijo
    ELSE
      'C' || id::text ||
      CASE WHEN barrio IS NOT NULL AND TRIM(barrio) != ''
           THEN '-' || REPLACE(TRIM(barrio), ' ', '_')
           ELSE '' END
  END
)
WHERE codigo IS NULL OR TRIM(codigo) = '';

-- 3. Resolver duplicados de código (si los hay) agregando sufijo -id
DO $$
DECLARE
  dup RECORD;
BEGIN
  FOR dup IN
    SELECT codigo, array_agg(id ORDER BY id) AS ids
    FROM cuadrantes
    WHERE codigo IS NOT NULL
    GROUP BY codigo
    HAVING COUNT(*) > 1
  LOOP
    -- Dejar el primero intacto, renombrar los demás
    FOR i IN 2..array_length(dup.ids, 1) LOOP
      UPDATE cuadrantes
      SET codigo = codigo || '-' || dup.ids[i]::text
      WHERE id = dup.ids[i];
    END LOOP;
  END LOOP;
END $$;

-- Resumen de resultado
SELECT
  COUNT(*)                              AS total_cuadrantes,
  COUNT(codigo)                         AS con_codigo,
  COUNT(*) FILTER (WHERE codigo IS NULL) AS sin_codigo,
  COUNT(*) FILTER (WHERE comuna IS NULL) AS sin_comuna
FROM cuadrantes;

SELECT 'Migración v5 completada' AS resultado;
