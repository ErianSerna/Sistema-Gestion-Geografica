// ============================================================
// services/geocodingService.js
// Geocodificación robusta para Medellín con:
//   1. Viewbox restringido al municipio completo (incl. corregimientos)
//   2. Tabla de referencia lat/lon por barrio (~120 barrios)
//   3. Validación por distancia al centro del barrio
//   4. Fallback inteligente con jitter para evitar puntos duplicados
// ============================================================

const axios = require('axios');

// ── Caché ─────────────────────────────────────────────────────
const cache     = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 horas

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
let ultimaPeticion = 0;

// ── Bounding box del MUNICIPIO completo de Medellín ───────────
// Cubre ciudad + corregimientos: Santa Elena, San Cristóbal,
// Altavista, San Antonio de Prado, San Sebastián de Palmitas.
// Formato: minLon,maxLat,maxLon,minLat  (O,N,E,S)
const MEDELLIN_VIEWBOX = '-75.75,6.40,-75.45,6.10';
const MEDELLIN_BOUNDS  = { latMin: 6.10, latMax: 6.40, lonMin: -75.75, lonMax: -75.45 };

// Distancia máxima aceptable entre resultado geocodificado y centro del barrio
const DISTANCIA_MAX_KM    = 1.5;  // comunas urbanas
const DISTANCIA_MAX_KM_CO = 3.0;  // corregimientos (menor cobertura OSM)

const CORREGIMIENTOS = new Set([
  'Santa Elena', 'San Cristóbal', 'Altavista',
  'San Antonio de Prado', 'San Sebastián de Palmitas',
]);

