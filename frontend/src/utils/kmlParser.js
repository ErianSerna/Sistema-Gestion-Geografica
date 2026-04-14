// ============================================================
// frontend/src/utils/kmlParser.js
// Parser KML → GeoJSON puro (sin dependencias externas)
// Soporta: Placemarks, Folders, estilos, WGS84 (EPSG:4326)
//
// KML ya usa coordenadas WGS84 (lon,lat,alt) por especificación
// OGC KML 2.2 — no requiere reproyección.
// ============================================================

/**
 * Convierte un string KML a una lista de capas GeoJSON.
 *
 * @param {string} kmlString  - Contenido del archivo .kml
 * @param {string} nombreBase - Nombre del archivo (para nombrar capas)
 * @returns {{ capas: Array, errores: Array }}
 *   capas: [{ nombre: string, geojson: FeatureCollection }]
 *   errores: [string]  — advertencias no fatales
 */
export function kmlToGeoJSON(kmlString, nombreBase = 'kml') {
  const errores = [];

  // Parsear el XML
  let doc;
  try {
    const parser = new DOMParser();
    doc = parser.parseFromString(kmlString, 'application/xml');
    const parseError = doc.querySelector('parsererror');
    if (parseError) throw new Error(parseError.textContent);
  } catch (err) {
    return { capas: [], errores: [`XML inválido: ${err.message}`] };
  }

  // Extraer estilos globales (id → color) para colorear features
  const estilos = extraerEstilos(doc);

  // Buscar Folders. Si no hay Folders, tratar todo el documento como una capa.
  const folders = Array.from(doc.querySelectorAll('Folder'));

  let capas;
  if (folders.length > 0) {
    capas = folders.map(folder => {
      const nombre = getText(folder, 'name') || nombreBase;
      const features = extraerPlacemarks(folder, estilos, errores);
      return {
        nombre,
        geojson: { type: 'FeatureCollection', features },
      };
    }).filter(c => c.geojson.features.length > 0);
  } else {
    // Sin folders: una sola capa con todos los Placemarks
    const features = extraerPlacemarks(doc, estilos, errores);
    capas = features.length
      ? [{ nombre: nombreBase.replace(/\.kml$/i, ''), geojson: { type: 'FeatureCollection', features } }]
      : [];
  }

  return { capas, errores };
}

// ── Helpers internos ──────────────────────────────────────────

/** Obtener el texto de un elemento hijo directo */
function getText(parent, tag) {
  const el = parent.querySelector(`:scope > ${tag}`) || parent.querySelector(tag);
  return el?.textContent?.trim() || '';
}

/**
 * Extraer estilos KML (SimpleStyle / LineStyle / PolyStyle)
 * Devuelve un Map: styleId → { color, fillColor, weight }
 */
function extraerEstilos(doc) {
  const mapa = new Map();
  doc.querySelectorAll('Style').forEach(style => {
    const id = style.getAttribute('id');
    if (!id) return;
    const lineColor  = getText(style, 'LineStyle > color');
    const polyColor  = getText(style, 'PolyStyle > color');
    const iconColor  = getText(style, 'IconStyle > color');
    mapa.set('#' + id, {
      stroke:    lineColor  ? kmlColorToHex(lineColor)  : null,
      fill:      polyColor  ? kmlColorToHex(polyColor)  : null,
      iconColor: iconColor  ? kmlColorToHex(iconColor)  : null,
    });
  });
  return mapa;
}

/**
 * KML usa AABBGGRR (alpha, blue, green, red) — convertir a #RRGGBB
 */
function kmlColorToHex(kmlColor) {
  if (!kmlColor || kmlColor.length < 6) return null;
  const c = kmlColor.padStart(8, '0');
  const r = c.slice(6, 8);
  const g = c.slice(4, 6);
  const b = c.slice(2, 4);
  return `#${r}${g}${b}`;
}

/**
 * Convertir una cadena de coordenadas KML a array GeoJSON.
 * KML: "lon,lat[,alt] lon,lat[,alt] ..."
 * GeoJSON: [[lon, lat], ...]
 */
function parseCoordenadas(texto) {
  return texto.trim().split(/\s+/).map(par => {
    const parts = par.split(',').map(Number);
    // KML: lon, lat, [alt] — GeoJSON también usa lon,lat
    if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
    return [parts[0], parts[1]]; // solo lon, lat (descartar altitud)
  }).filter(Boolean);
}

