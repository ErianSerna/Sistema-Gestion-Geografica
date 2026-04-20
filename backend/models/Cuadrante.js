// ============================================================
// models/Cuadrante.js
// Soporta Polygon Y MultiPolygon (QGIS exports)
// ============================================================

const { query, withTransaction } = require('../config/db');

// Paleta de colores para auto-asignar al importar GeoJSON
// 60 colores variados: azules, verdes, rojos, naranjas, púrpuras, rosas,
// cianes, magentas, indigos, limas, marrones — buena separación visual entre barrios
const PALETA_COLORES = [
  // Azules vibrantes
  '#1D4ED8','#2563EB','#3B82F6','#60A5FA','#93C5FD','#BFDBFE',
  // Azules oscuros / navy
  '#1E3A5F','#1A3A6B','#0C2461','#0A1931','#1B2A4A','#253B6E',
  // Azules acero
  '#4682B4','#5F9EA0','#4169E1','#6495ED','#4A90D9','#356FA0',
  // Cianes brillantes
  '#06B6D4','#0891B2','#0E7490','#22D3EE','#67E8F9','#00BCD4',
  // Cianes oscuros
  '#155E75','#164E63','#0F4C5C','#006978','#00838F','#00695C',
  // Teales / aqua
  '#0D9488','#0F766E','#134E4A','#009688','#00796B','#00897B',
  // Verdes lima
  '#84CC16','#65A30D','#4D7C0F','#A3E635','#BEF264','#ECFCCB',
  // Verdes medios
  '#22C55E','#16A34A','#15803D','#4ADE80','#86EFAC','#166534',
  // Verdes oscuros / bosque
  '#166534','#14532D','#1A4731','#1E5631','#2D6A4F','#1B4332',
  // Verdes oliva
  '#556B2F','#4B5320','#6B7C00','#3F6212','#5F7A00','#8B8C00',
  // Amarillos / dorados
  '#F59E0B','#D97706','#B45309','#FBBF24','#FCD34D','#FDE68A',
  // Naranjas vibrantes
  '#F97316','#EA580C','#C2410C','#FB923C','#FD8B3A','#FF6B35',
  // Naranjas oscuros / tostados
  '#92400E','#78350F','#7C2D12','#A05000','#8B4513','#6B3A2A',
  // Rojos
  '#EF4444','#DC2626','#B91C1C','#991B1B','#7F1D1D','#C53030',
  // Rojos rosados / carmesí
  '#F43F5E','#E11D48','#BE123C','#9F1239','#881337','#C0392B',
  // Rosas
  '#EC4899','#DB2777','#BE185D','#9D174D','#F472B6','#F9A8D4',
  // Fucsias / magentas
  '#D946EF','#C026D3','#A21CAF','#86198F','#E879F9','#F0ABFC',
  // Violetas / orquídeas
  '#9333EA','#7C3AED','#6D28D9','#5B21B6','#A855F7','#C084FC',
  // Púrpuras medios
  '#8B5CF6','#7C3AED','#6D28D9','#4C1D95','#6A0DAD','#7B2FBE',
  // Púrpuras oscuros
  '#4C1D95','#3B0764','#2D1B69','#1A0A3B','#2E003E','#3C0063',
  // Índigos
  '#6366F1','#4F46E5','#4338CA','#3730A3','#312E81','#1E1B4B',
  // Azul pizarra
  '#475569','#334155','#1E293B','#607D8B','#546E7A','#455A64',
  // Grises azulados (útiles para contraste)
  '#4B5563','#374151','#1F2937','#6B7280','#9CA3AF','#52606D',
  // Marrones / chocolates
  '#713F12','#7C2D12','#92400E','#78350F','#6D4C41','#5D4037',
  // Marrones medios / tierra
  '#A16207','#854D0E','#A0522D','#8B4513','#795548','#6D4B33',
  // Sienas / terracota
  '#C0643C','#B5522D','#A94A2A','#C1440E','#D2691E','#CD853F',
  // Oro / bronce
  '#B8860B','#DAA520','#CD7F32','#C5A028','#B7950B','#A0790A',
  // Verde musgo / natural
  '#3B5323','#355E3B','#2E4A1E','#4A5E2A','#3D5A27','#2F4A1F',
  // Verde salvia / menta
  '#7CB9A0','#6AAF92','#5DA08A','#52917C','#4A7D6A','#3D6B59',
  // Azul marino / medianoche
  '#003153','#002147','#001F3F','#002366','#00356B','#024680',
  // Cereza / vino
  '#722F37','#800020','#8B0000','#9B1B30','#A52A2A','#6B2737',
  // Lavanda / lila
  '#967BB6','#8A6CB5','#7B5EA7','#6C4F9A','#8E7AB5','#9B89C4',
  // Coral / salmón
  '#FF6B6B','#FF7F7F','#FA8072','#E88080','#D46A6A','#C75C5C',
  // Turquesa / jade
  '#40E0D0','#30D5C8','#00CED1','#20B2AA','#48D1CC','#00B2A9',
  // Cian eléctrico
  '#00FFFF','#00E5FF','#00B4D8','#0096C7','#0077B6','#023E8A',
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
      // Autogenerar código: C{N}-{BARRIO_EN_MAYUSCULAS}
      // Si el usuario provee uno, usarlo; si no, generar automáticamente
      let codigoFinal;
      if (codigo && codigo.trim()) {
        codigoFinal = codigo.trim().toUpperCase();
      } else {
        // Obtener el próximo número consecutivo
        const countRes2 = await client.query('SELECT COUNT(*) AS n FROM cuadrantes');
        const n = parseInt(countRes2.rows[0].n) + 1;
        // Sufijo: barrio en mayúsculas con espacios → guion bajo
        const sufijo = (barrio && barrio.trim())
          ? barrio.trim().toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '')
          : 'SIN_BARRIO';
        const candidato = `C${n}-${sufijo}`;
        // Evitar duplicados: si ya existe, agregar -2, -3, etc.
        let intentos = 0;
        let codigoPrueba = candidato;
        while (true) {
          intentos++;
          const existe = await client.query('SELECT 1 FROM cuadrantes WHERE codigo = $1', [codigoPrueba]);
          if (!existe.rows.length) break;
          codigoPrueba = `${candidato}-${intentos + 1}`;
          if (intentos > 50) { codigoPrueba = `C${Date.now()}`; break; }
        }
        codigoFinal = codigoPrueba;
      }

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
          // Leer comuna desde las properties del GeoJSON si está disponible
          // Campos comunes: COMMUNE, commune, COMUNA, comuna, NOM_COMUNE, etc.
          const comunaRaw = props.COMMUNE   || props.commune  ||
                            props.COMUNA    || props.comuna   ||
                            props.NOM_COMUNE || props.NOM_COM ||
                            props.NOMBRE_COMUNA || props.nombre_comuna ||
                            null;
          const comunaFinal = comunaRaw ? String(comunaRaw).trim() : null;
          const geometry = feature.geometry;

          if (!geometry || !['Polygon','MultiPolygon'].includes(geometry.type)) {
            errores.push({ feature: nombre, error: `Tipo no soportado: ${geometry?.type}` });
            continue;
          }

          const codigoFinal = `${String(codigo).toUpperCase()}-${String(nombreArchivo).replace(/\s+/g,'-').toUpperCase()}`;

          const insertSQL = `
            INSERT INTO cuadrantes (nombre, codigo, barrio, comuna, color, geom)
            VALUES ($1, $2, $3, $4, $5, ST_SetSRID(ST_GeomFromGeoJSON($6), 4326))
            ON CONFLICT DO NOTHING
            RETURNING id, nombre, codigo, barrio, comuna, color,
              ST_AsGeoJSON(geom) AS geom_json
          `;
          const res = await client.query(insertSQL, [
            nombre, codigoFinal, barrio, comunaFinal, colorDelArchivo,
            JSON.stringify(geometry)
          ]);

          if (!res.rows[0]) {
            // Conflicto — actualizar preservando el color existente del barrio
            const upd = await client.query(`
              UPDATE cuadrantes SET nombre=$1, color=$2,
                geom=ST_SetSRID(ST_GeomFromGeoJSON($3),4326),
                ${comunaFinal ? 'comuna=$5,' : ''} updated_at=NOW()
              WHERE codigo=$4
              RETURNING id, nombre, codigo, barrio, comuna, color
            `, comunaFinal
              ? [nombre, colorDelArchivo, JSON.stringify(geometry), codigoFinal, comunaFinal]
              : [nombre, colorDelArchivo, JSON.stringify(geometry), codigoFinal]);
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
