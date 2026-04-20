// ============================================================
// routes/personaRoutes.js
// IMPORTANTE: rutas con segmento fijo (/:id/rol, /:id/cuadrante)
// deben ir ANTES de router.delete('/:id') para que Express no
// las intercepte como si fueran el id.
// ============================================================
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/personaController');
const { body } = require('express-validator');
const { query } = require('../config/db');

const validarPersona = [
  body('nombre').trim().notEmpty().withMessage('Nombre requerido'),
  body('cedula').trim().notEmpty().withMessage('Cédula requerida'),
  body('latitud').isFloat({ min: -90,  max: 90  }).withMessage('Latitud inválida'),
  body('longitud').isFloat({ min: -180, max: 180 }).withMessage('Longitud inválida'),
];

// ── Rutas con segmento fijo — DEBEN ir antes de /:id ─────────

// PATCH /api/personas/:id/rol — marcar como líder o coordinador
router.patch('/:id/rol', async (req, res, next) => {
  try {
    const { es_lider, es_coordinador } = req.body;
    const campos = [];
    const params = [];
    let idx = 1;
    if (es_lider       !== undefined) { campos.push(`es_lider = $${idx++}`);       params.push(!!es_lider); }
    if (es_coordinador !== undefined) { campos.push(`es_coordinador = $${idx++}`); params.push(!!es_coordinador); }
    if (!campos.length) return res.status(400).json({ error: 'Nada que actualizar' });
    params.push(req.params.id);
    const result = await query(
      `UPDATE personas SET ${campos.join(', ')}, updated_at = NOW()
       WHERE id = $${idx} RETURNING id, es_lider, es_coordinador`,
      params
    );
    if (!result.rows.length) return res.status(404).json({ error: 'No encontrado' });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/personas/:id/cuadrante — asignación manual de cuadrante
router.patch('/:id/cuadrante', async (req, res, next) => {
  try {
    const { cuadrante_id } = req.body;
    const result = await query(
      `UPDATE personas SET cuadrante_id = $1, updated_at = NOW()
       WHERE id = $2 RETURNING id, cuadrante_id`,
      [cuadrante_id || null, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'No encontrado' });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

// ── Rutas estándar ────────────────────────────────────────────
router.get('/',        ctrl.listar);
router.get('/geojson', ctrl.geojson);
router.get('/:id',     ctrl.obtener);
router.post('/',       validarPersona, ctrl.crear);
router.put('/:id',     ctrl.actualizar);
router.delete('/:id',  ctrl.eliminar);

module.exports = router;
