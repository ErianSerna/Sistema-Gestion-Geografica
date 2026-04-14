-- ============================================================
-- database/schema.sql
-- Esquema PostgreSQL + PostGIS para Medellín Electoral
-- v2: codigo y comuna opcionales, cuadrante simplificado
-- ============================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- ── Tabla: comunas ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comunas (
  id          SERIAL PRIMARY KEY,
  nombre      VARCHAR(100) NOT NULL,
  numero      INTEGER UNIQUE,
  descripcion TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Tabla: cuadrantes ───────────────────────────────────────
-- codigo y comuna son opcionales; el sistema genera codigo auto si no se provee
CREATE TABLE IF NOT EXISTS cuadrantes (
  id          SERIAL PRIMARY KEY,
  nombre      VARCHAR(150) NOT NULL,
  codigo      VARCHAR(20),          -- opcional, puede ser NULL o auto-generado
  comuna      VARCHAR(100),         -- opcional
  descripcion TEXT,
  geom        GEOMETRY(GEOMETRY, 4326) NOT NULL,
  color       VARCHAR(9) DEFAULT '#2563EB',
  barrio      VARCHAR(150),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Índice espacial GIST (crítico para ST_Contains)
CREATE INDEX IF NOT EXISTS idx_cuadrantes_geom   ON cuadrantes USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_cuadrantes_comuna ON cuadrantes(comuna);

-- ── Tabla: personas ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS personas (
  id            SERIAL PRIMARY KEY,
  nombre        VARCHAR(200) NOT NULL,
  cedula        VARCHAR(20) NOT NULL UNIQUE,
  telefono      VARCHAR(20),
  direccion     VARCHAR(300),
  comuna        VARCHAR(100),
  barrio        VARCHAR(100),
  latitud       DECIMAL(10, 7),
  longitud      DECIMAL(10, 7),
  vota_pacto    BOOLEAN DEFAULT false,
  geom          GEOMETRY(POINT, 4326),
  cuadrante_id  INTEGER REFERENCES cuadrantes(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_personas_geom       ON personas USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_personas_cedula     ON personas(cedula);
CREATE INDEX IF NOT EXISTS idx_personas_comuna     ON personas(comuna);
CREATE INDEX IF NOT EXISTS idx_personas_barrio     ON personas(barrio);
CREATE INDEX IF NOT EXISTS idx_personas_vota_pacto ON personas(vota_pacto);
CREATE INDEX IF NOT EXISTS idx_personas_cuadrante  ON personas(cuadrante_id);

-- ── Triggers updated_at ──────────────────────────────────────
CREATE OR REPLACE FUNCTION actualizar_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_personas_updated_at   ON personas;
CREATE TRIGGER trg_personas_updated_at
  BEFORE UPDATE ON personas FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at();

DROP TRIGGER IF EXISTS trg_cuadrantes_updated_at ON cuadrantes;
CREATE TRIGGER trg_cuadrantes_updated_at
  BEFORE UPDATE ON cuadrantes FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at();

-- ── Vistas de estadísticas ───────────────────────────────────
CREATE OR REPLACE VIEW v_estadisticas_cuadrante AS
SELECT
  c.id, c.nombre, c.codigo, c.comuna,
  COUNT(p.id)                                        AS total_personas,
  COUNT(p.id) FILTER (WHERE p.vota_pacto = true)     AS votantes_pacto,
  COUNT(p.id) FILTER (WHERE p.vota_pacto = false)    AS no_pacto,
  ROUND(
    COUNT(p.id) FILTER (WHERE p.vota_pacto = true)::numeric
    / NULLIF(COUNT(p.id), 0) * 100, 1
  ) AS pct_pacto
FROM cuadrantes c
LEFT JOIN personas p ON p.cuadrante_id = c.id
GROUP BY c.id, c.nombre, c.codigo, c.comuna;

CREATE OR REPLACE VIEW v_estadisticas_barrio AS
SELECT
  barrio, comuna,
  COUNT(*)                                          AS total,
  COUNT(*) FILTER (WHERE vota_pacto = true)         AS pacto,
  ROUND(COUNT(*) FILTER (WHERE vota_pacto = true)::numeric / COUNT(*) * 100, 1) AS pct
FROM personas WHERE barrio IS NOT NULL
GROUP BY barrio, comuna ORDER BY pacto DESC;

-- ── Datos iniciales: Comunas ─────────────────────────────────
INSERT INTO comunas (nombre, numero) VALUES
  ('Popular',1),('Santa Cruz',2),('Manrique',3),('Aranjuez',4),
  ('Castilla',5),('Doce de Octubre',6),('Robledo',7),('Villa Hermosa',8),
  ('Buenos Aires',9),('La Candelaria',10),('Laureles',11),('La América',12),
  ('San Javier',13),('El Poblado',14),('Guayabal',15),('Belén',16)
ON CONFLICT (numero) DO NOTHING;