// ── Tabla de referencia: barrio → centroide aproximado ────────
// Se usa SOLO para validación y fallback.
// No son la posición final de la persona.
const CENTROS_BARRIOS = {
  // COMUNA 1: Popular
  'Popular':               { lat: 6.3210, lon: -75.5540 },
  'Santa Cruz':            { lat: 6.3180, lon: -75.5570 },
  'La Esperanza':          { lat: 6.3050, lon: -75.5630 },
  'Granizal':              { lat: 6.3270, lon: -75.5420 },
  'Moscú N1':              { lat: 6.3120, lon: -75.5510 },
  'Moscú N2':              { lat: 6.3130, lon: -75.5500 },
  'Villa del Socorro':     { lat: 6.3160, lon: -75.5490 },
  'El Compromiso':         { lat: 6.3230, lon: -75.5470 },
  'Nuevo Horizonte':       { lat: 6.3240, lon: -75.5450 },
  'San Pablo':             { lat: 6.3190, lon: -75.5520 },
  'Carpinelo':             { lat: 6.3280, lon: -75.5400 },
  'El Raizal':             { lat: 6.3140, lon: -75.5560 },
  'El Pinal':              { lat: 6.3100, lon: -75.5575 },
  // COMUNA 2: Santa Cruz
  'La Rosa':               { lat: 6.3090, lon: -75.5590 },
  'Pablo VI':              { lat: 6.3070, lon: -75.5610 },
  'Villa Niza':            { lat: 6.3060, lon: -75.5620 },
  'Palermo':               { lat: 6.3040, lon: -75.5640 },
  'La Francia':            { lat: 6.3020, lon: -75.5660 },
  // COMUNA 3: Manrique
  'Manrique Central N1':   { lat: 6.2990, lon: -75.5630 },
  'Manrique Central N2':   { lat: 6.2980, lon: -75.5620 },
  'Manrique Oriental':     { lat: 6.2970, lon: -75.5600 },
  'La Salle':              { lat: 6.2960, lon: -75.5650 },
  'Las Granjas':           { lat: 6.2950, lon: -75.5640 },
  'Campo Valdés N1':       { lat: 6.2930, lon: -75.5670 },
  'Campo Valdés N2':       { lat: 6.2920, lon: -75.5660 },
  'Santa Inés':            { lat: 6.2940, lon: -75.5670 },
  'Versalles N1':          { lat: 6.3010, lon: -75.5590 },
  'Versalles N2':          { lat: 6.3000, lon: -75.5580 },
  'La Cruz':               { lat: 6.3030, lon: -75.5560 },
  // COMUNA 4: Aranjuez
  'Aranjuez':              { lat: 6.2880, lon: -75.5620 },
  'Brasilia':              { lat: 6.2870, lon: -75.5630 },
  'Bermejal Los Álamos':   { lat: 6.2890, lon: -75.5610 },
  'Los Olivos N1':         { lat: 6.2910, lon: -75.5600 },
  'Los Olivos N2':         { lat: 6.2900, lon: -75.5595 },
  'Moravia':               { lat: 6.2830, lon: -75.5600 },
  'La Piñuela':            { lat: 6.2860, lon: -75.5640 },
  'El Jardín':             { lat: 6.2840, lon: -75.5660 },
  'Sevilla':               { lat: 6.2910, lon: -75.5590 },
  // COMUNA 5: Castilla
  'Castilla':              { lat: 6.2870, lon: -75.5790 },
  'Florencia':             { lat: 6.2880, lon: -75.5810 },
  'Tejelo':                { lat: 6.2890, lon: -75.5780 },
  'Tricentenario':         { lat: 6.2760, lon: -75.5770 },
  'Alfonso López':         { lat: 6.2780, lon: -75.5780 },
  'Bello Horizonte':       { lat: 6.2820, lon: -75.5810 },
  'Francisco Antonio Zea': { lat: 6.2840, lon: -75.5760 },
  // COMUNA 6: Doce de Octubre
  'Doce de Octubre N1':    { lat: 6.3010, lon: -75.5760 },
  'Doce de Octubre N2':    { lat: 6.3020, lon: -75.5770 },
  'Picacho':               { lat: 6.3070, lon: -75.5780 },
  'Picachito':             { lat: 6.3060, lon: -75.5775 },
  'San Martín de Porres':  { lat: 6.2990, lon: -75.5770 },
  'Kennedy':               { lat: 6.2960, lon: -75.5780 },
  'Pedregal':              { lat: 6.2940, lon: -75.5760 },
  // COMUNA 7: Robledo
  'Robledo':               { lat: 6.2930, lon: -75.5870 },
  'Aures N1':              { lat: 6.2970, lon: -75.5895 },
  'Aures N2':              { lat: 6.2960, lon: -75.5885 },
  'Pajarito':              { lat: 6.3000, lon: -75.5910 },
  'Olaya Herrera':         { lat: 6.2950, lon: -75.5860 },
  'Fuente Clara':          { lat: 6.2980, lon: -75.5840 },
  'Santa Margarita':       { lat: 6.2910, lon: -75.5900 },
  'El Volador':            { lat: 6.2960, lon: -75.5910 },
  'Llano de Ovejas':       { lat: 6.3020, lon: -75.5920 },
  // COMUNA 8: Villa Hermosa
  'Villa Hermosa':         { lat: 6.2590, lon: -75.5590 },
  'La Mansión':            { lat: 6.2570, lon: -75.5580 },
  'San Miguel':            { lat: 6.2560, lon: -75.5560 },
  'Villatina':             { lat: 6.2540, lon: -75.5520 },
  'Sucre':                 { lat: 6.2580, lon: -75.5540 },
  'Enciso':                { lat: 6.2620, lon: -75.5610 },
  'La Villa':              { lat: 6.2600, lon: -75.5600 },
  // COMUNA 9: Buenos Aires
  'Buenos Aires':          { lat: 6.2470, lon: -75.5620 },
  'Loreto':                { lat: 6.2490, lon: -75.5630 },
  'Miraflores':            { lat: 6.2460, lon: -75.5600 },
  'Cataluña':              { lat: 6.2480, lon: -75.5610 },
  'Juan Pablo II':         { lat: 6.2450, lon: -75.5590 },
  'Barrios de Jesús':      { lat: 6.2510, lon: -75.5640 },
  // COMUNA 10: La Candelaria
  'La Candelaria':         { lat: 6.2490, lon: -75.5730 },
  'Centro':                { lat: 6.2518, lon: -75.5636 },
  'El Chagualo':           { lat: 6.2550, lon: -75.5700 },
  'Jesús Nazareno':        { lat: 6.2480, lon: -75.5760 },
  'San Benito':            { lat: 6.2460, lon: -75.5780 },
  'Colón':                 { lat: 6.2520, lon: -75.5720 },
  'Boston':                { lat: 6.2470, lon: -75.5680 },
  'San Diego':             { lat: 6.2500, lon: -75.5660 },
  'Estación Villa':        { lat: 6.2530, lon: -75.5690 },
  // COMUNA 11: Laureles
  'Laureles':              { lat: 6.2460, lon: -75.5910 },
  'Estadio':               { lat: 6.2490, lon: -75.5870 },
  'San Joaquín':           { lat: 6.2430, lon: -75.5950 },
  'Los Conquistadores':    { lat: 6.2450, lon: -75.5930 },
  'Suramericana':          { lat: 6.2480, lon: -75.5900 },
  'Las Acacias':           { lat: 6.2510, lon: -75.5880 },
  'Florida Nueva':         { lat: 6.2420, lon: -75.5960 },
  // COMUNA 12: La América
  'La América':            { lat: 6.2380, lon: -75.5940 },
  'Santa Lucía':           { lat: 6.2360, lon: -75.5960 },
  'El Danubio':            { lat: 6.2370, lon: -75.5950 },
  'La Floresta':           { lat: 6.2350, lon: -75.5970 },
  'Los Colores':           { lat: 6.2400, lon: -75.5920 },
  'Simón Bolívar':         { lat: 6.2410, lon: -75.5910 },
  // COMUNA 13: San Javier
  'San Javier':            { lat: 6.2370, lon: -75.6030 },
  'El Salado':             { lat: 6.2350, lon: -75.6050 },
  'La Gabriela':           { lat: 6.2330, lon: -75.6070 },
  'Veinte de Julio':       { lat: 6.2390, lon: -75.6020 },
  'Blanquizal':            { lat: 6.2410, lon: -75.6000 },
  'El Corazón':            { lat: 6.2280, lon: -75.6100 },
  'Las Independencias':    { lat: 6.2300, lon: -75.6090 },
  'Metropolitano':         { lat: 6.2310, lon: -75.6080 },
  // COMUNA 14: El Poblado
  'El Poblado':            { lat: 6.2090, lon: -75.5690 },
  'Manila':                { lat: 6.2120, lon: -75.5680 },
  'Lalinde':               { lat: 6.2060, lon: -75.5700 },
  'El Tesoro':             { lat: 6.1990, lon: -75.5670 },
  'Provenza':              { lat: 6.2100, lon: -75.5710 },
  'Los Balsos N1':         { lat: 6.1980, lon: -75.5645 },
  'Los Balsos N2':         { lat: 6.1960, lon: -75.5640 },
  'El Diamante N1':        { lat: 6.2040, lon: -75.5685 },
  'El Diamante N2':        { lat: 6.2030, lon: -75.5680 },
  'San Lucas':             { lat: 6.2020, lon: -75.5710 },
  'Patio Bonito':          { lat: 6.2010, lon: -75.5720 },
  'Alejandría':            { lat: 6.2050, lon: -75.5690 },
  'Castropol':             { lat: 6.2080, lon: -75.5660 },
  // COMUNA 15: Guayabal
  'Guayabal':              { lat: 6.2100, lon: -75.5890 },
  'Trinidad':              { lat: 6.2130, lon: -75.5870 },
  'La Colina':             { lat: 6.2080, lon: -75.5910 },
  'Tenche':                { lat: 6.2060, lon: -75.5930 },
  'Asturias':              { lat: 6.2140, lon: -75.5860 },
  // COMUNA 16: Belén
  'Belén':                 { lat: 6.2280, lon: -75.6040 },
  'El Rincón':             { lat: 6.2260, lon: -75.6060 },
  'La Mota':               { lat: 6.2240, lon: -75.6070 },
  'Rodeo Alto':            { lat: 6.2300, lon: -75.6020 },
  'Las Violetas':          { lat: 6.2220, lon: -75.6080 },
  'Los Alpes':             { lat: 6.2200, lon: -75.6090 },
  'La Gloria':             { lat: 6.2180, lon: -75.6100 },
  'Las Playas':            { lat: 6.2320, lon: -75.6010 },
  'La Hondonada':          { lat: 6.2340, lon: -75.6000 },
  'Nuevo El Rincón':       { lat: 6.2250, lon: -75.6050 },
  // CORREGIMIENTOS
  'Santa Elena':                { lat: 6.2320, lon: -75.4980 },
  'San Cristóbal':              { lat: 6.2760, lon: -75.6360 },
  'Altavista':                  { lat: 6.2150, lon: -75.6270 },
  'San Antonio de Prado':       { lat: 6.1680, lon: -75.6300 },
  'San Sebastián de Palmitas':  { lat: 6.3400, lon: -75.6840 },
};

