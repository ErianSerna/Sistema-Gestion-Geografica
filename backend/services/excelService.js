// ============================================================
// services/excelService.js
// Importar y exportar Excel — plantilla 100% compatible
// ============================================================

const XLSX = require('xlsx');
const geocodingService = require('./geocodingService');
const Persona = require('../models/Persona');

// ── Columnas canónicas del sistema ───────────────────────────
// El export y la plantilla usan EXACTAMENTE estas cabeceras.
// El import las acepta en minúsculas, con o sin tilde, y en inglés.
const COLUMNAS_EXPORT = [
  'nombre', 'cedula', 'telefono', 'correo',
  'comuna', 'barrio', 'direccion',
  'latitud', 'longitud',
  'municipio', 'cuadrante', 'fecha_registro'
];

// Variantes aceptadas por columna al importar (todo en minúsculas)
const COLUMNAS_MAPA = {
  nombre:    ['nombre', 'name', 'nombres'],
  cedula:    ['cedula', 'cédula', 'cc', 'documento', 'id', 'cedula/id'],
  telefono:  ['telefono', 'teléfono', 'phone', 'celular', 'cel', 'tel'],
  correo:    ['correo', 'email', 'e-mail', 'mail'],
  comuna:    ['comuna', 'commune'],
  barrio:    ['barrio', 'neighborhood', 'sector'],
  direccion: ['direccion', 'dirección', 'address', 'dir'],
  latitud:   ['latitud', 'lat', 'latitude'],
  longitud:  ['longitud', 'lon', 'lng', 'longitude'],
  municipio: ['municipio', 'municipality', 'ciudad', 'city'],
  vota_pacto:['vota_pacto', 'vota', 'pacto', 'votante', 'vota pacto',
              'vota pacto histórico', 'vota pacto historico'],
};

function normalizarColumna(nombre) {
  const lower = String(nombre).toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // quitar tildes para comparar
  for (const [key, variantes] of Object.entries(COLUMNAS_MAPA)) {
    const variantesNorm = variantes.map(v =>
      v.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    );
    if (variantesNorm.includes(lower)) return key;
  }
  return null;
}

