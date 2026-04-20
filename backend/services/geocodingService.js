// ============================================================
// services/geocodingService.js
// Geocodificación con Nominatim (OpenStreetMap) - Sin API key
// Incluye caché en memoria para no repetir peticiones
// ============================================================

const axios = require('axios');

// Caché simple en memoria (en producción usar Redis)
const cache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 horas

// Delay entre peticiones para respetar el rate limit de Nominatim (1 req/seg)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
let ultimaPeticion = 0;

/**
 * Geocodificar una dirección en Medellín
 * 
 * Estrategia de fallback:
 * 1. Dirección completa + barrio + ciudad
 * 2. Solo dirección + ciudad
 * 3. Solo barrio/sector + ciudad
 * 
 * @param {string} direccion - Ej: "Carrera 50 # 45-20"
 * @param {string} barrio    - Ej: "Laureles"
 * @param {string} ciudad    - Default: "Medellín, Antioquia, Colombia"
 * @returns {{ latitud, longitud, display_name } | null}
 */
async function geocodificar(direccion, barrio = '', ciudad = 'Medellín, Antioquia, Colombia') {
  // Normalizar dirección colombiana:
  // "Carrera 50 # 45-20" → "Carrera 50 45-20" (Nominatim no entiende "#")
  const dirNorm = normalizarDireccionColombia(direccion);

  // Intentos en orden de especificidad
  const intentos = [
    `${dirNorm}, ${barrio}, ${ciudad}`.trim().replace(/,\s*,/g, ','),
    `${dirNorm}, ${ciudad}`,
    barrio ? `${barrio}, ${ciudad}` : null
  ].filter(Boolean);

  for (const query of intentos) {
    const cacheKey = query.toLowerCase();

    // Revisar caché
    if (cache.has(cacheKey)) {
      const cached = cache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        console.log(`[Geocoding] Cache hit: ${query}`);
        return cached.data;
      }
    }

    // Respetar rate limit de Nominatim: mínimo 1 segundo entre peticiones
    const ahora = Date.now();
    const esperarMs = Math.max(0, 1100 - (ahora - ultimaPeticion));
    if (esperarMs > 0) await delay(esperarMs);
    ultimaPeticion = Date.now();

    try {
      const response = await axios.get('https://nominatim.openstreetmap.org/search', {
        params: {
          q: query,
          format: 'json',
          limit: 1,
          countrycodes: 'co',  // Solo Colombia
          addressdetails: 1
        },
        headers: {
          // Nominatim requiere un User-Agent identificable
          'User-Agent': 'MedellinElectoralApp/1.0 (contacto@ejemplo.com)',
          'Accept-Language': 'es'
        },
        timeout: 10000
      });

      if (response.data && response.data.length > 0) {
        const resultado = response.data[0];
        const coords = {
          latitud:      parseFloat(resultado.lat),
          longitud:     parseFloat(resultado.lon),
          display_name: resultado.display_name,
          confidence:   resultado.importance || 0
        };

        // Validar que esté dentro del área metropolitana de Medellín
        // Bounding box aproximado: lat 5.9-6.5, lon -75.8 a -75.4
        if (!estaEnMedellin(coords.latitud, coords.longitud)) {
          console.warn(`[Geocoding] Resultado fuera de Medellín: ${resultado.display_name}`);
          continue;
        }

        // Guardar en caché
        cache.set(cacheKey, { data: coords, timestamp: Date.now() });
        console.log(`[Geocoding] ✅ ${query} → ${coords.latitud}, ${coords.longitud}`);
        return coords;
      }
    } catch (err) {
      if (err.code === 'ECONNABORTED') {
        console.warn(`[Geocoding] Timeout para: ${query}`);
      } else {
        console.error(`[Geocoding] Error: ${err.message}`);
      }
    }
  }

  console.warn(`[Geocoding] ❌ No se encontró: ${direccion}`);
  return null;
}

/**
 * Geocodificación inversa: coordenadas → dirección
 */