// Alias: tolera variantes sin tilde, abreviaciones y nombres comunes
const ALIAS_BARRIOS = {
  'la esperanza':         'La Esperanza',
  'popular':              'Popular',
  'aranjuez':             'Aranjuez',
  'moravia':              'Moravia',
  'manrique':             'Manrique Central N1',
  'manrique central':     'Manrique Central N1',
  'campo valdes':         'Campo Valdés N1',
  'campo valdés':         'Campo Valdés N1',
  'doce de octubre':      'Doce de Octubre N1',
  'castilla':             'Castilla',
  'robledo':              'Robledo',
  'villa hermosa':        'Villa Hermosa',
  'buenos aires':         'Buenos Aires',
  'candelaria':           'La Candelaria',
  'la candelaria':        'La Candelaria',
  'centro':               'Centro',
  'laureles':             'Laureles',
  'estadio':              'Estadio',
  'la america':           'La América',
  'america':              'La América',
  'san javier':           'San Javier',
  'belen':                'Belén',
  'poblado':              'El Poblado',
  'el poblado':           'El Poblado',
  'guayabal':             'Guayabal',
  'la floresta':          'La Floresta',
  'floresta':             'La Floresta',
  'los colores':          'Los Colores',
  'simon bolivar':        'Simón Bolívar',
  'santa elena':          'Santa Elena',
  'san cristobal':        'San Cristóbal',
  'san cristóbal':        'San Cristóbal',
  'altavista':            'Altavista',
  'san antonio':          'San Antonio de Prado',
  'san antonio de prado': 'San Antonio de Prado',
  'palmitas':             'San Sebastián de Palmitas',
  'picacho':              'Picacho',
  'pedregal':             'Pedregal',
  'enciso':               'Enciso',
  'sucre':                'Sucre',
  'villatina':            'Villatina',
};

