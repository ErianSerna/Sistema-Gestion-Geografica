// ============================================================
// routes/comunaRoutes.js
// Rutas para listar comunas de Medellín (tabla de referencia)
// ============================================================

const express = require('express');
const router  = express.Router();
const { query } = require('../config/db');

/**
 * GET /api/comunas
 * Lista todas las comunas registradas en la BD.
 * Se usa en los selectores del frontend (PersonaForm, filtros de tabla).
 */
router.get('/', async (req, res, next) => {
  try {
    const result = await query(
      'SELECT id, nombre, numero FROM comunas ORDER BY numero ASC'
    );
    res.json({ data: result.rows, total: result.rows.length });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/comunas/:nombre/cuadrantes
 * Devuelve los cuadrantes que pertenecen a una comuna específica.
 * Útil para filtrar el mapa por comuna y luego por cuadrante.
 */
router.get('/:nombre/cuadrantes', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, nombre, codigo, descripcion
       FROM cuadrantes
       WHERE LOWER(comuna) = LOWER($1)
       ORDER BY codigo ASC`,
      [req.params.nombre]
    );
    res.json({ data: result.rows, total: result.rows.length });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/comunas/:nombre/stats
 * Estadísticas rápidas de una comuna: total personas y votantes Pacto.
 */
router.get('/:nombre/stats', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT
         comuna,
         COUNT(*)                                         AS total_personas,
         COUNT(*) FILTER (WHERE vota_pacto = true)        AS votantes_pacto,
         COUNT(*) FILTER (WHERE vota_pacto = false)       AS no_pacto,
         ROUND(
           COUNT(*) FILTER (WHERE vota_pacto = true)::numeric
           / NULLIF(COUNT(*), 0) * 100, 1
         )                                               AS pct_pacto
       FROM personas
       WHERE LOWER(comuna) = LOWER($1)
       GROUP BY comuna`,
      [req.params.nombre]
    );
    if (result.rows.length === 0) {
      return res.json({
        comuna: req.params.nombre,
        total_personas: 0,
        votantes_pacto: 0,
        no_pacto: 0,
        pct_pacto: 0
      });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
