// ============================================================
// routes/estadisticasRoutes.js
// ============================================================
const express  = require('express');
const router   = express.Router();
const { query } = require('../config/db');

// GET /api/estadisticas — resumen general
router.get('/', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*)::int                                          AS total_personas,
        COUNT(DISTINCT NULLIF(TRIM(comuna), ''))::int          AS total_comunas,
        COUNT(DISTINCT NULLIF(TRIM(barrio), ''))::int          AS total_barrios,
        COUNT(*) FILTER (WHERE cuadrante_id IS NULL)::int      AS sin_cuadrante
      FROM personas
    `);
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

// GET /api/estadisticas/por-comuna
router.get('/por-comuna', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        COALESCE(NULLIF(TRIM(comuna), ''), '(sin comuna)') AS comuna,
        COUNT(*)::int                                       AS total
      FROM personas
      GROUP BY COALESCE(NULLIF(TRIM(comuna), ''), '(sin comuna)')
      ORDER BY total DESC
    `);
    res.json(result.rows);
  } catch (err) { next(err); }
});

// GET /api/estadisticas/por-barrio
router.get('/por-barrio', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        COALESCE(NULLIF(TRIM(barrio), ''), '(sin barrio)') AS barrio,
        COALESCE(NULLIF(TRIM(comuna), ''), '(sin comuna)') AS comuna,
        COUNT(*)::int                                       AS total
      FROM personas
      GROUP BY
        COALESCE(NULLIF(TRIM(barrio), ''), '(sin barrio)'),
        COALESCE(NULLIF(TRIM(comuna), ''), '(sin comuna)')
      ORDER BY total DESC
      LIMIT 100
    `);
    res.json(result.rows);
  } catch (err) { next(err); }
});

// GET /api/estadisticas/por-cuadrante
router.get('/por-cuadrante', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        COALESCE(c.nombre, '(sin cuadrante)') AS cuadrante,
        COALESCE(c.codigo, '-')               AS codigo,
        COALESCE(c.comuna, '-')               AS comuna,
        COUNT(p.id)::int                      AS total
      FROM personas p
      LEFT JOIN cuadrantes c ON c.id = p.cuadrante_id
      GROUP BY c.id, c.nombre, c.codigo, c.comuna
      ORDER BY total DESC NULLS LAST
    `);
    res.json(result.rows);
  } catch (err) { next(err); }
});

// GET /api/estadisticas/cuadrantes-por-comuna
router.get('/cuadrantes-por-comuna', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        COALESCE(NULLIF(TRIM(comuna), ''), '(sin comuna)') AS comuna,
        COUNT(*)::int AS total_cuadrantes
      FROM cuadrantes
      GROUP BY COALESCE(NULLIF(TRIM(comuna), ''), '(sin comuna)')
      ORDER BY total_cuadrantes DESC
    `);
    res.json(result.rows);
  } catch (err) { next(err); }
});

// GET /api/estadisticas/cuadrantes-por-barrio
router.get('/cuadrantes-por-barrio', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        COALESCE(NULLIF(TRIM(barrio), ''), '(sin barrio)') AS barrio,
        COALESCE(NULLIF(TRIM(comuna), ''), '(sin comuna)') AS comuna,
        COUNT(*)::int AS total_cuadrantes
      FROM cuadrantes
      GROUP BY
        COALESCE(NULLIF(TRIM(barrio), ''), '(sin barrio)'),
        COALESCE(NULLIF(TRIM(comuna), ''), '(sin comuna)')
      ORDER BY total_cuadrantes DESC
    `);
    res.json(result.rows);
  } catch (err) { next(err); }
});

module.exports = router;