// ─────────────────────────────────────────────────────────────

/**
 * Distancia Haversine (km) entre dos puntos geográficos.
 */
function distanciaKm(lat1, lon1, lat2, lon2) {
  const R  = 6371;
  const dL = (lat2 - lat1) * Math.PI / 180;
  const dG = (lon2 - lon1) * Math.PI / 180;
  const a  = Math.sin(dL/2) ** 2
           + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180)
           * Math.sin(dG/2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Buscar el centroide de referencia de un barrio.
 * Tolerante a tildes, mayúsculas y alias.
 */
function centroDeBarrio(barrio) {
  if (!barrio) return null;
  const b = barrio.trim();

  // 1. Exacto
  if (CENTROS_BARRIOS[b]) return CENTROS_BARRIOS[b];

  // 2. Alias normalizado (sin tildes, minúsculas)
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const bNorm = norm(b);
  const aliasKey = Object.keys(ALIAS_BARRIOS).find(k => norm(k) === bNorm);
  if (aliasKey) {
    const mapped = ALIAS_BARRIOS[aliasKey];
    if (CENTROS_BARRIOS[mapped]) return CENTROS_BARRIOS[mapped];
  }

  // 3. Búsqueda parcial
  const match = Object.keys(CENTROS_BARRIOS).find(k => {
    const kn = norm(k);
    return kn.includes(bNorm) || bNorm.includes(kn);
  });
  if (match) return CENTROS_BARRIOS[match];

  return null;
}

/**
 * ¿Las coordenadas están dentro del municipio de Medellín?
 */
function estaEnMedellin(lat, lon) {
  return lat >= MEDELLIN_BOUNDS.latMin && lat <= MEDELLIN_BOUNDS.latMax
      && lon >= MEDELLIN_BOUNDS.lonMin && lon <= MEDELLIN_BOUNDS.lonMax;
}

// ─────────────────────────────────────────────────────────────

/**
 * Geocodifica una dirección en Medellín con validación robusta.
 *
 * Flujo completo:
 *   1. Construir varias queries en orden de especificidad
 *   2. Para cada query: viewbox+bounded → Nominatim
 *   3. Validar resultado:
 *      a. Dentro del municipio (bounding box)
 *      b. Dentro del umbral de distancia al centroide del barrio
 *   4. Si ninguna query pasa validación → fallback al centroide del barrio
 *      con jitter para evitar puntos idénticos
 *   5. Si no hay centroide → devolver null (registro se omite)
 *
 * @param {string} direccion - "Carrera 50 #45-20"
 * @param {string} barrio    - "La Esperanza"
 * @param {string} _ciudad   - Ignorado; siempre se usa Medellín
 * @returns {{ latitud, longitud, display_name, esFallback } | null}
 */
async function geocodificar(direccion, barrio = '', _ciudad = '') {
  const dirNorm      = normalizarDireccionColombia(direccion);
  const barrioLimpio = (barrio || '').trim();
  const centroRef    = centroDeBarrio(barrioLimpio);
  const esCorregim   = CORREGIMIENTOS.has(barrioLimpio);
  const umbralKm     = esCorregim ? DISTANCIA_MAX_KM_CO : DISTANCIA_MAX_KM;

  // Queries en orden de mayor a menor especificidad
  const intentos = [];
  if (dirNorm && barrioLimpio) {
    intentos.push(`${dirNorm}, ${barrioLimpio}, Medellín, Antioquia, Colombia`);
    intentos.push(`${dirNorm}, ${barrioLimpio}, Medellín`);
  }
  if (dirNorm) {
    intentos.push(`${dirNorm}, Medellín, Antioquia, Colombia`);
    intentos.push(`${dirNorm}, Medellín`);
  }
  // Barrio solo — útil si la numeración no está en OSM pero el barrio sí
  if (barrioLimpio) {
    intentos.push(`${barrioLimpio}, Medellín, Antioquia, Colombia`);
  }

  // ── Logs de cabecera ────────────────────────────────────────
  console.log(`[Geocoding] ${'═'.repeat(52)}`);
  console.log(`[Geocoding] Dir. original   : "${direccion}"`);
  console.log(`[Geocoding] Barrio          : "${barrioLimpio || '(sin barrio)'}"`);
  console.log(`[Geocoding] Dir. normalizada: "${dirNorm}"`);
  if (centroRef) {
    console.log(`[Geocoding] Centro barrio   : ${centroRef.lat}, ${centroRef.lon} (umbral ${umbralKm} km)`);
  } else {
    console.log(`[Geocoding] Centro barrio   : no disponible — sin validación distancia`);
  }
  intentos.forEach((q, i) => console.log(`[Geocoding]   ${i + 1}. ${q}`));

  for (const query of intentos) {
    const cacheKey = `geo::${query.toLowerCase()}`;

    // ── Caché ─────────────────────────────────────────────────
    if (cache.has(cacheKey)) {
      const { data: c, timestamp } = cache.get(cacheKey);
      if (Date.now() - timestamp < CACHE_TTL) {
        // Revalidar distancia aunque venga de caché
        if (centroRef && !c.esFallback) {
          const dist = distanciaKm(c.latitud, c.longitud, centroRef.lat, centroRef.lon);
          if (dist > umbralKm) {
            console.log(`[Geocoding] 💾 Caché descartada (dist ${dist.toFixed(2)} km > ${umbralKm} km): "${query}"`);
            continue;
          }
          console.log(`[Geocoding] 💾 Caché válida (dist ${dist.toFixed(2)} km): "${query}" → ${c.latitud}, ${c.longitud}`);
        } else {
          console.log(`[Geocoding] 💾 Caché: "${query}" → ${c.latitud}, ${c.longitud}`);
        }
        return c;
      }
    }

    // ── Rate limit: 1 req/seg Nominatim ────────────────────────
    const espera = Math.max(0, 1100 - (Date.now() - ultimaPeticion));
    if (espera > 0) await delay(espera);
    ultimaPeticion = Date.now();

    console.log(`[Geocoding] 🌐 Consultando: "${query}"`);

    try {
      const { data } = await axios.get('https://nominatim.openstreetmap.org/search', {
        params: {
          q:              query,
          format:         'json',
          limit:          1,
          countrycodes:   'co',
          viewbox:        MEDELLIN_VIEWBOX,
          bounded:        1,           // Fuerza resultados dentro del viewbox
          addressdetails: 1,
        },
        headers: {
          'User-Agent':      'MedellinElectoralApp/1.0 (contacto@ejemplo.com)',
          'Accept-Language': 'es',
        },
        timeout: 10000,
      });

      if (!data || data.length === 0) {
        console.log(`[Geocoding]    🔍 Sin resultados para esta query`);
        continue;
      }

      const r   = data[0];
      const lat = parseFloat(r.lat);
      const lon = parseFloat(r.lon);

      // Validación 1: dentro del municipio
      if (!estaEnMedellin(lat, lon)) {
        console.log(`[Geocoding]    ⚠️  Fuera del municipio: "${r.display_name}" (${lat}, ${lon})`);
        continue;
      }

      // Validación 2: distancia al centroide del barrio
      if (centroRef) {
        const dist = distanciaKm(lat, lon, centroRef.lat, centroRef.lon);
        console.log(`[Geocoding]    📏 Distancia al barrio: ${dist.toFixed(2)} km (máx ${umbralKm} km)`);
        console.log(`[Geocoding]    📍 "${r.display_name}"`);

        if (dist > umbralKm) {
          console.log(`[Geocoding]    ❌ Descartado: resultado demasiado lejos del barrio`);
          continue;
        }
        console.log(`[Geocoding]    ✅ Válido por distancia`);
      } else {
        console.log(`[Geocoding]    ✅ Sin validación distancia`);
        console.log(`[Geocoding]    📍 "${r.display_name}"`);
      }

      const coords = {
        latitud:      lat,
        longitud:     lon,
        display_name: r.display_name,
        confidence:   r.importance || 0,
        esFallback:   false,
      };

      cache.set(cacheKey, { data: coords, timestamp: Date.now() });
      console.log(`[Geocoding] ✅ ACEPTADO: ${lat}, ${lon}`);
      return coords;

    } catch (err) {
      if (err.code === 'ECONNABORTED') {
        console.warn(`[Geocoding] ⏱️  Timeout: "${query}"`);
      } else {
        console.error(`[Geocoding] ❌ Error HTTP: ${err.message}`);
      }
    }
  }

  // ── Fallback: centroide del barrio + jitter ─────────────────
  // El jitter (~±40 m) evita que todas las personas sin dirección
  // geocodificable queden exactamente en el mismo punto.
  if (centroRef) {
    const jitter = () => (Math.random() - 0.5) * 0.0007; // ~±39 m
    const coords = {
      latitud:      centroRef.lat + jitter(),
      longitud:     centroRef.lon + jitter(),
      display_name: `Fallback: centro de "${barrioLimpio}"`,
      confidence:   0,
      esFallback:   true,
    };
    console.log(`[Geocoding] 🔄 FALLBACK barrio "${barrioLimpio}": ${coords.latitud.toFixed(6)}, ${coords.longitud.toFixed(6)}`);
    // No cachear fallbacks — la dirección puede resolverse mejor más adelante
    return coords;
  }

  console.warn(`[Geocoding] ❌ SIN RESULTADO: "${direccion}" / barrio "${barrioLimpio}"`);
  return null;
}

// ── Geocodificación inversa ────────────────────────────────────
async function geocodificarInverso(latitud, longitud) {
  const cacheKey = `rev::${latitud}::${longitud}`;
  if (cache.has(cacheKey)) {
    const { data, timestamp } = cache.get(cacheKey);
    if (Date.now() - timestamp < CACHE_TTL) return data;
  }

  const espera = Math.max(0, 1100 - (Date.now() - ultimaPeticion));
  if (espera > 0) await delay(espera);
  ultimaPeticion = Date.now();

  try {
    const { data } = await axios.get('https://nominatim.openstreetmap.org/reverse', {
      params: { lat: latitud, lon: longitud, format: 'json', addressdetails: 1 },
      headers: { 'User-Agent': 'MedellinElectoralApp/1.0', 'Accept-Language': 'es' },
      timeout: 10000,
    });
    if (data) {
      const addr = data.address;
      const resultado = {
        display_name: data.display_name,
        calle:        addr.road || addr.pedestrian || '',
        barrio:       addr.neighbourhood || addr.suburb || addr.quarter || '',
        ciudad:       addr.city || addr.town || addr.village || '',
        departamento: addr.state || '',
      };
      cache.set(cacheKey, { data: resultado, timestamp: Date.now() });
      return resultado;
    }
  } catch (err) {
    console.error(`[Geocoding Inverso] Error: ${err.message}`);
  }
  return null;
}

// ── Normalización de direcciones colombianas ───────────────────
function normalizarDireccionColombia(dir) {
  if (!dir) return '';
  let s = dir.trim();

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

  // "97 C" → "97C" (fusionar número + letra sufijo)
  s = s.replace(/(\d+)\s+([A-Z])\b(?!\s*arrera|\s*alle|\s*venida|\s*iagonal|\s*ransversal)/gi,
    (_, num, letra) => `${num}${letra.toUpperCase()}`
  );

  s = s.replace(/\s*#\s*/g, ' #');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

function estadisticasCache() {
  return { entradas: cache.size, claves: Array.from(cache.keys()).slice(0, 10) };
}

module.exports = {
  geocodificar,
  geocodificarInverso,
  normalizarDireccionColombia,
  estaEnMedellin,
  distanciaKm,
  centroDeBarrio,
  estadisticasCache,
};
