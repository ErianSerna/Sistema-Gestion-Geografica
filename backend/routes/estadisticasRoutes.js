// ============================================================
// routes/estadisticasRoutes.js
// ============================================================
const express = require('express');
const router  = express.Router();
const { query } = require('../config/db');

// GET /api/estadisticas — resumen general
router.get('/', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*)::int                                            AS total_personas,
        COUNT(*) FILTER (WHERE vota_pacto = true)::int           AS votantes_pacto,
        COUNT(*) FILTER (WHERE vota_pacto = false)::int          AS no_pacto,
        COUNT(DISTINCT NULLIF(TRIM(comuna), ''))::int            AS total_comunas,
        COUNT(DISTINCT NULLIF(TRIM(barrio), ''))::int            AS total_barrios,
        COUNT(*) FILTER (WHERE cuadrante_id IS NULL)::int        AS sin_cuadrante
      FROM personas
    `);
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

// GET /api/estadisticas/por-comuna
// Corregido: COALESCE para evitar nulls, CAST explícito para que el frontend no reciba strings
router.get('/por-comuna', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        COALESCE(NULLIF(TRIM(comuna), ''), '(sin comuna)')  AS comuna,
        COUNT(*)::int                                        AS total,
        COUNT(*) FILTER (WHERE vota_pacto = true)::int       AS pacto,
        COUNT(*) FILTER (WHERE vota_pacto = false)::int      AS no_pacto,
        ROUND(
          COUNT(*) FILTER (WHERE vota_pacto = true)::numeric
          / NULLIF(COUNT(*), 0) * 100, 1
        )                                                    AS pct_pacto
      FROM personas
      GROUP BY COALESCE(NULLIF(TRIM(comuna), ''), '(sin comuna)')
      ORDER BY pacto DESC
    `);
    res.json(result.rows);
  } catch (err) { next(err); }
});

// GET /api/estadisticas/por-barrio
router.get('/por-barrio', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        COALESCE(NULLIF(TRIM(barrio), ''), '(sin barrio)')   AS barrio,
        COALESCE(NULLIF(TRIM(comuna), ''), '(sin comuna)')   AS comuna,
        COUNT(*)::int                                         AS total,
        COUNT(*) FILTER (WHERE vota_pacto = true)::int        AS pacto,
        ROUND(
          COUNT(*) FILTER (WHERE vota_pacto = true)::numeric
          / NULLIF(COUNT(*), 0) * 100, 1
        )                                                     AS pct_pacto
      FROM personas
      GROUP BY
        COALESCE(NULLIF(TRIM(barrio), ''), '(sin barrio)'),
        COALESCE(NULLIF(TRIM(comuna), ''), '(sin comuna)')
      ORDER BY pacto DESC
      LIMIT 100
    `);
    res.json(result.rows);
  } catch (err) { next(err); }
});

// GET /api/estadisticas/por-cuadrante
// Incluye fila especial para personas SIN cuadrante asignado
router.get('/por-cuadrante', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        COALESCE(c.nombre, '(sin cuadrante)')  AS cuadrante,
        COALESCE(c.codigo, '-')                AS codigo,
        COALESCE(c.comuna, '-')                AS comuna,
        COUNT(p.id)::int                       AS total,
        COUNT(p.id) FILTER (WHERE p.vota_pacto = true)::int  AS pacto
      FROM personas p
      LEFT JOIN cuadrantes c ON c.id = p.cuadrante_id
      GROUP BY c.id, c.nombre, c.codigo, c.comuna
      ORDER BY pacto DESC NULLS LAST
    `);
    res.json(result.rows);
  } catch (err) { next(err); }
});

module.exports = router;
