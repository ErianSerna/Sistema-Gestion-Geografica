// ============================================================
// controllers/excelController.js
// Manejo de importación y exportación de Excel
// ============================================================

const multer = require('multer');
const excelService = require('../services/excelService');
const Persona = require('../models/Persona');

// Multer en memoria (sin guardar el archivo en disco)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB máximo
  fileFilter: (req, file, cb) => {
    const tiposPermitidos = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/octet-stream'
    ];
    const extsPermitidas = /\.(xlsx|xls)$/i;

    if (tiposPermitidos.includes(file.mimetype) || extsPermitidas.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos Excel (.xlsx, .xls)'));
    }
  }
});

const excelController = {
  /**
   * POST /api/excel/importar
   * Sube Excel y crea pines en el mapa automáticamente
   */
  async importar(req, res, next) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No se envió ningún archivo' });
      }

      console.log(`[Excel] Importando: ${req.file.originalname} (${req.file.size} bytes)`);

      const resultado = await excelService.importarDesdeExcel(req.file.buffer);

      res.json({
        mensaje: `Importación completada: ${resultado.exitosos} registros procesados`,
        ...resultado
      });
    } catch (err) {
      if (err.message.includes('Excel')) {
        return res.status(400).json({ error: err.message });
      }
      next(err);
    }
  },

  /**
   * GET /api/excel/exportar
   * Descarga Excel con todos los datos actuales de la BD
   */
  async exportar(req, res, next) {
    try {
      const filtros = {
        comuna:     req.query.comuna,
        barrio:     req.query.barrio,
        vota_pacto: req.query.vota_pacto !== undefined
                      ? req.query.vota_pacto === 'true'
                      : undefined
      };
      Object.keys(filtros).forEach(k => filtros[k] === undefined && delete filtros[k]);

      const personas = await Persona.obtenerTodas(filtros);
      const buffer = excelService.exportarAExcel(personas);

      const fecha = new Date().toISOString().slice(0, 10);
      const nombreArchivo = `votantes_medellin_${fecha}.xlsx`;

      res.setHeader('Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/excel/plantilla
   * Descarga plantilla vacía para llenar e importar
   */
  async plantilla(req, res, next) {
    try {
      const buffer = excelService.generarPlantilla();
      res.setHeader('Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition',
        'attachment; filename="plantilla_votantes.xlsx"');
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  },

  // Exponer el middleware de multer para las rutas
  uploadMiddleware: upload.single('archivo')
};

module.exports = excelController;
