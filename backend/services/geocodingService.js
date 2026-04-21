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

  // Limpiar barrio — se usa en TODAS las queries para reducir ambigüedad.
  // Calles como "Calle 30" o "Carrera 50" se repiten en múltiples comunas
  // de Medellín; sin el barrio, Nominatim puede devolver cualquiera de ellas.
  const barrioLimpio = (barrio || '').trim();

  // ── Construir queries de mayor a menor especificidad ─────────────────
  // La ciudad siempre se expande a "Medellín, Antioquia, Colombia" para
  // evitar coincidencias con municipios homónimos en otros departamentos.
  const intentos = [];

  if (dirNorm && barrioLimpio) {
    // Intento 1 (más específico): dirección + barrio + ciudad completa
    intentos.push(`${dirNorm}, ${barrioLimpio}, Medellín, Antioquia, Colombia`);
    // Intento 2: dirección + barrio + solo ciudad (a veces Nominatim prefiere esto)
    intentos.push(`${dirNorm}, ${barrioLimpio}, Medellín`);
  }

  if (dirNorm) {
    // Intento 3: dirección + ciudad completa (sin barrio, por si el barrio confunde)
    intentos.push(`${dirNorm}, Medellín, Antioquia, Colombia`);
    // Intento 4: dirección + solo ciudad
    intentos.push(`${dirNorm}, Medellín`);
  }

  if (barrioLimpio) {
    // Intento 5 (fallback): solo barrio + ciudad — devuelve el centroide del barrio
    intentos.push(`${barrioLimpio}, Medellín, Antioquia, Colombia`);
  }

  // ── Logs de diagnóstico ───────────────────────────────────────────────
  console.log(`[Geocoding] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`[Geocoding] Dirección original : "${direccion}"`);
  console.log(`[Geocoding] Barrio             : "${barrioLimpio || '(sin barrio)'}"`);
  console.log(`[Geocoding] Dir. normalizada   : "${dirNorm}"`);
  console.log(`[Geocoding] Queries (${intentos.length}): `);
  intentos.forEach((q, i) => console.log(`[Geocoding]   ${i + 1}. ${q}`));

  for (const query of intentos) {
    const cacheKey = query.toLowerCase();

    // Revisar caché
    if (cache.has(cacheKey)) {
      const cached = cache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        console.log(`[Geocoding] 💾 Cache hit: "${query}"`);
        console.log(`[Geocoding] → ${cached.data.latitud}, ${cached.data.longitud} (${cached.data.display_name})`);
        return cached.data;
      }
    }

    // Respetar rate limit de Nominatim: mínimo 1 segundo entre peticiones
    const ahora = Date.now();
    const esperarMs = Math.max(0, 1100 - (ahora - ultimaPeticion));
    if (esperarMs > 0) await delay(esperarMs);
    ultimaPeticion = Date.now();

    console.log(`[Geocoding] 🌐 Consultando: "${query}"`);

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
        if (!estaEnMedellin(coords.latitud, coords.longitud)) {
          console.warn(`[Geocoding] ⚠️  Fuera de Medellín — descartando: "${resultado.display_name}" (${coords.latitud}, ${coords.longitud})`);
          continue;
        }

        // Guardar en caché
        cache.set(cacheKey, { data: coords, timestamp: Date.now() });
        console.log(`[Geocoding] ✅ Resultado: ${coords.latitud}, ${coords.longitud}`);
        console.log(`[Geocoding]    Fuente   : "${resultado.display_name}"`);
        console.log(`[Geocoding]    Query    : "${query}"`);
        return coords;
      } else {
        console.log(`[Geocoding] 🔍 Sin resultados para: "${query}"`);
      }
    } catch (err) {
      if (err.code === 'ECONNABORTED') {
        console.warn(`[Geocoding] ⏱️  Timeout para: "${query}"`);
      } else {
        console.error(`[Geocoding] ❌ Error HTTP: ${err.message}`);
      }
    }
  }

  console.warn(`[Geocoding] ❌ No se encontró ningún resultado para: "${direccion}" (barrio: "${barrioLimpio}")`);
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