// ── IMPORTAR ─────────────────────────────────────────────────
async function importarDesdeExcel(buffer) {
  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  } catch (e) {
    throw new Error('No se pudo leer el archivo. Asegúrate de que sea un .xlsx válido.');
  }

  const hoja = workbook.Sheets[workbook.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json(hoja, { defval: '', raw: false });

  if (!filas.length) throw new Error('El archivo está vacío o no tiene datos.');

  // Mapear columnas originales → nombre interno
  const columnasOriginales = Object.keys(filas[0]);
  const mapeoColumnas = {};
  for (const col of columnasOriginales) {
    const norm = normalizarColumna(col);
    if (norm) mapeoColumnas[col] = norm;
  }

  console.log(`[Excel] Columnas originales:`, columnasOriginales);
  console.log(`[Excel] Mapeo detectado:`, mapeoColumnas);

  if (!Object.values(mapeoColumnas).includes('nombre') || !Object.values(mapeoColumnas).includes('cedula')) {
    throw new Error(
      `El archivo no tiene las columnas requeridas "nombre" y "cedula".\n` +
      `Columnas encontradas: ${columnasOriginales.join(', ')}`
    );
  }

  const personas = [];
  const erroresValidacion = [];

  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i];
    // Crear objeto limpio por fila — nunca reutilizar el de la iteración anterior
    const p = {};

    // Mapear valores de esta fila únicamente
    for (const [original, normalizado] of Object.entries(mapeoColumnas)) {
      p[normalizado] = fila[original];
    }

    // Omitir filas completamente vacías
    if (!p.nombre && !p.cedula) continue;

    // Validación básica
    if (!p.nombre || !String(p.nombre).trim()) {
      erroresValidacion.push({ fila: i+2, error: 'Nombre vacío' }); continue;
    }
    if (!p.cedula || !String(p.cedula).trim()) {
      erroresValidacion.push({ fila: i+2, error: 'Cédula vacía' }); continue;
    }

    // Limpiar cédula — solo dígitos
    p.cedula = String(p.cedula).replace(/\D/g, '');
    if (!p.cedula) {
      erroresValidacion.push({ fila: i+2, error: 'Cédula inválida (sin dígitos)' }); continue;
    }

    // Normalizar vota_pacto
    const votaRaw = String(p.vota_pacto ?? '').toLowerCase().trim();
    p.vota_pacto = ['si','sí','yes','1','true','x','✓','verdadero'].includes(votaRaw);

    // ── Coordenadas: leer SOLO de esta fila ─────────────────────────
    // Importante: limpiar explícitamente para que nunca hereden valores
    // de iteraciones anteriores si el campo viene vacío en esta fila.
    const latRaw = p.latitud  != null && String(p.latitud).trim()  !== '' ? parseFloat(p.latitud)  : NaN;
    const lonRaw = p.longitud != null && String(p.longitud).trim() !== '' ? parseFloat(p.longitud) : NaN;

    // Borrar los campos crudos — se sobreescribirán con valores numéricos limpios
    delete p.latitud;
    delete p.longitud;

    if (!isNaN(latRaw) && !isNaN(lonRaw) && Math.abs(latRaw) <= 90 && Math.abs(lonRaw) <= 180) {
      // Coordenadas válidas en el Excel — usarlas directamente
      p.latitud  = latRaw;
      p.longitud = lonRaw;
      console.log(`[Excel] Fila ${i+2}: coords del Excel → ${latRaw}, ${lonRaw}`);
    } else {
      // Sin coordenadas válidas — geocodificar la dirección de ESTA fila
      const direccionFila = p.direccion ? String(p.direccion).trim() : '';
      if (direccionFila) {
        console.log(`[Excel] Fila ${i+2}: geocodificando "${direccionFila}"...`);
        try {
          const coords = await geocodingService.geocodificar(
            direccionFila,
            p.barrio  ? String(p.barrio).trim()  : (p.comuna ? String(p.comuna).trim() : ''),
            'Medellín, Antioquia, Colombia'
          );
          if (coords && !isNaN(coords.latitud) && !isNaN(coords.longitud)) {
            p.latitud  = coords.latitud;
            p.longitud = coords.longitud;
            console.log(`[Excel] Fila ${i+2}: geocodificado → ${coords.latitud}, ${coords.longitud}`);
          } else {
            console.warn(`[Excel] Fila ${i+2}: geocoding sin resultado para "${direccionFila}"`);
            erroresValidacion.push({ fila: i+2, error: `No se pudo geocodificar: ${direccionFila}` });
            continue;
          }
        } catch (geoErr) {
          console.error(`[Excel] Fila ${i+2}: error geocodificando:`, geoErr.message);
          erroresValidacion.push({ fila: i+2, error: `Error geocodificando fila ${i+2}: ${geoErr.message}` });
          continue;
        }
      } else {
        erroresValidacion.push({ fila: i+2, error: `Fila ${i+2}: se necesita latitud/longitud o dirección` });
        continue;
      }
    }

    // Validación final: asegurarse de que latitud y longitud son números válidos
    if (typeof p.latitud !== 'number' || typeof p.longitud !== 'number' ||
        isNaN(p.latitud) || isNaN(p.longitud)) {
      erroresValidacion.push({ fila: i+2, error: `Coordenadas finales inválidas para fila ${i+2}` });
      continue;
    }

    personas.push(p);
  }

  if (!personas.length && !erroresValidacion.length) {
    throw new Error('No se encontraron filas con datos válidos.');
  }

  const resultados = await Persona.importarMasivo(personas);

  return {
    total_filas:         filas.length,
    procesados:          personas.length,
    exitosos:            resultados.exitosos.length,
    errores_bd:          resultados.errores,
    errores_validacion:  erroresValidacion,
    personas:            resultados.exitosos,
  };
}

