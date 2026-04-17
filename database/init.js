// ============================================================
// database/init.js — Script de inicialización de la BD
// Ejecutar: node database/init.js
// ============================================================

require('dotenv').config({ path: '../backend/.env' });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || 'medellin_electoral',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  ssl: process.env.DB_HOST?.includes('render.com') 
    ? { rejectUnauthorized: false }  // Render requiere SSL
    : false                           // Local sin SSL
});

async function inicializar() {
  const client = await pool.connect();
  try {
    console.log('🔄 Inicializando base de datos...');

    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await client.query(schema);

    console.log('✅ Esquema creado exitosamente');
    console.log('   - Tabla: personas');
    console.log('   - Tabla: cuadrantes');
    console.log('   - Tabla: comunas');
    console.log('   - Índices GIST para PostGIS');
    console.log('   - Vistas de estadísticas');
    console.log('   - Datos iniciales de comunas');

  } catch (err) {
    console.error('❌ Error inicializando BD:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

inicializar();
