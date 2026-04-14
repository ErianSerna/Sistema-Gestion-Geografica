// ============================================================
// models/Persona.js
// ============================================================

const { query, withTransaction } = require('../config/db');

class Persona {
  static async crear(datos) {
    const {
      nombre, cedula, telefono, direccion,
      comuna, barrio, latitud, longitud, vota_pacto = false
    } = datos;

    // Cast explícito a numeric para evitar "tipos inconsistentes" en PG
    const sql = `
      INSERT INTO personas (
        nombre, cedula, telefono, direccion,
        comuna, barrio, latitud, longitud,
        vota_pacto, geom, cuadrante_id
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        $7::numeric, $8::numeric,
        $9,
        ST_SetSRID(ST_MakePoint($8::numeric, $7::numeric), 4326),
        (
          SELECT c.id FROM cuadrantes c
          WHERE ST_Contains(c.geom, ST_SetSRID(ST_MakePoint($8::numeric, $7::numeric), 4326))
          LIMIT 1
        )
      )
      RETURNING *, ST_AsGeoJSON(geom) AS geom_json
    `;

    const result = await query(sql, [
      nombre, cedula, telefono || null, direccion || null,
      comuna || null, barrio || null,
      parseFloat(latitud), parseFloat(longitud),
      Boolean(vota_pacto)
    ]);
    return result.rows[0];
  }

  static async obtenerTodas(filtros = {}) {
    let condiciones = [];
    let params = [];
    let idx = 1;

    if (filtros.comuna)      { condiciones.push(`p.comuna = $${idx++}`);         params.push(filtros.comuna); }
    if (filtros.barrio)      { condiciones.push(`p.barrio ILIKE $${idx++}`);      params.push(`%${filtros.barrio}%`); }
    if (filtros.vota_pacto !== undefined) {
      condiciones.push(`p.vota_pacto = $${idx++}`);
      params.push(filtros.vota_pacto);
    }
    if (filtros.cuadrante_id){ condiciones.push(`p.cuadrante_id = $${idx++}`);   params.push(filtros.cuadrante_id); }

    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    const sql = `
      SELECT p.*, c.nombre AS cuadrante_nombre, c.codigo AS cuadrante_codigo
      FROM personas p
      LEFT JOIN cuadrantes c ON p.cuadrante_id = c.id
      ${where}
      ORDER BY p.created_at DESC
    `;
    const result = await query(sql, params);
    return result.rows;
  }

  static async obtenerPorId(id) {
    const sql = `
      SELECT p.*, c.nombre AS cuadrante_nombre,
        ST_AsGeoJSON(p.geom) AS geom_json
      FROM personas p
      LEFT JOIN cuadrantes c ON p.cuadrante_id = c.id
      WHERE p.id = $1
    `;
    const result = await query(sql, [id]);
    return result.rows[0];
  }

  static async actualizar(id, datos) {
    const campos = [];
    const params = [];
    let idx = 1;

    const camposPermitidos = [
      'nombre','cedula','telefono','direccion',
      'comuna','barrio','latitud','longitud','vota_pacto'
    ];

    for (const campo of camposPermitidos) {
      if (datos[campo] !== undefined) {
        campos.push(`${campo} = $${idx++}`);
        params.push(datos[campo]);
      }
    }

    if (datos.latitud !== undefined || datos.longitud !== undefined) {
      const lat = parseFloat(datos.latitud  ?? 0);
      const lon = parseFloat(datos.longitud ?? 0);
      params.push(lat); const pLat = idx++;
      params.push(lon); const pLon = idx++;
      campos.push(`geom = ST_SetSRID(ST_MakePoint($${pLon}::numeric, $${pLat}::numeric), 4326)`);
      campos.push(`cuadrante_id = (
        SELECT c.id FROM cuadrantes c
        WHERE ST_Contains(c.geom, ST_SetSRID(ST_MakePoint($${pLon}::numeric, $${pLat}::numeric), 4326))
        LIMIT 1
      )`);
    }

    if (campos.length === 0) return this.obtenerPorId(id);

    campos.push(`updated_at = NOW()`);
    params.push(id);

    const sql = `UPDATE personas SET ${campos.join(', ')} WHERE id = $${idx} RETURNING *`;
    const result = await query(sql, params);
    return result.rows[0];
  }

  static async eliminar(id) {
    const result = await query('DELETE FROM personas WHERE id = $1 RETURNING id', [id]);
    return result.rows[0];
  }

  static async importarMasivo(personas) {
    return withTransaction(async (client) => {
      const resultados = { exitosos: [], errores: [] };

      for (const p of personas) {
        try {
          const lat = parseFloat(p.latitud);
          const lon = parseFloat(p.longitud);

          if (isNaN(lat) || isNaN(lon)) {
            resultados.errores.push({ persona: p, error: 'Coordenadas inválidas' });
            continue;
          }

          // Cast explícito ::numeric en todos los usos de lat/lon
          const sql = `
            INSERT INTO personas (
              nombre, cedula, telefono, direccion,
              comuna, barrio, latitud, longitud, vota_pacto, geom, cuadrante_id
            )
            VALUES (
              $1, $2, $3, $4, $5, $6,
              $7::numeric, $8::numeric,
              $9,
              ST_SetSRID(ST_MakePoint($8::numeric, $7::numeric), 4326),
              (
                SELECT c.id FROM cuadrantes c
                WHERE ST_Contains(c.geom, ST_SetSRID(ST_MakePoint($8::numeric, $7::numeric), 4326))
                LIMIT 1
              )
            )
            ON CONFLICT (cedula) DO UPDATE SET
              nombre       = EXCLUDED.nombre,
              telefono     = EXCLUDED.telefono,
              direccion    = EXCLUDED.direccion,
              comuna       = EXCLUDED.comuna,
              barrio       = EXCLUDED.barrio,
              latitud      = EXCLUDED.latitud,
              longitud     = EXCLUDED.longitud,
              vota_pacto   = EXCLUDED.vota_pacto,
              geom         = EXCLUDED.geom,
              cuadrante_id = EXCLUDED.cuadrante_id,
              updated_at   = NOW()
            RETURNING *
          `;
          const res = await client.query(sql, [
            p.nombre, String(p.cedula).replace(/\D/g, ''),
            p.telefono || null, p.direccion || null,
            p.comuna || null, p.barrio || null,
            lat, lon, Boolean(p.vota_pacto)
          ]);
          resultados.exitosos.push(res.rows[0]);
        } catch (err) {
          resultados.errores.push({ persona: p, error: err.message });
        }
      }
      return resultados;
    });
  }

  static async obtenerGeoJSON(filtros = {}) {
    const personas = await this.obtenerTodas(filtros);
    return {
      type: 'FeatureCollection',
      features: personas
        .filter(p => p.latitud && p.longitud)
        .map(p => ({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [parseFloat(p.longitud), parseFloat(p.latitud)]
          },
          properties: {
            id: p.id, nombre: p.nombre, cedula: p.cedula,
            telefono: p.telefono, direccion: p.direccion,
            comuna: p.comuna, barrio: p.barrio,
            vota_pacto: p.vota_pacto,
            cuadrante: p.cuadrante_nombre,
            latitud: p.latitud, longitud: p.longitud
          }
        }))
    };
  }
}

module.exports = Persona;