async function geocodificarInverso(latitud, longitud) {
  const cacheKey = `rev_${latitud}_${longitud}`;

  if (cache.has(cacheKey)) {
    const cached = cache.get(cacheKey);
    if (Date.now() - cached.timestamp < CACHE_TTL) return cached.data;
  }

  const ahora = Date.now();
  const esperarMs = Math.max(0, 1100 - (ahora - ultimaPeticion));
  if (esperarMs > 0) await delay(esperarMs);
  ultimaPeticion = Date.now();

  try {
    const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
      params: {
        lat: latitud,
        lon: longitud,
        format: 'json',
        addressdetails: 1
      },
      headers: {
        'User-Agent': 'MedellinElectoralApp/1.0',
        'Accept-Language': 'es'
      },
      timeout: 10000
    });

    if (response.data) {
      const addr = response.data.address;
      const resultado = {
        display_name: response.data.display_name,
        calle:        addr.road || addr.pedestrian || '',
        barrio:       addr.neighbourhood || addr.suburb || addr.quarter || '',
        ciudad:       addr.city || addr.town || addr.village || '',
        departamento: addr.state || ''
      };
      cache.set(cacheKey, { data: resultado, timestamp: Date.now() });
      return resultado;
    }
  } catch (err) {
    console.error(`[Geocoding Inverso] Error: ${err.message}`);
  }

  return null;
}

/**
 * Normalizar dirección colombiana para Nominatim
 * Ejemplos:
 *   "Cra 50 # 45-20" → "Carrera 50 45-20"
 *   "Cl 30 #25-10"   → "Calle 30 25-10"
 *   "Av 80 # 34-45"  → "Avenida 80 34-45"
 */
function normalizarDireccionColombia(dir) {
  if (!dir) return '';
  let s = dir.trim();

  // 1. Expandir abreviaturas de vía (orden importa: más largas primero)
  s = s.replace(/\bCarr?\.\s*/gi,    'Carrera ');
  s = s.replace(/\bCra?\.\s*/gi,     'Carrera ');
  s = s.replace(/\bCl\b\.?\s*/gi,    'Calle ');
  s = s.replace(/\bClle?\b\.?\s*/gi, 'Calle ');
  s = s.replace(/\bAv\b\.?\s*/gi,    'Avenida ');
  s = s.replace(/\bDg\b\.?\s*/gi,    'Diagonal ');
  s = s.replace(/\bTv\b\.?\s*/gi,    'Transversal ');
  s = s.replace(/\bKm\b\.?\s*/gi,    'Kilómetro ');
  s = s.replace(/\bCir\b\.?\s*/gi,   'Circular ');
  s = s.replace(/\bVarnt?\b\.?\s*/gi,'Variante ');

  // 2. Fusionar número separado de su letra sufijo: "97 C" → "97C", "84 A" → "84A"
  //    Aplica ANTES de eliminar espacios extra para no afectar otros términos
  s = s.replace(/(\d+)\s+([A-Z])\b(?!\s*arrera|\s*alle|\s*venida|\s*iagonal|\s*ransversal)/gi,
    (match, num, letra) => `${num}${letra.toUpperCase()}`
  );

  // 3. Normalizar el símbolo # (dejarlo para Nominatim — ya maneja "#")
  //    Solo limpiar espacios alrededor: "# 84" → "#84"
  s = s.replace(/\s*#\s*/g, ' #');

  // 4. Eliminar espacios múltiples
  s = s.replace(/\s+/g, ' ').trim();

  return s;
}

/**
 * Verificar si unas coordenadas están dentro del Valle de Aburrá / Medellín
 * Bounding box conservador para validación rápida
 */
function estaEnMedellin(lat, lon) {
  return lat >= 5.9 && lat <= 6.45 &&
         lon >= -75.8 && lon <= -75.35;
}

/**
 * Estadísticas del caché (útil para monitoreo)
 */
function estadisticasCache() {
  return {
    entradas: cache.size,
    claves: Array.from(cache.keys()).slice(0, 10) // primeras 10
  };
}

module.exports = {
  geocodificar,
  geocodificarInverso,
  normalizarDireccionColombia,
  estaEnMedellin,
  estadisticasCache
};
