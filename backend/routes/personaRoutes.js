// ============================================================
// routes/personaRoutes.js
// ============================================================
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/personaController');
const { body } = require('express-validator');

const validarPersona = [
  body('nombre').trim().notEmpty().withMessage('Nombre requerido'),
  body('cedula').trim().notEmpty().withMessage('Cédula requerida'),
  body('latitud').isFloat({ min: -90,  max: 90  }).withMessage('Latitud inválida'),
  body('longitud').isFloat({ min: -180, max: 180 }).withMessage('Longitud inválida'),
];

router.get('/',         ctrl.listar);
router.get('/geojson',  ctrl.geojson);
router.get('/:id',      ctrl.obtener);
router.post('/',        validarPersona, ctrl.crear);
router.put('/:id',      ctrl.actualizar);
router.delete('/:id',   ctrl.eliminar);

module.exports = router;
