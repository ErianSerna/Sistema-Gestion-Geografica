// ============================================================
// routes/excelRoutes.js
// ============================================================
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/excelController');

router.post('/importar', ctrl.uploadMiddleware, ctrl.importar);
router.get('/exportar',  ctrl.exportar);
router.get('/plantilla', ctrl.plantilla);

module.exports = router;

// ============================================================
// Guardar como routes/cuadranteRoutes.js (copiar por separado)
// ============================================================
