// ============================================================
// routes/geocodingRoutes.js
// ============================================================
const express = require('express');
const router = express.Router();
const { geocodificar, geocodificarInverso, estadisticasCache } = require('../services/geocodingService');

// GET /api/geocodificar?direccion=Cra50%2345-20&barrio=Laureles
router.get('/', async (req, res, next) => {
  try {
    const { direccion, barrio } = req.query;
    if (!direccion) return res.status(400).json({ error: 'Parámetro "direccion" requerido' });
    const coords = await geocodificar(direccion, barrio || '');
    if (!coords) {
      return res.status(404).json({ error: 'No se encontraron coordenadas para esa dirección' });
    }
    res.json(coords);
  } catch (err) { next(err); }
});

// GET /api/geocodificar/inverso?lat=6.2&lon=-75.5
router.get('/inverso', async (req, res, next) => {
  try {
    const { lat, lon } = req.query;
    if (!lat || !lon) return res.status(400).json({ error: 'Parámetros lat y lon requeridos' });
    const resultado = await geocodificarInverso(parseFloat(lat), parseFloat(lon));
    if (!resultado) return res.status(404).json({ error: 'No se encontró información para esas coordenadas' });
    res.json(resultado);
  } catch (err) { next(err); }
});

// GET /api/geocodificar/cache — estadísticas del caché
router.get('/cache', (req, res) => {
  res.json(estadisticasCache());
});

module.exports = router;
