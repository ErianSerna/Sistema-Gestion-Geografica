// ============================================================
// controllers/personaController.js
// Lógica de negocio para CRUD de personas/votantes
// ============================================================

const Persona = require('../models/Persona');
const { validationResult } = require('express-validator');

const personaController = {
  /**
   * GET /api/personas
   * Soporta filtros: ?comuna=X&barrio=Y&vota_pacto=true&cuadrante_id=Z
   */
  async listar(req, res, next) {
    try {
      const filtros = {
        comuna:       req.query.comuna,
        barrio:       req.query.barrio,
        cuadrante_id: req.query.cuadrante_id,
        vota_pacto:   req.query.vota_pacto !== undefined
                        ? req.query.vota_pacto === 'true'
                        : undefined
      };
      // Limpiar filtros vacíos
      Object.keys(filtros).forEach(k => filtros[k] === undefined && delete filtros[k]);

      const personas = await Persona.obtenerTodas(filtros);
      res.json({ data: personas, total: personas.length });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/personas/geojson
   * Para consumir directamente desde Leaflet
   */
  async geojson(req, res, next) {
    try {
      const filtros = {
        comuna:       req.query.comuna      || undefined,
        barrio:       req.query.barrio      || undefined,
        cuadrante_id: req.query.cuadrante_id || undefined,
        vota_pacto:   req.query.vota_pacto !== undefined && req.query.vota_pacto !== ''
                        ? req.query.vota_pacto === 'true'
                        : undefined
      };
      // Eliminar claves con valor undefined para no pasar filtros vacíos al modelo
      Object.keys(filtros).forEach(k => filtros[k] === undefined && delete filtros[k]);

      const geojson = await Persona.obtenerGeoJSON(filtros);
      res.json(geojson);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/personas/:id
   */
  async obtener(req, res, next) {
    try {
      const persona = await Persona.obtenerPorId(req.params.id);
      if (!persona) return res.status(404).json({ error: 'Persona no encontrada' });
      res.json(persona);
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/personas
   * Crea un pin en el mapa y la persona en la BD
   */
  async crear(req, res, next) {
    try {
      const errores = validationResult(req);
      if (!errores.isEmpty()) {
        return res.status(400).json({ errores: errores.array() });
      }

      const persona = await Persona.crear(req.body);
      res.status(201).json({
        mensaje: 'Persona creada exitosamente',
        data: persona
      });
    } catch (err) {
      // Código 23505 = violación de unique constraint (cédula duplicada)
      if (err.code === '23505') {
        return res.status(409).json({
          error: 'Ya existe una persona con esa cédula',
          campo: 'cedula'
        });
      }
      next(err);
    }
  },

  /**
   * PUT /api/personas/:id
   */
  async actualizar(req, res, next) {
    try {
      const errores = validationResult(req);
      if (!errores.isEmpty()) {
        return res.status(400).json({ errores: errores.array() });
      }

      const persona = await Persona.actualizar(req.params.id, req.body);
      if (!persona) return res.status(404).json({ error: 'Persona no encontrada' });
      res.json({ mensaje: 'Persona actualizada', data: persona });
    } catch (err) {
      next(err);
    }
  },

  /**
   * DELETE /api/personas/:id
   */
  async eliminar(req, res, next) {
    try {
      const resultado = await Persona.eliminar(req.params.id);
      if (!resultado) return res.status(404).json({ error: 'Persona no encontrada' });
      res.json({ mensaje: 'Persona eliminada correctamente' });
    } catch (err) {
      next(err);
    }
  }
};

module.exports = personaController;
