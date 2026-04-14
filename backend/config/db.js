// ============================================================
// config/db.js — Conexión PostgreSQL + PostGIS
// ============================================================

const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || 'medellin_electoral',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 20,                    // máx conexiones en el pool
  idleTimeoutMillis: 30000,   // cerrar conexiones inactivas tras 30s
  connectionTimeoutMillis: 2000,
  ssl: {
    rejectUnauthorized: false
  }
});

// Verificar conexión al iniciar
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Error conectando a PostgreSQL:', err.message);
    console.error('   Verifica las variables de entorno en .env');
    return;
  }
  // Verificar que PostGIS esté instalado
  client.query('SELECT PostGIS_version()', (pgErr, result) => {
    release();
    if (pgErr) {
      console.warn('⚠️  PostGIS no encontrado. Algunas funciones geoespaciales pueden fallar.');
      console.warn('   Instala PostGIS: CREATE EXTENSION postgis;');
    } else {
      console.log(`✅ PostgreSQL + PostGIS ${result.rows[0].postgis_version} conectado`);
    }
  });
});

/**
 * Helper para ejecutar queries con manejo de errores
 * @param {string} text - Query SQL
 * @param {Array} params - Parámetros parametrizados
 * @returns {Promise<pg.QueryResult>}
 */
const query = (text, params) => pool.query(text, params);

/**
 * Helper para transacciones
 * @param {Function} callback - Función async que recibe el cliente
 */
const withTransaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports = { query, withTransaction, pool };
