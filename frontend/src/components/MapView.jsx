// ============================================================
// frontend/src/components/MapView.jsx
// Mapa principal: cuadrantes + pines + KML persistente + modos
// ============================================================

import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../utils/api';
import { kmlToGeoJSON } from '../utils/kmlParser';
import toast from 'react-hot-toast';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const COMUNAS_MEDELLIN = [
  'Popular','Santa Cruz','Manrique','Aranjuez','Castilla',
  'Doce de Octubre','Robledo','Villa Hermosa','Buenos Aires',
  'La Candelaria','Laureles','La América','San Javier',
  'El Poblado','Guayabal','Belén','San Sebastián de Palmitas', 'San Cristóbal', 'Altavista',
  'San Antonio de Prado', 'Santa Elena'
];

const KML_COLORS = ['#7C3AED','#0891B2','#D97706','#059669','#DC2626','#DB2777','#2563EB','#65A30D'];

const CUAD_FORM_VACIO = { nombre: '', descripcion: '', barrio: '', comuna: '' };
// const CUAD_FORM_VACIO = { nombre: '', descripcion: '', barrio: '' };

const crearIcono = () => L.divIcon({
  className: '',
  html: `<div style="width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#2563EB;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`,
  iconSize: [26,26], iconAnchor: [13,26], popupAnchor: [0,-28],
});

function crearPopupDOM(p) {
  const div = document.createElement('div');
  div.style.cssText = 'min-width:200px;font-family:system-ui,sans-serif';
  const esc = (v) => String(v ?? '').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  div.innerHTML = `
    <p style="font-weight:600;font-size:14px;margin:0 0 4px">${esc(p.nombre)}</p>
    <p style="color:#666;font-size:12px;margin:0 0 6px">${esc(p.direccion)}</p>
    <div style="display:flex;gap:10px;font-size:12px;margin-bottom:6px">
      <span>📋 ${esc(p.cedula)}</span>
      <span>📞 ${esc(p.telefono)||'-'}</span>
    </div>
    ${p.correo ? `<div style="font-size:12px;margin-bottom:6px">✉️ ${esc(p.correo)}</div>` : ''}
    <div style="font-size:12px;margin-bottom:6px">
      <strong>Barrio:</strong> ${esc(p.barrio)||'-'} &nbsp;
      <strong>Comuna:</strong> ${esc(p.comuna)||'-'}
    </div>
    ${p.cuadrante ? `<div style="font-size:12px;margin-bottom:6px"><strong>Cuadrante:</strong> ${esc(p.cuadrante)}</div>` : ''}
  `;
  const btn = document.createElement('button');
  btn.textContent = '✏️ Editar';
  btn.style.cssText = 'display:block;width:100%;margin-top:8px;padding:5px;background:#2563EB;color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px;';
  btn.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('editar-persona', { detail: { persona: p } }));
  });
  div.appendChild(btn);
  return div;
}

// ── Cargar un KML desde texto y añadirlo al mapa ─────────────
// Las etiquetas se renderizan en kmlLabelPane (encima del fondo pero
// nunca bloqueando clicks sobre personas/cuadrantes).
// Comportamiento dinámico según zoom:
//   < 13  → solo etiquetas de capas "grandes" (comunas)
//   13-15 → todas las etiquetas
//   > 15  → etiquetas con descripción adicional
function cargarKmlEnMapa(map, kmlText, nombreArchivo, colorIdx, kmlLayersRef) {
  const { capas, errores } = kmlToGeoJSON(kmlText, nombreArchivo);
  if (errores.length) errores.forEach(e => console.warn('[KML]', e));
  if (!capas.length) return [];

  // Detectar tipo de capa por nombre de archivo (heurística)
  const nombreLower = nombreArchivo.toLowerCase();
  const esCapa_comunas = nombreLower.includes('comuna') || nombreLower.includes('PB_');
  const minZoomLabel   = esCapa_comunas ? 11 : 13; // comunas visibles antes

  const nuevasCapas = [];
  capas.forEach((capa, idx) => {
    const color = KML_COLORS[(colorIdx + idx) % KML_COLORS.length];
    const layerGroup = L.layerGroup().addTo(map);

    // Capa de polígonos — en kmlPane (sin eventos)
    const geoLayer = L.geoJSON(capa.geojson, {
      pane: 'kmlPane',
      style: () => ({ color, weight: 1.5, fillOpacity: 0.08, fillColor: color, pane: 'kmlPane' }),
      pointToLayer: (_, latlng) => L.circleMarker(latlng, {
        radius: 4, fillColor: color, fillOpacity: 0.7,
        color: '#fff', weight: 1, pane: 'kmlPane',
      }),
      onEachFeature: (feature, layer) => {
        const props = feature.properties || {};
        const nombre = props.NOMBRE || props.nombre || props.name || props.Name || '';
        const desc   = props.description || props.descripcion || '';
        if (nombre) {
          layer.bindTooltip(
            `<strong>${nombre}</strong>${desc ? '<br><span style="font-size:11px">${desc}</span>' : ''}`,
            { sticky: true, pane: 'tooltipPane' }
          );
        }
      },
    });
    geoLayer.addTo(layerGroup);

    // Capa de etiquetas permanentes — en kmlLabelPane (encima del fondo, sin eventos)
    const labelGroup = L.layerGroup();
    labelGroup.addTo(layerGroup);

    const renderizarEtiquetas = (zoom) => {
      labelGroup.clearLayers();
      if (zoom < minZoomLabel) return; // muy lejos → no mostrar

      capa.geojson.features?.forEach(feature => {
        const props = feature.properties || {};
        const nombre = props.NOMBRE || props.nombre || props.name || props.Name;
        if (!nombre) return;

        let centro = null;
        try {
          const bounds = L.geoJSON(feature).getBounds();
          if (bounds.isValid()) centro = bounds.getCenter();
        } catch (_) { return; }
        if (!centro) return;

        // Tamaño de fuente dinámico según zoom
        const fontSize = zoom >= 16 ? 13 : zoom >= 14 ? 11 : 10;
        const showDesc = zoom >= 15 && (props.description || props.descripcion);

        L.marker(centro, {
          pane: 'kmlLabelPane',
          icon: L.divIcon({
            className: '',
            html: `<div style="
              font-size:${fontSize}px;
              font-weight:600;
              color:#1e293b;
              text-shadow:0 0 3px white,0 0 3px white,0 0 3px white,0 0 3px white;
              white-space:nowrap;
              pointer-events:none;
              line-height:1.2;
            ">${nombre}${showDesc ? `<br><span style="font-size:${fontSize-2}px;font-weight:400">${props.description||props.descripcion}</span>` : ''}</div>`,
            iconSize:   [1, 1],
            iconAnchor: [0, 0],
          }),
          interactive: false, // nunca captura eventos
        }).addTo(labelGroup);
      });
    };

    // Renderizar al cargar y al cambiar zoom
    renderizarEtiquetas(map.getZoom());
    const onZoom = () => renderizarEtiquetas(map.getZoom());
    map.on('zoomend', onZoom);
    // Guardar cleanup en el layerGroup para poder eliminar el listener
    layerGroup._zoomHandler = onZoom;

    const nombre = capa.nombre || nombreArchivo.replace(/\.kml$/i,'');
    kmlLayersRef[nombre] = layerGroup;
    nuevasCapas.push({ nombre, visible: true, color, features: capa.geojson.features?.length ?? 0 });
  });
  return nuevasCapas;
}

