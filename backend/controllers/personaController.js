// ============================================================
// controllers/personaController.js
// ============================================================

const Persona = require('../models/Persona');
const { validationResult } = require('express-validator');

const personaController = {
  async listar(req, res, next) {
    try {
      const filtros = {
        comuna:       req.query.comuna       || undefined,
        barrio:       req.query.barrio       || undefined,
        cuadrante_id: req.query.cuadrante_id || undefined,
        cedula:       req.query.cedula       || undefined,
      };
      Object.keys(filtros).forEach(k => filtros[k] === undefined && delete filtros[k]);
      const personas = await Persona.obtenerTodas(filtros);
      res.json({ data: personas, total: personas.length });
    } catch (err) { next(err); }
  },

  async geojson(req, res, next) {
    try {
      const filtros = {
        comuna:       req.query.comuna       || undefined,
        barrio:       req.query.barrio       || undefined,
        cuadrante_id: req.query.cuadrante_id || undefined,
        cedula:       req.query.cedula       || undefined,
      };
      Object.keys(filtros).forEach(k => filtros[k] === undefined && delete filtros[k]);
      const geojson = await Persona.obtenerGeoJSON(filtros);
      res.json(geojson);
    } catch (err) { next(err); }
  },

  async obtener(req, res, next) {
    try {
      const persona = await Persona.obtenerPorId(req.params.id);
      if (!persona) return res.status(404).json({ error: 'Persona no encontrada' });
      res.json(persona);
    } catch (err) { next(err); }
  },

  async crear(req, res, next) {
    try {
      const errores = validationResult(req);
      if (!errores.isEmpty()) return res.status(400).json({ errores: errores.array() });
      const persona = await Persona.crear(req.body);
      res.status(201).json({ mensaje: 'Persona creada exitosamente', data: persona });
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: 'Ya existe una persona con esa cédula', campo: 'cedula' });
      }
      next(err);
    }
  },

  async actualizar(req, res, next) {
    try {
      const errores = validationResult(req);
      if (!errores.isEmpty()) return res.status(400).json({ errores: errores.array() });
      const persona = await Persona.actualizar(req.params.id, req.body);
      if (!persona) return res.status(404).json({ error: 'Persona no encontrada' });
      res.json({ mensaje: 'Persona actualizada', data: persona });
    } catch (err) { next(err); }
  },

  async eliminar(req, res, next) {
    try {
      const resultado = await Persona.eliminar(req.params.id);
      if (!resultado) return res.status(404).json({ error: 'Persona no encontrada' });
      res.json({ mensaje: 'Persona eliminada correctamente' });
    } catch (err) { next(err); }
  }
};

module.exports = personaController;