// ── EXPORTAR ─────────────────────────────────────────────────
function exportarAExcel(personas) {
  // Las cabeceras coinciden EXACTAMENTE con COLUMNAS_MAPA para reimportación
  const filas = personas.map(p => ({
    nombre:      p.nombre        || '',
    cedula:      p.cedula        || '',
    telefono:    p.telefono      || '',
    correo:      p.correo        || '',
    comuna:      p.comuna        || '',
    barrio:      p.barrio        || '',
    direccion:   p.direccion     || '',
    latitud:     p.latitud != null ? parseFloat(p.latitud)  : '',
    longitud:    p.longitud != null ? parseFloat(p.longitud) : '',
    municipio:   p.municipio     || '',
    cuadrante:   p.cuadrante_nombre || '',
    fecha_registro: p.created_at
      ? new Date(p.created_at).toLocaleDateString('es-CO')
      : '',
  }));

  const workbook = XLSX.utils.book_new();
  const hoja = XLSX.utils.json_to_sheet(filas, { header: COLUMNAS_EXPORT });
  hoja['!cols'] = [
    {wch:30},{wch:15},{wch:15},{wch:30},
    {wch:15},{wch:20},{wch:40},{wch:12},
    {wch:12},{wch:15},{wch:20},{wch:18}
  ];
  XLSX.utils.book_append_sheet(workbook, hoja, 'Votantes');

  // Hoja resumen por comuna
  const resumen = {};
  for (const p of personas) {
    const k = p.comuna || '(sin comuna)';
    if (!resumen[k]) resumen[k] = { total: 0, pacto: 0 };
    resumen[k].total++;
    if (p.vota_pacto) resumen[k].pacto++;
  }
  const resumenFilas = Object.entries(resumen).map(([comuna, s]) => ({
    comuna, total: s.total, pacto: s.pacto,
    no_pacto: s.total - s.pacto,
    pct_pacto: s.total ? `${((s.pacto/s.total)*100).toFixed(1)}%` : '0%'
  }));
  const hojaR = XLSX.utils.json_to_sheet(resumenFilas);
  hojaR['!cols'] = [{wch:15},{wch:10},{wch:10},{wch:10},{wch:10}];
  XLSX.utils.book_append_sheet(workbook, hojaR, 'Resumen por Comuna');

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

// ── PLANTILLA ─────────────────────────────────────────────────
function generarPlantilla() {
  // Mismas cabeceras que el export para 100 % compatibilidad
  const ejemplo = [{
    nombre:         'Juan García',
    cedula:         '1234567890',
    telefono:       '3001234567',
    correo:         'ejemplo@correo.com',
    comuna:         'Laureles',
    barrio:         'Estadio',
    direccion:      'Carrera 50 # 45-20',
    latitud:        6.2518,
    longitud:       -75.5636,
    municipio:      'Medellín',
    cuadrante:      '',     // Solo lectura — se ignora al importar
    fecha_registro: '',     // Solo lectura — se ignora al importar
  }];

  const workbook = XLSX.utils.book_new();
  const hoja = XLSX.utils.json_to_sheet(ejemplo, { header: COLUMNAS_EXPORT });
  hoja['!cols'] = [
    {wch:30},{wch:15},{wch:15},{wch:30},
    {wch:15},{wch:20},{wch:40},{wch:12},
    {wch:12},{wch:15},{wch:20},{wch:18}
  ];
  XLSX.utils.book_append_sheet(workbook, hoja, 'Plantilla');

  // Hoja de instrucciones
  const instrucciones = [
    { columna: 'nombre',        descripcion: 'Nombre completo',         requerido: 'Sí' },
    { columna: 'cedula',        descripcion: 'Número de cédula',        requerido: 'Sí' },
    { columna: 'telefono',      descripcion: 'Número de teléfono',      requerido: 'No' },
    { columna: 'correo',        descripcion: 'Correo electrónico',      requerido: 'No' },
    { columna: 'comuna',        descripcion: 'Comuna de Medellín',      requerido: 'No' },
    { columna: 'barrio',        descripcion: 'Barrio',                  requerido: 'No' },
    { columna: 'direccion',     descripcion: 'Dirección del domicilio', requerido: 'Si no hay lat/lon' },
    { columna: 'latitud',       descripcion: 'Latitud WGS84',           requerido: 'Si no hay dirección' },
    { columna: 'longitud',      descripcion: 'Longitud WGS84',          requerido: 'Si no hay dirección' },
    { columna: 'municipio',     descripcion: 'Municipio',               requerido: 'No' },
    { columna: 'cuadrante',     descripcion: 'Solo lectura (ignorado)', requerido: 'No' },
    { columna: 'fecha_registro',descripcion: 'Solo lectura (ignorado)', requerido: 'No' },
  ];
  const hojaI = XLSX.utils.json_to_sheet(instrucciones);
  hojaI['!cols'] = [{wch:18},{wch:35},{wch:25}];
  XLSX.utils.book_append_sheet(workbook, hojaI, 'Instrucciones');

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { importarDesdeExcel, exportarAExcel, generarPlantilla };