export default function MapView({
  onMapClick, onPinClick, selectedPin,
  modoMapa,
  cuadranteEnCurso, onCuadranteEnCursoChange,
  onCuadranteGuardado, onCancelarCuadrante,
  recargarTrigger,   // número — cuando cambia, recarga pines+cuadrantes sin desmontar
}) {
  const mapRef           = useRef(null);
  const leafletMap       = useRef(null);
  const markersLayer     = useRef(null);
  const cuadrantesLayer  = useRef(null);
  const kmlLayersRef     = useRef({});
  const cuadPoliLayer    = useRef(null);
  const cuadPuntosLayer  = useRef(null);
  const filtrosRef          = useRef({ comuna: '' });
  const filtrosCuadRef      = useRef({ comuna: '', barrio: '' }); // filtros visuales de cuadrantes
  const kmlFileRef          = useRef(null);
  const mapInitialized      = useRef(false);
  // Edición de geometría desde el mapa
  const editGeomPoliLayer  = useRef(null);
  const editGeomPtosLayer  = useRef(null);
  // Cache de todos los cuadrantes para filtrado local
  const todosCuadrantesRef = useRef(null);

  const [filtros,          setFiltros]          = useState({ comuna: '' });
  const [filtrosCuad,      setFiltrosCuad]      = useState({ comuna: '', barrio: '' });
  const [loading,          setLoading]          = useState(false);
  const [kmlCapas,     setKmlCapas]     = useState(() => {
    try { return JSON.parse(localStorage.getItem('kmlCapas')) || []; } catch { return []; }
  });
  const [kmlLoading,   setKmlLoading]   = useState(false);
  const [cuadForm,     setCuadForm]     = useState(CUAD_FORM_VACIO);
  const [cuadErrores,  setCuadErrores]  = useState({});
  const [cuadGuardando,setCuadGuardando]= useState(false);
  const [barriosDisponibles, setBarriosDisponibles] = useState([]);
  // Estado para edición de geometría inline en el mapa
  const [editGeom, setEditGeom] = useState(null); // { id, nombre, puntos[] }

  const esModoCrearCuadrante = modoMapa === 'crear-cuadrante';
  const esModoEditGeom       = !!editGeom;

  // ── Renderizar cuadrantes en mapa (aplica filtros locales) ────
  const renderizarCuadrantes = useCallback((geojson, fCuad) => {
    if (!cuadrantesLayer.current) return;
    cuadrantesLayer.current.clearLayers();
    if (!geojson?.features?.length) return;

    // Filtrar features localmente — sin nueva petición al backend
    const features = geojson.features.filter(f => {
      const p = f.properties;
      if (fCuad.comuna && (p.comuna || '').toLowerCase() !== fCuad.comuna.toLowerCase()) return false;
      if (fCuad.barrio && (p.barrio  || '').toLowerCase() !== fCuad.barrio.toLowerCase())  return false;
      return true;
    });

    if (!features.length) return;

    L.geoJSON({ type: 'FeatureCollection', features }, {
        // Estilo base usando el color propio de cada cuadrante
        style: (feature) => {
          const color = feature.properties?.color || '#2563EB';
          return {
            color,
            weight:       2,
            opacity:      0.85,
            fillColor:    color,
            fillOpacity:  0.25,
          };
        },
        onEachFeature: (feature, layer) => {
          const p = feature.properties;
          const color = p.color || '#2563EB';

          // Tooltip con info del cuadrante
          layer.bindTooltip(
            `<div style="font-family:system-ui;min-width:140px">
              <strong style="font-size:13px">${p.nombre}</strong>
              ${p.barrio ? `<br><span style="font-size:11px;color:#666">${p.barrio}</span>` : ''}
              <br><span style="font-size:12px">👥 ${p.total_personas} personas</span>
            </div>`,
            { sticky: true }
          );

          // Hover — realzar borde y relleno
          layer.on('mouseover', () => layer.setStyle({
            weight: 3.5, fillOpacity: 0.45, opacity: 1,
          }));
          layer.on('mouseout', () => layer.setStyle({
            color, weight: 2, fillColor: color, fillOpacity: 0.25, opacity: 0.85,
          }));

          // Click — popup con opción de editar geometría
          layer.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            layer.setStyle({ weight: 4, fillOpacity: 0.55 });
            setTimeout(() => layer.setStyle({
              color, weight: 2, fillColor: color, fillOpacity: 0.25, opacity: 0.85,
            }), 1200);

            // Popup con botón "Editar geometría"
            const div = document.createElement('div');
            div.style.cssText = 'font-family:system-ui,sans-serif;min-width:170px';
            div.innerHTML = `
              <p style="font-weight:700;font-size:13px;margin:0 0 4px">${p.nombre}</p>
              ${p.barrio ? `<p style="font-size:11px;color:#666;margin:0 0 4px">${p.barrio}</p>` : ''}
              <p style="font-size:12px;margin:0 0 8px">👥 ${p.total_personas} personas</p>
            `;
            const btn = document.createElement('button');
            btn.textContent = '✏️ Editar geometría';
            btn.style.cssText = 'display:block;width:100%;padding:5px 0;background:#DC2626;color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;';
            btn.addEventListener('click', () => {
              layer.closePopup();
              window.dispatchEvent(new CustomEvent('editar-geom-cuadrante', { detail: { feature } }));
            });
            div.appendChild(btn);
            layer.bindPopup(div).openPopup(e.latlng);
          });
        },
      }).addTo(cuadrantesLayer.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cargar cuadrantes desde API, cachear y renderizar ───────
  const cargarCuadrantes = useCallback(async () => {
    if (!cuadrantesLayer.current) return;
    try {
      const { data } = await api.get('/cuadrantes'); // siempre trae TODOS
      todosCuadrantesRef.current = data;              // guardar cache completo
      renderizarCuadrantes(data, filtrosCuadRef.current);
    } catch (err) { console.error('Error cuadrantes:', err); }
  }, [renderizarCuadrantes]);

  // ── Cargar pines ────────────────────────────────────────────
  const cargarPines = useCallback(async (f) => {
    if (!markersLayer.current) return;
    setLoading(true);
    try {
      const params = {};
      if (f.comuna) params.comuna = f.comuna;
      const { data } = await api.get('/personas/geojson', { params });
      markersLayer.current.clearLayers();
      if (!data.features?.length) return;
      L.geoJSON(data, {
        pointToLayer: (feature, latlng) =>
          L.marker(latlng, { icon: crearIcono(), draggable: true }),
        onEachFeature: (feature, layer) => {
          const p = feature.properties;
          layer.bindPopup(() => crearPopupDOM(p), { maxWidth: 280 });
          layer.on('click', (e) => { L.DomEvent.stopPropagation(e); onPinClick(p); });

          // ── Drag & drop: guardar nueva posición al soltar ──────────
          layer.on('dragstart', () => {
            // Cerrar popup mientras se arrastra
            layer.closePopup();
          });

          layer.on('dragend', async (e) => {
            const { lat, lng } = e.target.getLatLng();
            const toastId = toast.loading(`Guardando posición de ${p.nombre}...`);
            try {
              await api.patch(`/personas/${p.id}/ubicacion`, {
                latitud:  lat,
                longitud: lng,
              });
              // Actualizar las propiedades del feature en memoria
              p.latitud  = lat;
              p.longitud = lng;
              toast.success(`📍 ${p.nombre} movido correctamente`, { id: toastId });
            } catch (err) {
              // Revertir el marcador a su posición original
              e.target.setLatLng([p.latitud, p.longitud]);
              toast.error('Error guardando la nueva posición', { id: toastId });
              console.error('[Drag] Error actualizando persona:', err);
            }
          });
        },
      }).addTo(markersLayer.current);
    } catch (err) {
      console.error('Error pines:', err);
      toast.error('Error cargando pines del servidor');
    } finally { setLoading(false); }
  }, [onPinClick]);

  // ── Cargar KMLs persistentes desde el servidor ──────────────
  const cargarKmlsIniciales = useCallback(async (map, capasGuardadas) => {
    try {
      const { data: lista } = await api.get('/kml');
      if (!lista.length) return;

      const nuevasCapas = [];
      for (const item of lista) {
        try {
          const resp = await fetch(item.url);
          if (!resp.ok) continue;
          const texto = await resp.text();
          const capas = cargarKmlEnMapa(map, texto, item.archivo, nuevasCapas.length, kmlLayersRef.current);
          
          // Aplicar estado de visibilidad guardado
          capas.forEach((capa) => {
            const capasGuardada = capasGuardadas.find(c => c.nombre === capa.nombre);
            if (capasGuardada !== undefined) {
              capa.visible = capasGuardada.visible;
              // Si está oculta, remover del mapa
              if (!capa.visible && kmlLayersRef.current[capa.nombre]) {
                map.removeLayer(kmlLayersRef.current[capa.nombre]);
              }
            }
          });
          
          nuevasCapas.push(...capas);
        } catch (e) { console.warn('[KML auto]', item.archivo, e.message); }
      }

      if (nuevasCapas.length) {
        setKmlCapas(nuevasCapas);
        console.log(`[KML] ${nuevasCapas.length} capa(s) cargadas automáticamente`);
      }
    } catch (e) { console.warn('[KML auto] No se pudo conectar al endpoint /api/kml'); }
  }, []);

  // ── Inicializar mapa ────────────────────────────────────────
  useEffect(() => {
    if (mapInitialized.current || !mapRef.current) return;
    mapInitialized.current = true;

    const map = L.map(mapRef.current, { center: [6.2518, -75.5636], zoom: 13 });

    // Pane KML polígonos — debajo de todo, sin eventos
    map.createPane('kmlPane');
    map.getPane('kmlPane').style.zIndex = 200;
    map.getPane('kmlPane').style.pointerEvents = 'none';

    // Pane etiquetas KML — encima del fondo, sin eventos
    map.createPane('kmlLabelPane');
    map.getPane('kmlLabelPane').style.zIndex = 250;
    map.getPane('kmlLabelPane').style.pointerEvents = 'none';

    L.tileLayer('https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png', {
      attribution: '© CartoDB © OpenStreetMap', maxZoom: 19,
    }).addTo(map);

    cuadrantesLayer.current    = L.layerGroup().addTo(map);
    markersLayer.current       = L.layerGroup().addTo(map);
    cuadPoliLayer.current      = L.layerGroup().addTo(map);
    cuadPuntosLayer.current    = L.layerGroup().addTo(map);
    editGeomPoliLayer.current  = L.layerGroup().addTo(map);
    editGeomPtosLayer.current  = L.layerGroup().addTo(map);
    leafletMap.current         = map;

    // Click en el mapa — delegar siempre al handler actual vía ref
    map.on('click', (e) => {
      if (e.originalEvent.target.closest('.leaflet-popup-content-wrapper')) return;
      if (e.originalEvent.target.closest('.leaflet-control')) return;
      onMapClick(e.latlng);
    });

    cargarCuadrantes();
    cargarPines(filtrosRef.current);
    cargarKmlsIniciales(map, kmlCapas);

    return () => {
      map.remove();
      leafletMap.current = markersLayer.current = cuadrantesLayer.current = null;
      cuadPoliLayer.current = cuadPuntosLayer.current = null;
      kmlLayersRef.current = {};
      mapInitialized.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Modo crear cuadrante: clicks agregan vértices ──────────
  useEffect(() => {
    const map = leafletMap.current;
    if (!map) return;
    if (!esModoCrearCuadrante) {
      cuadPoliLayer.current?.clearLayers();
      cuadPuntosLayer.current?.clearLayers();
      return;
    }
    const handler = (e) => {
      if (e.originalEvent.target.closest('.leaflet-popup-content-wrapper')) return;
      if (e.originalEvent.target.closest('.leaflet-control')) return;
      const pt = [e.latlng.lat, e.latlng.lng];
      onCuadranteEnCursoChange(prev => {
        if (!prev) return prev;
        const poli = [...(prev.poligono || []), pt];
        dibujarPreview(poli);
        return { ...prev, poligono: poli };
      });
    };
    map.on('click', handler);
    return () => map.off('click', handler);
  }, [esModoCrearCuadrante, onCuadranteEnCursoChange]);

  const dibujarPreview = (puntos) => {
    if (!cuadPoliLayer.current || !cuadPuntosLayer.current) return;
    cuadPoliLayer.current.clearLayers();
    cuadPuntosLayer.current.clearLayers();
    if (!puntos.length) return;
    puntos.forEach((p, i) => {
      L.marker(p, {
        icon: L.divIcon({
          className: '',
          html: `<div style="background:#F59E0B;color:white;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.3)">${i+1}</div>`,
          iconSize: [22,22], iconAnchor: [11,11],
        }),
      }).addTo(cuadPuntosLayer.current);
    });
    if (puntos.length >= 3)
      L.polygon(puntos, { color:'#F59E0B', weight:2.5, fillColor:'#FCD34D', fillOpacity:0.18 }).addTo(cuadPoliLayer.current);
    else if (puntos.length === 2)
      L.polyline(puntos, { color:'#F59E0B', weight:2 }).addTo(cuadPoliLayer.current);
  };

  useEffect(() => {
    if (esModoCrearCuadrante && cuadranteEnCurso) {
      dibujarPreview(cuadranteEnCurso.poligono || []);
    }
  }, [cuadranteEnCurso, esModoCrearCuadrante]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (esModoCrearCuadrante) {
      api.get('/cuadrantes/barrios')
        .then(({ data }) => setBarriosDisponibles(data || []))
        .catch(() => {});
    }
  }, [esModoCrearCuadrante]);

  useEffect(() => {
  if (!cuadForm.barrio) return;

  const encontrado = barriosDisponibles.find(
    b => b.barrio === cuadForm.barrio
  );

  if (encontrado && encontrado.comuna) {
    setCuadForm(prev => ({
      ...prev,
      comuna: encontrado.comuna
    }));
  } 
}, [cuadForm.barrio, barriosDisponibles]);

  const guardarCuadrante = async () => {
    const errs = {};
    if (!cuadForm.nombre.trim()) errs.nombre = 'Requerido';
    const poli = cuadranteEnCurso?.poligono || [];
    if (poli.length < 3) errs.poligono = 'Mínimo 3 puntos en el mapa';
    setCuadErrores(errs);
    if (Object.keys(errs).length > 0) return;

    setCuadGuardando(true);
    try {
      const coords = [...poli, poli[0]].map(([lat, lng]) => [lng, lat]);
      const resp = await api.post('/cuadrantes', {
        nombre:      cuadForm.nombre.trim(),
        descripcion: cuadForm.descripcion.trim() || null,
        barrio:      cuadForm.barrio.trim()       || null,  // ← hereda color del barrio

        comuna:      cuadForm.comuna || null, // 👈 ESTE ES EL CAMBIO CLAVE

        geometry:    { type: 'Polygon', coordinates: [coords] },
      });
      const asignadas = resp.data.personas_asignadas || 0;
      toast.success(`✅ Cuadrante "${cuadForm.nombre}" creado${asignadas ? ` — ${asignadas} personas asignadas` : ''}`);
      setCuadForm(CUAD_FORM_VACIO);
      setCuadErrores({});
      cargarCuadrantes();
      cargarPines(filtrosRef.current);
      onCuadranteGuardado();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error guardando cuadrante');
    } finally {
      setCuadGuardando(false);
    }
  };

  const deshacerPunto = () => {
    onCuadranteEnCursoChange(prev => {
      if (!prev) return prev;
      const poli = prev.poligono.slice(0,-1);
      dibujarPreview(poli);
      return { ...prev, poligono: poli };
    });
  };

  const limpiarPuntos = () => {
    onCuadranteEnCursoChange(prev => prev ? { ...prev, poligono: [] } : prev);
    cuadPoliLayer.current?.clearLayers();
    cuadPuntosLayer.current?.clearLayers();
  };

  // ── Edición de geometría de cuadrante desde el mapa ──────────
  const iniciarEditGeomMapa = (feature) => {
    const coords = feature.geometry?.coordinates?.[0] || [];
    const puntos = coords.slice(0, -1).map(([lng, lat]) => [lat, lng]);
    setEditGeom({ id: feature.properties.id, nombre: feature.properties.nombre, puntos });
  };

  const dibujarEditGeom = (puntos) => {
    if (!editGeomPoliLayer.current || !editGeomPtosLayer.current) return;
    editGeomPoliLayer.current.clearLayers();
    editGeomPtosLayer.current.clearLayers();
    if (!puntos.length) return;
    puntos.forEach((pt, i) => {
      const marker = L.marker(pt, {
        draggable: true,
        icon: L.divIcon({
          className: '',
          html: `<div style="background:#DC2626;color:white;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,.4);cursor:move">${i+1}</div>`,
          iconSize: [24,24], iconAnchor: [12,12],
        }),
      }).addTo(editGeomPtosLayer.current);
      marker.on('drag', (ev) => {
        const { lat, lng } = ev.target.getLatLng();
        const copia = [...puntos]; copia[i] = [lat, lng];
        editGeomPoliLayer.current.clearLayers();
        if (copia.length >= 3)
          L.polygon(copia, { color:'#DC2626', weight:2.5, fillColor:'#EF4444', fillOpacity:0.18 }).addTo(editGeomPoliLayer.current);
      });
      marker.on('dragend', (ev) => {
        const { lat, lng } = ev.target.getLatLng();
        setEditGeom(prev => {
          const nuevos = [...prev.puntos]; nuevos[i] = [lat, lng];
          dibujarEditGeom(nuevos);
          return { ...prev, puntos: nuevos };
        });
      });
    });
    if (puntos.length >= 3)
      L.polygon(puntos, { color:'#DC2626', weight:2.5, fillColor:'#EF4444', fillOpacity:0.18 }).addTo(editGeomPoliLayer.current);
    else if (puntos.length === 2)
      L.polyline(puntos, { color:'#DC2626', weight:2 }).addTo(editGeomPoliLayer.current);
  };

  // Dibujar/actualizar cuando cambian los puntos de edición
  useEffect(() => {
    if (!editGeom) {
      editGeomPoliLayer.current?.clearLayers();
      editGeomPtosLayer.current?.clearLayers();
      return;
    }
    // Redibujar con los puntos actuales
    if (editGeomPoliLayer.current && editGeomPtosLayer.current) {
      dibujarEditGeom(editGeom.puntos);
    }
    // Handler de click para agregar puntos en modo edición geom
    const map = leafletMap.current;
    if (!map) return;
    const clickHandler = (e) => {
      if (e.originalEvent.target.closest('.leaflet-popup-content-wrapper')) return;
      if (e.originalEvent.target.closest('.leaflet-control')) return;
      setEditGeom(prev => {
        if (!prev) return prev;
        const nuevos = [...prev.puntos, [e.latlng.lat, e.latlng.lng]];
        dibujarEditGeom(nuevos);
        return { ...prev, puntos: nuevos };
      });
    };
    map.on('click', clickHandler);
    return () => map.off('click', clickHandler);
  }, [editGeom?.id, editGeom?.puntos?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const cancelarEditGeom = () => {
    setEditGeom(null);
    editGeomPoliLayer.current?.clearLayers();
    editGeomPtosLayer.current?.clearLayers();
  };

  const guardarEditGeom = async () => {
    if (!editGeom || editGeom.puntos.length < 3) { toast.error('Mínimo 3 puntos'); return; }
    try {
      const coords = [...editGeom.puntos, editGeom.puntos[0]].map(([lat, lng]) => [lng, lat]);
      await api.put(`/cuadrantes/${editGeom.id}/geometria`, { geometry: { type:'Polygon', coordinates:[coords] } });
      toast.success(`✅ Geometría de "${editGeom.nombre}" actualizada`);
      cancelarEditGeom();
      cargarCuadrantes();
    } catch { toast.error('Error guardando geometría'); }
  };

  // Escuchar evento global del popup de cuadrante → iniciar edición de geometría
  useEffect(() => {
    const handler = (e) => {
      const { feature } = e.detail;
      const coords = feature.geometry?.coordinates?.[0] || [];
      const puntos = coords.slice(0, -1).map(([lng, lat]) => [lat, lng]);
      setEditGeom({ id: feature.properties.id, nombre: feature.properties.nombre, puntos });
    };
    window.addEventListener('editar-geom-cuadrante', handler);
    return () => window.removeEventListener('editar-geom-cuadrante', handler);
  }, []);

  // ── Persistir visibilidad KML en localStorage ───────────────
  useEffect(() => {
    try {
      const snapshot = kmlCapas.map(({ nombre, visible, color, features }) =>
        ({ nombre, visible, color, features })
      );
      localStorage.setItem('kmlCapas', JSON.stringify(snapshot));
    } catch (_) {}
  }, [kmlCapas]);

  // ── Recargar datos cuando recargarTrigger cambia ────────────
  useEffect(() => {
    if (!recargarTrigger || !leafletMap.current) return;
    cargarCuadrantes();
    cargarPines(filtrosRef.current);
  }, [recargarTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Filtros de personas ─────────────────────────────────────
  useEffect(() => {
    filtrosRef.current = filtros;
    if (!leafletMap.current) return;
    cargarPines(filtros);
  }, [filtros]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Filtros de cuadrantes (local, sin nueva petición) ───────
  useEffect(() => {
    filtrosCuadRef.current = filtrosCuad;
    if (!leafletMap.current || !todosCuadrantesRef.current) return;
    renderizarCuadrantes(todosCuadrantesRef.current, filtrosCuad);
  }, [filtrosCuad, renderizarCuadrantes]);

  useEffect(() => {
    if (selectedPin?.latitud && leafletMap.current) {
      leafletMap.current.setView([+selectedPin.latitud, +selectedPin.longitud], 16);
    }
  }, [selectedPin]);

  // ── Importar KML manual ─────────────────────────────────────
  const handleKmlImport = useCallback(async (e) => {
    const archivo = e.target.files?.[0];
    if (!archivo || !leafletMap.current) return;
    if (!archivo.name.toLowerCase().endsWith('.kml')) {
      toast.error('Solo se aceptan archivos .kml'); return;
    }
    setKmlLoading(true);
    try {
      const texto = await archivo.text();
      const colorIdx = Object.keys(kmlLayersRef.current).length;
      const nuevas = cargarKmlEnMapa(leafletMap.current, texto, archivo.name, colorIdx, kmlLayersRef.current);
      if (!nuevas.length) { toast.error('El KML no contiene geometrías válidas'); return; }

      // Aplicar estado de visibilidad guardado si existe
      nuevas.forEach((capa) => {
        const capaGuardada = kmlCapas.find(c => c.nombre === capa.nombre);
        if (capaGuardada !== undefined) {
          capa.visible = capaGuardada.visible;
          // Si está oculta, remover del mapa
          if (!capa.visible && kmlLayersRef.current[capa.nombre]) {
            leafletMap.current.removeLayer(kmlLayersRef.current[capa.nombre]);
          }
        }
      });

      setKmlCapas(prev => {
        // Evitar duplicados: reemplazar si ya existe con el mismo nombre
        const filtrado = prev.filter(c => !nuevas.find(n => n.nombre === c.nombre));
        return [...filtrado, ...nuevas];
      });
      toast.success(`✅ KML cargado: ${nuevas.reduce((a,c)=>a+c.features,0)} geometrías`);
    } catch (err) {
      console.error(err); toast.error('Error parseando el archivo KML');
    } finally {
      setKmlLoading(false);
      if (kmlFileRef.current) kmlFileRef.current.value = '';
    }
  }, [kmlCapas]);

  const toggleCapaKml = (nombre) => {
    const layer = kmlLayersRef.current[nombre];
    if (!layer || !leafletMap.current) return;
    setKmlCapas(prev => prev.map(c => {
      if (c.nombre !== nombre) return c;
      if (c.visible) leafletMap.current.removeLayer(layer);
      else           leafletMap.current.addLayer(layer);
      return { ...c, visible: !c.visible };
    }));
  };

  const eliminarCapaKml = (nombre) => {
    const layer = kmlLayersRef.current[nombre];
    if (layer && leafletMap.current) {
      if (layer._zoomHandler) leafletMap.current.off('zoomend', layer._zoomHandler);
      leafletMap.current.removeLayer(layer);
    }
    delete kmlLayersRef.current[nombre];
    setKmlCapas(prev => prev.filter(c => c.nombre !== nombre));
  };

  const nPuntos = cuadranteEnCurso?.poligono?.length || 0;
  const cursor  = esModoCrearCuadrante || esModoEditGeom ? 'crosshair' : '';

  // Barrios únicos de los cuadrantes cargados (para el selector)
  const barriosEnMapa = todosCuadrantesRef.current
    ? [...new Set(
        todosCuadrantesRef.current.features
          .map(f => f.properties.barrio)
          .filter(Boolean)
      )].sort()
    : [];

  // ── Render ──────────────────────────────────────────────────
  return (
    <div style={{ position:'relative', height:'100%' }}>

      {/* Toolbar */}
      <div className="map-toolbar">
        {/* Filtro personas por comuna */}
        <select
          value={filtros.comuna}
          onChange={e=>setFiltros(f=>({...f,comuna:e.target.value}))}
          className="filter-select"
          title="Filtrar personas por comuna"
        >
          <option value="">👥 Todas las comunas</option>
          {COMUNAS_MEDELLIN.map(c=><option key={c} value={c}>{c}</option>)}
        </select>

        {/* Divisor */}
        <span style={{color:'var(--border)',fontSize:'18px',lineHeight:1}}>│</span>

        {/* Filtro cuadrantes por comuna */}
        <select
          value={filtrosCuad.comuna}
          onChange={e => setFiltrosCuad(f => ({ ...f, comuna: e.target.value, barrio: '' }))}
          className="filter-select"
          title="Filtrar cuadrantes por comuna"
          style={{borderColor: filtrosCuad.comuna ? '#2563EB' : undefined}}
        >
          <option value="">🔲 Todas comunas</option>
          {COMUNAS_MEDELLIN.map(c=><option key={c} value={c}>{c}</option>)}
        </select>

        {/* Filtro cuadrantes por barrio */}
        <select
          value={filtrosCuad.barrio}
          onChange={e => setFiltrosCuad(f => ({ ...f, barrio: e.target.value }))}
          className="filter-select"
          title="Filtrar cuadrantes por barrio"
          style={{borderColor: filtrosCuad.barrio ? '#2563EB' : undefined}}
        >
          <option value="">🏘️ Todos los barrios</option>
          {barriosEnMapa.map(b=><option key={b} value={b}>{b}</option>)}
        </select>

        {/* Limpiar filtros de cuadrantes */}
        {(filtrosCuad.comuna || filtrosCuad.barrio) && (
          <button
            className="btn-secondary"
            onClick={() => setFiltrosCuad({ comuna: '', barrio: '' })}
            title="Quitar filtros de cuadrantes"
            style={{padding:'4px 8px',fontSize:'12px'}}
          >✕ Cuadrantes</button>
        )}

        <button className="btn-secondary" onClick={cargarCuadrantes} title="Recargar cuadrantes">🔄</button>
        <label className={`btn-secondary ${kmlLoading?'disabled':''}`} style={{cursor:'pointer',display:'flex',alignItems:'center',gap:'4px'}}>
          {kmlLoading?'⏳':'📂'} KML
          <input ref={kmlFileRef} type="file" accept=".kml" onChange={handleKmlImport} disabled={kmlLoading} style={{display:'none'}}/>
        </label>
        {loading && <span className="loading-badge">Cargando...</span>}
      </div>

      {/* Panel edición de geometría desde el mapa */}
      {esModoEditGeom && (
        <div style={{
          position:'absolute', top:'60px', right:'12px', zIndex:1100,
          background:'white', borderRadius:'10px', padding:'14px 16px',
          boxShadow:'0 4px 20px rgba(0,0,0,0.2)', width:'270px',
          fontFamily:'system-ui,sans-serif',
        }}>
          <p style={{margin:'0 0 8px',fontSize:'13px',fontWeight:700,color:'#DC2626'}}>
            🗺️ Editando geometría
          </p>
          <p style={{margin:'0 0 10px',fontSize:'12px',color:'#374151',fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
            {editGeom.nombre}
          </p>
          <div style={{background:'#FEF2F2',borderRadius:'6px',padding:'7px 10px',marginBottom:'10px',fontSize:'12px',color:'#7F1D1D'}}>
            <strong>Arrastra</strong> los puntos rojos para moverlos.<br/>
            <strong>Click en el mapa</strong> para agregar vértices.
          </div>
          <div style={{
            display:'flex',alignItems:'center',gap:'6px',marginBottom:'12px',
            background: editGeom.puntos.length>=3?'#DCFCE7':'#FEF9C3',
            padding:'5px 10px',borderRadius:'6px',fontSize:'12px',
            color: editGeom.puntos.length>=3?'#166534':'#92400E',fontWeight:500,
          }}>
            {editGeom.puntos.length} punto{editGeom.puntos.length!==1?'s':''} {editGeom.puntos.length>=3?'✅':'(mín. 3)'}
          </div>
          <div style={{display:'flex',gap:'6px',marginBottom:'8px'}}>
            <button
              onClick={() => setEditGeom(prev => {
                const nuevos = prev.puntos.slice(0,-1);
                setTimeout(() => dibujarEditGeom(nuevos), 0);
                return { ...prev, puntos: nuevos };
              })}
              disabled={editGeom.puntos.length===0}
              className="btn-secondary"
              style={{flex:1,padding:'5px',fontSize:'12px'}}
            >↩ Deshacer</button>
            <button
              onClick={() => setEditGeom(prev => {
                setTimeout(() => { editGeomPoliLayer.current?.clearLayers(); editGeomPtosLayer.current?.clearLayers(); }, 0);
                return { ...prev, puntos: [] };
              })}
              disabled={editGeom.puntos.length===0}
              className="btn-secondary"
              style={{flex:1,padding:'5px',fontSize:'12px'}}
            >🗑 Limpiar</button>
          </div>
          <div style={{display:'flex',gap:'6px'}}>
            <button onClick={cancelarEditGeom} className="btn-secondary" style={{flex:1,padding:'7px',fontSize:'12px'}}>
              Cancelar
            </button>
            <button
              onClick={guardarEditGeom}
              disabled={editGeom.puntos.length<3}
              style={{flex:1,padding:'7px',fontSize:'12px',background:'#DC2626',color:'white',border:'none',borderRadius:'6px',cursor:editGeom.puntos.length<3?'not-allowed':'pointer',fontWeight:600,opacity:editGeom.puntos.length<3?0.6:1}}
            >
              ✅ Guardar
            </button>
          </div>
        </div>
      )}

      {/* Panel creación de cuadrante */}
      {esModoCrearCuadrante && (
        <div style={{
          position:'absolute', top:'60px', left:'12px', zIndex:1100,
          background:'white', borderRadius:'10px', padding:'14px 16px',
          boxShadow:'0 4px 20px rgba(0,0,0,0.18)', width:'270px',
          fontFamily:'system-ui,sans-serif',
        }}>
          <p style={{margin:'0 0 10px',fontSize:'13px',fontWeight:700,color:'#F59E0B'}}>
            🔲 Nuevo cuadrante
          </p>

          {/* Estado puntos */}
          <div style={{background:'#FFF7ED',borderRadius:'6px',padding:'7px 10px',marginBottom:'10px',fontSize:'12px',color:'#92400E'}}>
            {nPuntos === 0
              ? '👆 Haz click en el mapa para agregar vértices'
              : `${nPuntos} punto${nPuntos!==1?'s':''} ${nPuntos>=3?'✅ listo':'(mínimo 3)'}`}
            {cuadErrores.poligono && <div style={{color:'#DC2626',marginTop:'3px'}}>{cuadErrores.poligono}</div>}
          </div>

          {nPuntos > 0 && (
            <div style={{display:'flex',gap:'6px',marginBottom:'10px'}}>
              <button onClick={deshacerPunto} className="btn-secondary" style={{flex:1,padding:'4px',fontSize:'12px'}}>↩ Deshacer</button>
              <button onClick={limpiarPuntos} className="btn-secondary" style={{flex:1,padding:'4px',fontSize:'12px'}}>🗑 Limpiar</button>
            </div>
          )}

          {/* Campo nombre */}
          <div style={{marginBottom:'8px'}}>
            <label style={{fontSize:'11px',fontWeight:600,color:'#374151',display:'block',marginBottom:'3px'}}>Nombre *</label>
            <input
              value={cuadForm.nombre}
              onChange={e=>{setCuadForm(f=>({...f,nombre:e.target.value}));setCuadErrores(er=>({...er,nombre:null}));}}
              placeholder="Ej: Zona Norte"
              style={{width:'100%',padding:'6px 9px',borderRadius:'6px',border:`1.5px solid ${cuadErrores.nombre?'#EF4444':'#D1D5DB'}`,fontSize:'12px',boxSizing:'border-box'}}
            />
            {cuadErrores.nombre && <span style={{fontSize:'11px',color:'#EF4444'}}>{cuadErrores.nombre}</span>}
          </div>

          {/* Selector de barrio con preview de color */}
          {(() => {
            const colorPreview = (() => {
              if (!cuadForm.barrio) return null;
              const encontrado = barriosDisponibles.find(b => b.barrio === cuadForm.barrio);
              if (encontrado) return encontrado.color;
              let hash = 0;
              for (let i = 0; i < cuadForm.barrio.length; i++) hash = (hash * 31 + cuadForm.barrio.charCodeAt(i)) >>> 0;
              const PALETA = ['#2563EB','#7C3AED','#0891B2','#D97706','#059669','#DC2626','#DB2777','#65A30D','#EA580C','#0D9488','#7C2D12','#1D4ED8','#6D28D9','#0E7490','#B45309'];
              return PALETA[hash % PALETA.length];
            })();
            return (
              <div style={{marginBottom:'8px'}}>
                <label style={{fontSize:'11px',fontWeight:600,color:'#374151',display:'flex',alignItems:'center',gap:'6px',marginBottom:'3px'}}>
                  Barrio
                  {colorPreview && (
                    <span style={{display:'inline-block',width:'12px',height:'12px',borderRadius:'3px',background:colorPreview,border:'1px solid rgba(0,0,0,.15)'}}/>
                  )}
                  <span style={{fontSize:'10px',color:'#9CA3AF',fontWeight:400}}>(hereda el color)</span>
                </label>
                {barriosDisponibles.length > 0 && (
                  <select
                    value={cuadForm.barrio}
                    onChange={e=>setCuadForm(f=>({...f,barrio:e.target.value}))}
                    style={{width:'100%',padding:'5px 8px',borderRadius:'6px',border:'1.5px solid #D1D5DB',fontSize:'12px',boxSizing:'border-box',marginBottom:'4px'}}
                  >
                    <option value="">— Seleccionar barrio existente —</option>
                    {barriosDisponibles.map(b=>(
                      <option key={b.barrio} value={b.barrio}>{b.barrio} ({b.total_cuadrantes})</option>
                    ))}
                  </select>
                )}
                <input
                  value={cuadForm.barrio}
                  onChange={e=>setCuadForm(f=>({...f,barrio:e.target.value}))}
                  placeholder={barriosDisponibles.length ? 'O escribe un barrio nuevo' : 'Nombre del barrio (opcional)'}
                  style={{width:'100%',padding:'5px 8px',borderRadius:'6px',border:'1.5px solid #D1D5DB',fontSize:'12px',boxSizing:'border-box'}}
                />
              </div>
            );
          })()}

          {/* 👇 AQUÍ VA COMUNA */}
          <div style={{marginBottom:'8px'}}>
            <label style={{
              fontSize:'11px',
              fontWeight:600,
              color:'#374151',
              display:'block',
              marginBottom:'3px'
            }}>
              Comuna
            </label>

            <select
              value={cuadForm.comuna}
              onChange={e=>setCuadForm(f=>({...f, comuna:e.target.value}))}
              style={{
                width:'100%',
                padding:'5px 8px',
                borderRadius:'6px',
                border:'1.5px solid #D1D5DB',
                fontSize:'12px',
                boxSizing:'border-box'
              }}
            >
              <option value="">— Seleccionar comuna —</option>
              {COMUNAS_MEDELLIN.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Campo descripción */}
          <div style={{marginBottom:'12px'}}>
            <label style={{fontSize:'11px',fontWeight:600,color:'#374151',display:'block',marginBottom:'3px'}}>Observación</label>
            <input
              value={cuadForm.descripcion}
              onChange={e=>setCuadForm(f=>({...f,descripcion:e.target.value}))}
              placeholder="Opcional"
              style={{width:'100%',padding:'6px 9px',borderRadius:'6px',border:'1.5px solid #D1D5DB',fontSize:'12px',boxSizing:'border-box'}}
            />
          </div>

          <div style={{display:'flex',gap:'8px'}}>
            <button onClick={onCancelarCuadrante} className="btn-secondary" style={{flex:1,padding:'7px',fontSize:'12px'}}>Cancelar</button>
            <button
              onClick={guardarCuadrante}
              disabled={cuadGuardando}
              style={{flex:1,padding:'7px',fontSize:'12px',background:'#F59E0B',color:'white',border:'none',borderRadius:'6px',cursor:'pointer',fontWeight:600,opacity:cuadGuardando?0.7:1}}
            >
              {cuadGuardando ? '...' : '✅ Crear'}
            </button>
          </div>
        </div>
      )}

      {/* Panel capas KML */}
      {kmlCapas.length > 0 && (
        <div className="kml-layers-panel">
          <p style={{fontSize:'11px',fontWeight:600,color:'var(--text-secondary)',marginBottom:'6px',textTransform:'uppercase',letterSpacing:'0.5px'}}>
            Capas KML
          </p>
          {kmlCapas.map(capa => (
            <div key={capa.nombre} className="kml-layer-item">
              <span className="kml-color-dot" style={{background:capa.color}}/>
              <span className="kml-layer-name" style={{opacity:capa.visible?1:0.4}} title={capa.nombre}>
                {capa.nombre}
                <span style={{fontSize:'10px',color:'var(--text-secondary)',marginLeft:'4px'}}>({capa.features})</span>
              </span>
              <button onClick={()=>toggleCapaKml(capa.nombre)} className="kml-btn" title={capa.visible?'Ocultar':'Mostrar'}>
                {capa.visible?'👁':'🙈'}
              </button>
              <button onClick={()=>eliminarCapaKml(capa.nombre)} className="kml-btn kml-btn--danger" title="Quitar capa">✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Leyenda */}
      <div className="map-legend">
        <div className="legend-item"><span className="pin-dot" style={{background:'#2563EB'}}/>Personas</div>
        <div className="legend-item"><span className="cuadrante-square"/>Cuadrante</div>
        <div className="legend-item" style={{color:'var(--text-secondary)',fontSize:'11px',fontStyle:'italic'}}>
          ✋ Arrastra un pin para moverlo
        </div>
      </div>

      <div ref={mapRef} style={{width:'100%',height:'100%',minHeight:'500px',cursor}} />
    </div>
  );
}
