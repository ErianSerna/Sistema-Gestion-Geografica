-- ============================================================
-- database/migrate_v3.sql
-- Soporte para MultiPolygon y color por cuadrante
-- Ejecutar UNA VEZ sobre la BD existente (no borra datos)
-- ============================================================

-- 1. Cambiar tipo de geom de POLYGON a GEOMETRY genérico
--    para soportar Polygon Y MultiPolygon desde QGIS
ALTER TABLE cuadrantes
  ALTER COLUMN geom TYPE GEOMETRY(GEOMETRY, 4326)
  USING ST_SetSRID(geom::geometry, 4326);

-- 2. Agregar columna color (hex, ej: #2563EB)
ALTER TABLE cuadrantes
  ADD COLUMN IF NOT EXISTS color VARCHAR(9) DEFAULT '#2563EB';

-- 3. Agregar columna barrio (origen del GeoJSON importado)
ALTER TABLE cuadrantes
  ADD COLUMN IF NOT EXISTS barrio VARCHAR(150);

-- 4. Actualizar índice espacial (por si acaso)
DROP INDEX IF EXISTS idx_cuadrantes_geom;
CREATE INDEX idx_cuadrantes_geom ON cuadrantes USING GIST(geom);

SELECT 'Migración v3 completada (MultiPolygon + color + barrio)' AS resultado;