/**
 * Validar que las coordenadas están en rango WGS84.
 * Si vienen en otro sistema (ej. metros), lo detectamos y advertimos.
 */
function validarWGS84(coords, errores, nombre) {
  const fueraDeRango = coords.some(([lon, lat]) =>
    Math.abs(lon) > 180 || Math.abs(lat) > 90
  );
  if (fueraDeRango) {
    errores.push(
      `"${nombre}": coordenadas fuera de rango WGS84 (lon/lat). ` +
      'El KML podría estar en un SRC proyectado (metros). ' +
      'Reproyecta a EPSG:4326 en QGIS antes de exportar.'
    );
    return false;
  }
  return true;
}

/**
 * Extraer todos los Placemarks de un nodo (Document o Folder)
 * y convertirlos a Features GeoJSON.
 */
function extraerPlacemarks(parent, estilos, errores) {
  const features = [];

  parent.querySelectorAll('Placemark').forEach(pm => {
    const nombre      = getText(pm, 'name') || 'Sin nombre';
    const descripcion = getText(pm, 'description') || '';
    const styleUrl    = getText(pm, 'styleUrl');
    const estilo      = estilos.get(styleUrl) || {};

    // Propiedades base del feature
    const properties = { name: nombre, description: descripcion, ...estilo };

    // Extraer datos de ExtendedData (pares key/value de QGIS)
    pm.querySelectorAll('ExtendedData SimpleData').forEach(sd => {
      properties[sd.getAttribute('name')] = sd.textContent.trim();
    });

    // ── Punto ──
    const point = pm.querySelector('Point > coordinates');
    if (point) {
      const coords = parseCoordenadas(point.textContent);
      if (coords.length >= 1) {
        if (validarWGS84(coords, errores, nombre)) {
          features.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: coords[0] },
            properties,
          });
        }
      }
      return;
    }

    // ── LineString ──
    const line = pm.querySelector('LineString > coordinates');
    if (line) {
      const coords = parseCoordenadas(line.textContent);
      if (coords.length >= 2 && validarWGS84(coords, errores, nombre)) {
        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
          properties,
        });
      }
      return;
    }

    // ── Polygon ──
    const outerRing = pm.querySelector('Polygon > outerBoundaryIs > LinearRing > coordinates');
    if (outerRing) {
      const outer = parseCoordenadas(outerRing.textContent);
      if (outer.length < 3) return;
      if (!validarWGS84(outer, errores, nombre)) return;

      // Cerrar el anillo si no está cerrado
      const anilloExterior = cerrarAnillo(outer);

      // Anillos interiores (huecos)
      const interiores = Array.from(
        pm.querySelectorAll('Polygon > innerBoundaryIs > LinearRing > coordinates')
      ).map(el => cerrarAnillo(parseCoordenadas(el.textContent)));

      features.push({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [anilloExterior, ...interiores],
        },
        properties,
      });
      return;
    }

    // ── MultiGeometry ──
    const multi = pm.querySelector('MultiGeometry');
    if (multi) {
      const geoms = [];

      multi.querySelectorAll('Point > coordinates').forEach(c => {
        const coords = parseCoordenadas(c.textContent);
        if (coords[0]) geoms.push({ type: 'Point', coordinates: coords[0] });
      });
      multi.querySelectorAll('LineString > coordinates').forEach(c => {
        const coords = parseCoordenadas(c.textContent);
        if (coords.length >= 2) geoms.push({ type: 'LineString', coordinates: coords });
      });
      multi.querySelectorAll('Polygon').forEach(poly => {
        const outer = poly.querySelector('outerBoundaryIs > LinearRing > coordinates');
        if (!outer) return;
        const coords = cerrarAnillo(parseCoordenadas(outer.textContent));
        if (coords.length >= 4) geoms.push({ type: 'Polygon', coordinates: [coords] });
      });

      if (geoms.length > 0) {
        features.push({
          type: 'Feature',
          geometry: { type: 'GeometryCollection', geometries: geoms },
          properties,
        });
      }
    }
  });

  return features;
}

/** Asegurar que un anillo lineal esté cerrado (primer punto == último) */
function cerrarAnillo(coords) {
  if (coords.length === 0) return coords;
  const first = coords[0], last = coords[coords.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    return [...coords, first];
  }
  return coords;
}
