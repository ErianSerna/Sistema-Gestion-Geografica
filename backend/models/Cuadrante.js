// ============================================================
// models/Cuadrante.js
// Soporta Polygon Y MultiPolygon (QGIS exports)
// ============================================================

const { query, withTransaction } = require('../config/db');

// Paleta de colores para auto-asignar al importar GeoJSON
const PALETA_COLORES = [
  '#2563EB','#7C3AED','#0891B2','#D97706','#059669',
  '#DC2626','#DB2777','#65A30D','#EA580C','#0D9488',
  '#7C2D12','#1D4ED8','#6D28D9','#0E7490','#B45309',
];

class Cuadrante {
  static async generarCodigo(client) {
    // No se autogenera código — se guarda null si el usuario no lo provee
    return null;
  }

  static colorAuto(idx) {
    return PALETA_COLORES[idx % PALETA_COLORES.length];
  }

  /**
   * Genera un color determinista a partir del nombre del archivo/barrio.
   * El mismo nombre siempre produce el mismo color → consistencia entre recargas.
   * Si el hash coincide con un índice ya muy usado, usa el offset para rotar.
   */
  static colorDesdeNombre(nombre, offsetFallback = 0) {
    // Hash simple pero estable: suma de char codes con multiplicador primo
    let hash = 0;
    for (let i = 0; i < nombre.length; i++) {
      hash = (hash * 31 + nombre.charCodeAt(i)) >>> 0;
    }
    return PALETA_COLORES[hash % PALETA_COLORES.length];
  }

  // ── Crear cuadrante individual ──────────────────────────────
  static async crear({ nombre, codigo, comuna, barrio, descripcion, color, geojson_geom }) {
    return withTransaction(async (client) => {
      // Código solo si el usuario lo provee — nunca autogenerar
      const codigoFinal = (codigo && codigo.trim()) ? codigo.trim().toUpperCase() : null;

      // Color: prioridad → color explícito → color del barrio → color automático
      let colorFinal = color;
      if (!colorFinal && barrio && barrio.trim()) {
        colorFinal = this.colorDesdeNombre(barrio.trim());
      }
      if (!colorFinal) {
        const countRes = await client.query('SELECT COUNT(*) AS n FROM cuadrantes');
        colorFinal = this.colorAuto(parseInt(countRes.rows[0].n));
      }

      const insertSQL = `
        INSERT INTO cuadrantes (nombre, codigo, comuna, barrio, descripcion, color, geom)
        VALUES ($1, $2, $3, $4, $5, $6, ST_SetSRID(ST_GeomFromGeoJSON($7), 4326))
        RETURNING id, nombre, codigo, comuna, barrio, descripcion, color,
          ST_AsGeoJSON(geom) AS geom_json
      `;
      const result = await client.query(insertSQL, [
        nombre, codigoFinal, comuna || null, barrio || null,
        descripcion || null, colorFinal,
        JSON.stringify(geojson_geom)
      ]);
      const cuadrante = result.rows[0];

      // Reasignar personas que caen dentro
      await client.query(`
        UPDATE personas SET cuadrante_id = $1, updated_at = NOW()
        WHERE ST_Within(geom, (SELECT geom FROM cuadrantes WHERE id = $1))
      `, [cuadrante.id]);

      const count = await client.query(
        'SELECT COUNT(*) AS n FROM personas WHERE cuadrante_id = $1',
        [cuadrante.id]
      );
      cuadrante.personas_asignadas = parseInt(count.rows[0].n);
      return cuadrante;
    });
  }

