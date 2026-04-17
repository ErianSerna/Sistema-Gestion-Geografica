// ============================================================
// routes/cuadranteRoutes.js
// ============================================================
const express   = require('express');
const router    = express.Router();
const Cuadrante = require('../models/Cuadrante');

// GET /api/cuadrantes/barrios — lista de barrios existentes con su color
router.get('/barrios', async (req, res, next) => {
  try {
    const barrios = await Cuadrante.obtenerBarrios();
    res.json(barrios);
  } catch (err) { next(err); }
});

// GET /api/cuadrantes
router.get('/', async (req, res, next) => {
  try {
    const geojson = await Cuadrante.obtenerGeoJSON(req.query.comuna || null);
    res.json(geojson);
  } catch (err) { next(err); }
});

// POST /api/cuadrantes — crear cuadrante individual (dibujado en mapa)
router.post('/', async (req, res, next) => {
  try {
    const { nombre, codigo, comuna, barrio, descripcion, color, geometry } = req.body;
    if (!nombre?.trim())
      return res.status(400).json({ error: 'El nombre del cuadrante es requerido' });
    if (!geometry)
      return res.status(400).json({ error: 'geometry GeoJSON requerido' });

    const cuadrante = await Cuadrante.crear({
      nombre: nombre.trim(), codigo, comuna, barrio, descripcion, color,
      geojson_geom: geometry
    });
    res.status(201).json(cuadrante);
  } catch (err) { next(err); }
});

// POST /api/cuadrantes/importar-geojson — importar GeoJSON de QGIS
// Body: { features: [...], nombreArchivo: "La_Esperanza", colorBase: "#2563EB" }
router.post('/importar-geojson', async (req, res, next) => {
  try {
    const { features, nombreArchivo, colorBase } = req.body;

    if (!Array.isArray(features) || features.length === 0)
      return res.status(400).json({ error: 'Se requiere un array "features" no vacío' });

    const resultado = await Cuadrante.importarGeoJSON({
      features,
      nombreArchivo: nombreArchivo || 'importado',
      colorBase: colorBase || null,
    });

    res.status(201).json({
      mensaje: `${resultado.exitosos.length} cuadrantes importados de ${resultado.total}`,
      ...resultado,
    });
  } catch (err) { next(err); }
});

// POST /api/cuadrantes/reasignar
router.post('/reasignar', async (req, res, next) => {
  try {
    const n = await Cuadrante.reasignarTodasPersonas();
    res.json({ mensaje: `${n} personas reasignadas espacialmente` });
  } catch (err) { next(err); }
});

// GET /api/cuadrantes/detectar?lat=&lon=
router.get('/detectar', async (req, res, next) => {
  try {
    const { lat, lon } = req.query;
    if (!lat || !lon)
      return res.status(400).json({ error: 'lat y lon requeridos' });
    const cuadrante = await Cuadrante.detectarCuadrante(parseFloat(lat), parseFloat(lon));
    res.json(cuadrante || { mensaje: 'Fuera de todos los cuadrantes' });
  } catch (err) { next(err); }
});

// PATCH /api/cuadrantes/:id — editar nombre/descripción
router.patch('/:id', async (req, res, next) => {
  try {
    const { nombre, descripcion } = req.body;
    if (!nombre?.trim())
      return res.status(400).json({ error: 'El nombre es requerido' });
    const cuadrante = await Cuadrante.editarInfo(req.params.id, { nombre, descripcion });
    if (!cuadrante) return res.status(404).json({ error: 'Cuadrante no encontrado' });
    res.json(cuadrante);
  } catch (err) { next(err); }
});

// PATCH /api/cuadrantes/:id/barrio — cambiar barrio (actualiza color automáticamente)
router.patch('/:id/barrio', async (req, res, next) => {
  try {
    const { barrio } = req.body;
    const cuadrante = await Cuadrante.actualizarBarrio(req.params.id, barrio);
    if (!cuadrante) return res.status(404).json({ error: 'Cuadrante no encontrado' });
    res.json(cuadrante);
  } catch (err) { next(err); }
});

// PATCH /api/cuadrantes/barrio/:barrio/color — cambiar color de TODO un barrio de una vez
router.patch('/barrio/:barrio/color', async (req, res, next) => {
  try {
    const { color } = req.body;
    if (!color || !/^#[0-9A-Fa-f]{3,8}$/.test(color))
      return res.status(400).json({ error: 'Color hex inválido (ej: #2563EB)' });
    const n = await Cuadrante.actualizarColorBarrio(req.params.barrio, color);
    res.json({ mensaje: `${n} cuadrantes de "${req.params.barrio}" actualizados`, actualizados: n });
  } catch (err) { next(err); }
});

// PATCH /api/cuadrantes/:id/color — cambiar color de un cuadrante individual
router.patch('/:id/color', async (req, res, next) => {
  try {
    const { color } = req.body;
    if (!color || !/^#[0-9A-Fa-f]{3,8}$/.test(color))
      return res.status(400).json({ error: 'Color hex inválido (ej: #2563EB)' });
    const cuadrante = await Cuadrante.actualizarColor(req.params.id, color);
    if (!cuadrante) return res.status(404).json({ error: 'Cuadrante no encontrado' });
    res.json(cuadrante);
  } catch (err) { next(err); }
});

// PUT /api/cuadrantes/:id/geometria
router.put('/:id/geometria', async (req, res, next) => {
  try {
    const { geometry } = req.body;
    if (!geometry) return res.status(400).json({ error: 'geometry requerido' });
    const cuadrante = await Cuadrante.actualizarGeometria(req.params.id, geometry);
    if (!cuadrante) return res.status(404).json({ error: 'Cuadrante no encontrado' });
    res.json(cuadrante);
  } catch (err) { next(err); }
});

// DELETE /api/cuadrantes/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const r = await Cuadrante.eliminar(req.params.id);
    if (!r) return res.status(404).json({ error: 'Cuadrante no encontrado' });
    res.json({ mensaje: 'Cuadrante eliminado' });
  } catch (err) { next(err); }
});

module.exports = router;
