// ============================================================
// server.js — Servidor principal Medellín Electoral
// ============================================================

require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const morgan   = require('morgan');
const rateLimit = require('express-rate-limit');
const path     = require('path');
const fs       = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Seguridad y logging ─────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan('combined'));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  methods: ['GET','POST','PUT','DELETE','PATCH'],
  allowedHeaders: ['Content-Type','Authorization'],
}));

// Rate limiting generoso para uso interno (300 req / 15 min)
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { error: 'Demasiadas solicitudes, espera un momento.' },
}));

// ── Body parsers ─────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── KML estáticos — servir carpeta /kml/ del frontend ───────
// El frontend pone sus KML base en frontend/public/kml/
// El backend los sirve en /kml/ y también expone el listado vía API
const KML_DIR = path.join(__dirname, '../frontend/public/kml');
if (!fs.existsSync(KML_DIR)) fs.mkdirSync(KML_DIR, { recursive: true });

// GET /api/kml — devuelve lista de archivos .kml disponibles
app.get('/api/kml', (req, res) => {
  try {
    const archivos = fs.readdirSync(KML_DIR)
      .filter(f => f.toLowerCase().endsWith('.kml'))
      .map(f => ({ nombre: f.replace(/\.kml$/i, ''), archivo: f, url: `/kml/${f}` }));
    res.json(archivos);
  } catch (err) {
    res.json([]); // devolver lista vacía si falla, nunca 500
  }
});

// Servir archivos KML estáticos
app.use('/kml', express.static(KML_DIR));

// ── Rutas API ─────────────────────────────────────────────────
app.use('/api/personas',     require('./routes/personaRoutes'));
app.use('/api/comunas',      require('./routes/comunaRoutes'));
app.use('/api/cuadrantes',   require('./routes/cuadranteRoutes'));
app.use('/api/excel',        require('./routes/excelRoutes'));
app.use('/api/geocodificar', require('./routes/geocodingRoutes'));
app.use('/api/estadisticas', require('./routes/estadisticasRoutes'));

// ── Frontend en producción ───────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
  });
}

// ── Health check ─────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date() }));

// ── Manejador de errores global ──────────────────────────────
// Captura CUALQUIER error que llegue via next(err) sin romper el proceso
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('[ERROR]', req.method, req.path, '→', err.message);
  if (process.env.NODE_ENV === 'development') console.error(err.stack);

  // No enviar respuesta si ya se inició el streaming
  if (res.headersSent) return;

  const status = typeof err.status === 'number' ? err.status : 500;
  res.status(status).json({
    error:  err.message || 'Error interno del servidor',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ── Capturar errores no controlados — evita crash total ──────
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err.message);
  // NO hacer process.exit() — el servidor sigue vivo
});

app.listen(PORT, () => {
  console.log(`🗺️  Medellín Electoral corriendo en puerto ${PORT} (${process.env.NODE_ENV || 'development'})`);
});

module.exports = app;