  // ── Importar GeoJSON completo (múltiples Features) ──────────
  // Cada Feature se convierte en un cuadrante independiente.
  // feature.properties.Cuadrante → nombre (ej: "C1", "C2"…)
  // Soporta Polygon y MultiPolygon.
  static async importarGeoJSON({ features, nombreArchivo, colorBase }) {
    return withTransaction(async (client) => {
      const exitosos = [];
      const errores  = [];

      // Obtener conteo actual para offset de colores
      const countRes = await client.query('SELECT COUNT(*) AS n FROM cuadrantes');
      const colorIdx = parseInt(countRes.rows[0].n);

      // ── Un solo color por archivo (barrio), no por feature ──
      // Si el cliente pasa colorBase se usa ese; si no, se genera
      // uno basado en el nombre del archivo para que sea consistente
      // entre importaciones del mismo barrio.
      const colorDelArchivo = colorBase || this.colorDesdeNombre(nombreArchivo, colorIdx);

      for (let i = 0; i < features.length; i++) {
        const feature = features[i];
        try {
          const props    = feature.properties || {};
          const nombre   = props.Cuadrante || props.cuadrante || props.nombre ||
                           props.NOMBRE    || props.name      || `${nombreArchivo}-${i+1}`;
          const codigo   = props.Cuadrante || props.codigo    || props.id?.toString();
          const barrio   = nombreArchivo;
          const geometry = feature.geometry;

          if (!geometry || !['Polygon','MultiPolygon'].includes(geometry.type)) {
            errores.push({ feature: nombre, error: `Tipo no soportado: ${geometry?.type}` });
            continue;
          }

          const codigoFinal = `${String(codigo).toUpperCase()}-${String(nombreArchivo).replace(/\s+/g,'-').toUpperCase()}`;

          const insertSQL = `
            INSERT INTO cuadrantes (nombre, codigo, barrio, color, geom)
            VALUES ($1, $2, $3, $4, ST_SetSRID(ST_GeomFromGeoJSON($5), 4326))
            ON CONFLICT DO NOTHING
            RETURNING id, nombre, codigo, barrio, color,
              ST_AsGeoJSON(geom) AS geom_json
          `;
          const res = await client.query(insertSQL, [
            nombre, codigoFinal, barrio, colorDelArchivo,
            JSON.stringify(geometry)
          ]);

          if (!res.rows[0]) {
            // Conflicto — actualizar preservando el color existente del barrio
            const upd = await client.query(`
              UPDATE cuadrantes SET nombre=$1, color=$2,
                geom=ST_SetSRID(ST_GeomFromGeoJSON($3),4326), updated_at=NOW()
              WHERE codigo=$4
              RETURNING id, nombre, codigo, barrio, color
            `, [nombre, colorDelArchivo, JSON.stringify(geometry), codigoFinal]);
            if (upd.rows[0]) exitosos.push(upd.rows[0]);
            continue;
          }

          const cuadrante = res.rows[0];

          await client.query(`
            UPDATE personas SET cuadrante_id = $1, updated_at = NOW()
            WHERE ST_Within(geom, (SELECT geom FROM cuadrantes WHERE id = $1))
          `, [cuadrante.id]);

          exitosos.push(cuadrante);
        } catch (err) {
          errores.push({ feature: i, error: err.message });
        }
      }

      return { exitosos, errores, total: features.length, color: colorDelArchivo };
    });
  }

  // ── Obtener barrios disponibles con su color representativo ─
  static async obtenerBarrios() {
    const sql = `
      SELECT barrio, MIN(color) AS color, COUNT(*) AS total_cuadrantes
      FROM cuadrantes
      WHERE barrio IS NOT NULL AND barrio != ''
      GROUP BY barrio
      ORDER BY barrio
    `;
    const result = await query(sql);
    return result.rows;
  }

  // ── Cambiar barrio de un cuadrante (actualiza color también) ─
  static async actualizarBarrio(id, barrio) {
    const color = barrio ? this.colorDesdeNombre(barrio) : null;
    const result = await query(
      `UPDATE cuadrantes
       SET barrio=$1, color=COALESCE($2, color), updated_at=NOW()
       WHERE id=$3
       RETURNING id, nombre, barrio, color`,
      [barrio || null, color, id]
    );
    return result.rows[0] || null;
  }

  // ── Actualizar color de un cuadrante individual ─────────────
  static async actualizarColor(id, color) {
    const result = await query(
      'UPDATE cuadrantes SET color=$1, updated_at=NOW() WHERE id=$2 RETURNING id, nombre, color',
      [color, id]
    );
    return result.rows[0] || null;
  }

  // ── Actualizar color de TODOS los cuadrantes de un barrio ───
  static async actualizarColorBarrio(barrio, color) {
    const result = await query(
      'UPDATE cuadrantes SET color=$1, updated_at=NOW() WHERE barrio=$2',
      [color, barrio]
    );
    return result.rowCount;
  }

  // ── Obtener todos ───────────────────────────────────────────
  static async obtenerTodos(soloComuna = null) {
    const where  = soloComuna ? 'WHERE c.comuna = $1' : '';
    const params = soloComuna ? [soloComuna] : [];
    const sql = `
      SELECT
        c.id, c.nombre, c.codigo, c.comuna, c.barrio, c.descripcion, c.color,
        ST_AsGeoJSON(c.geom) AS geom_json,
        COUNT(p.id)                                    AS total_personas,
        COUNT(p.id) FILTER (WHERE p.vota_pacto = true) AS votantes_pacto
      FROM cuadrantes c
      LEFT JOIN personas p ON p.cuadrante_id = c.id
      ${where}
      GROUP BY c.id, c.nombre, c.codigo, c.comuna, c.barrio, c.descripcion, c.color, c.geom
      ORDER BY c.barrio NULLS LAST, c.nombre
    `;
    const result = await query(sql, params);
    return result.rows;
  }

  static async obtenerGeoJSON(soloComuna = null) {
    const cuadrantes = await this.obtenerTodos(soloComuna);
    return {
      type: 'FeatureCollection',
      features: cuadrantes.map(c => ({
        type: 'Feature',
        geometry: JSON.parse(c.geom_json),
        properties: {
          id:             c.id,
          nombre:         c.nombre,
          codigo:         c.codigo,
          comuna:         c.comuna,
          barrio:         c.barrio,
          descripcion:    c.descripcion,
          color:          c.color || '#2563EB',
          total_personas: parseInt(c.total_personas)  || 0,
          votantes_pacto: parseInt(c.votantes_pacto)  || 0,
        }
      }))
    };
  }

  static async detectarCuadrante(latitud, longitud) {
    const sql = `
      SELECT id, nombre, codigo, comuna, color
      FROM cuadrantes
      WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint($1::numeric, $2::numeric), 4326))
      LIMIT 1
    `;
    const result = await query(sql, [longitud, latitud]);
    return result.rows[0] || null;
  }

  static async reasignarTodasPersonas() {
    const sql = `
      UPDATE personas p
      SET cuadrante_id = (
        SELECT c.id FROM cuadrantes c
        WHERE ST_Within(p.geom, c.geom) LIMIT 1
      ), updated_at = NOW()
      WHERE p.geom IS NOT NULL
    `;
    const result = await query(sql);
    return result.rowCount;
  }

  static async actualizarGeometria(id, geojson_geom) {
    return withTransaction(async (client) => {
      const res = await client.query(`
        UPDATE cuadrantes
        SET geom = ST_SetSRID(ST_GeomFromGeoJSON($1), 4326), updated_at = NOW()
        WHERE id = $2
        RETURNING *, ST_AsGeoJSON(geom) AS geom_json
      `, [JSON.stringify(geojson_geom), id]);
      if (!res.rows[0]) return null;

      await client.query(`
        UPDATE personas
        SET cuadrante_id = CASE
          WHEN ST_Within(geom, (SELECT geom FROM cuadrantes WHERE id=$1)) THEN $1
          ELSE NULL
        END, updated_at = NOW()
        WHERE cuadrante_id=$1
           OR ST_Within(geom, (SELECT geom FROM cuadrantes WHERE id=$1))
      `, [id]);

      return res.rows[0];
    });
  }

  static async editarInfo(id, { nombre, descripcion }) {
    const result = await query(
      'UPDATE cuadrantes SET nombre=$1, descripcion=$2, updated_at=NOW() WHERE id=$3 RETURNING id,nombre,codigo,barrio,descripcion,color',
      [nombre.trim(), descripcion || null, id]
    );
    return result.rows[0] || null;
  }

  static async eliminar(id) {
    return withTransaction(async (client) => {
      await client.query(
        'UPDATE personas SET cuadrante_id=NULL, updated_at=NOW() WHERE cuadrante_id=$1',
        [id]
      );
      const result = await client.query(
        'DELETE FROM cuadrantes WHERE id=$1 RETURNING id, nombre',
        [id]
      );
      return result.rows[0] || null;
    });
  }
}

module.exports = Cuadrante;
