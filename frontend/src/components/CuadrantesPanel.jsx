// ============================================================
// frontend/src/components/CuadrantesPanel.jsx
// - Filtros por barrio y comuna
// - Sin columna "Pacto"
// - Edición de geometría con puntos arrastrables
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../utils/api';
import toast from 'react-hot-toast';
import ConfirmDeleteModal from './ConfirmDeleteModal';

const COMUNAS_MEDELLIN = [
  'Popular','Santa Cruz','Manrique','Aranjuez','Castilla',
  'Doce de Octubre','Robledo','Villa Hermosa','Buenos Aires',
  'La Candelaria','Laureles','La América','San Javier',
  'El Poblado','Guayabal','Belén',
];

const FORM_INICIAL = { nombre: '', descripcion: '', barrio: '' };

export default function CuadrantesPanel() {
  const [cuadrantes,    setCuadrantes]    = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [modoCrear,     setModoCrear]     = useState(false);
  const [form,          setForm]          = useState(FORM_INICIAL);
  const [poligono,      setPoligono]      = useState([]);
  const [errores,       setErrores]       = useState({});
  const [guardando,     setGuardando]     = useState(false);
  const [deleteModal,   setDeleteModal]   = useState(null);
  const [editando,      setEditando]      = useState(null);
  const [importando,    setImportando]    = useState(false);
  const [barrios,       setBarrios]       = useState([]);
  const [editandoGeom,  setEditandoGeom]  = useState(null);
  // Filtros
  const [filtroComunas, setFiltroComunas] = useState('');
  const [filtroBarrio,  setFiltroBarrio]  = useState('');
  // Asignación masiva de comuna por barrio
  const [asignComuna,   setAsignComuna]   = useState({ barrio: '', comuna: '', guardando: false });
  const [backfilling,   setBackfilling]   = useState(false);

  const geojsonFileRef  = useRef(null);
  const mapRef          = useRef(null);
  const leafletMap      = useRef(null);
  const poliLayer       = useRef(null);
  const puntosLayer     = useRef(null);
  const mapEditRef      = useRef(null);
  const leafletEdit     = useRef(null);
  const poliEditLayer   = useRef(null);
  const ptosEditLayer   = useRef(null);

  // ── Cargar datos ───────────────────────────────────────────
  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/cuadrantes');
      setCuadrantes(data.features || []);
    } catch {
      toast.error('Error cargando cuadrantes');
    } finally {
      setLoading(false);
    }
  }, []);

  const cargarBarrios = useCallback(async () => {
    try {
      const { data } = await api.get('/cuadrantes/barrios');
      setBarrios(data || []);
    } catch {}
  }, []);

  useEffect(() => { cargar(); cargarBarrios(); }, [cargar, cargarBarrios]);

  // ── Filtrado de cuadrantes ─────────────────────────────────
  const cuadrantesFiltrados = cuadrantes.filter(f => {
    const p = f.properties;
    if (filtroComunas && p.comuna !== filtroComunas) return false;
    if (filtroBarrio  && (p.barrio || '') !== filtroBarrio)  return false;
    return true;
  });

  // Lista única de barrios y comunas de los cuadrantes cargados
  const barriosUnicos  = [...new Set(cuadrantes.map(f => f.properties.barrio).filter(Boolean))].sort();
  const comunasUnicas  = [...new Set(cuadrantes.map(f => f.properties.comuna).filter(Boolean))].sort();

  // ── Mapa de CREACIÓN ───────────────────────────────────────
  useEffect(() => {
    if (!modoCrear) {
      if (leafletMap.current) { leafletMap.current.remove(); leafletMap.current = null; }
      return;
    }
    const timer = setTimeout(() => {
      if (!mapRef.current || leafletMap.current) return;
      const map = L.map(mapRef.current, { center: [6.2518, -75.5636], zoom: 13 });
      L.tileLayer('https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png', {
        attribution: '© CartoDB', maxZoom: 19,
      }).addTo(map);
      poliLayer.current   = L.layerGroup().addTo(map);
      puntosLayer.current = L.layerGroup().addTo(map);

      api.get('/cuadrantes').then(({ data }) => {
        if (!data.features?.length) return;
        L.geoJSON(data, {
          style: f => { const c = f.properties?.color || '#94A3B8'; return { color: c, weight: 1.5, fillColor: c, fillOpacity: 0.12 }; },
        }).addTo(map);
      }).catch(() => {});

      map.on('click', (e) => {
        setPoligono(prev => {
          const nuevos = [...prev, [e.latlng.lat, e.latlng.lng]];
          dibujarPreview(nuevos);
          return nuevos;
        });
      });
      leafletMap.current = map;
    }, 120);

    return () => {
      clearTimeout(timer);
      if (leafletMap.current) { leafletMap.current.remove(); leafletMap.current = null; }
    };
  }, [modoCrear]);

  const dibujarPreview = (puntos) => {
    if (!poliLayer.current || !puntosLayer.current) return;
    poliLayer.current.clearLayers();
    puntosLayer.current.clearLayers();
    puntos.forEach((p, i) => {
      L.marker(p, {
        icon: L.divIcon({
          className: '',
          html: `<div style="background:#2563EB;color:white;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3)">${i+1}</div>`,
          iconSize: [20,20], iconAnchor: [10,10],
        }),
      }).addTo(puntosLayer.current);
    });
    if (puntos.length >= 3)
      L.polygon(puntos, { color:'#2563EB', weight:2, fillColor:'#3B82F6', fillOpacity:0.15 }).addTo(poliLayer.current);
    else if (puntos.length === 2)
      L.polyline(puntos, { color:'#2563EB', weight:2 }).addTo(poliLayer.current);
  };

  const deshacer = () => setPoligono(prev => { const n = prev.slice(0,-1); dibujarPreview(n); return n; });
  const limpiar  = () => { setPoligono([]); poliLayer.current?.clearLayers(); puntosLayer.current?.clearLayers(); };
  const cancelar = () => { setModoCrear(false); setForm(FORM_INICIAL); setErrores({}); setPoligono([]); };
  const cambiar  = (e) => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
    setErrores(er => ({ ...er, [name]: null }));
  };

  const colorPreviewForm = (() => {
    if (!form.barrio) return null;
    const encontrado = barrios.find(b => b.barrio === form.barrio);
    if (encontrado) return encontrado.color;
    let hash = 0;
    for (let i = 0; i < form.barrio.length; i++) hash = (hash * 31 + form.barrio.charCodeAt(i)) >>> 0;
    const PALETA = ['#2563EB','#7C3AED','#0891B2','#D97706','#059669','#DC2626','#DB2777','#65A30D','#EA580C','#0D9488','#7C2D12','#1D4ED8','#6D28D9','#0E7490','#B45309'];
    return PALETA[hash % PALETA.length];
  })();

  const validar = () => {
    const e = {};
    if (!form.nombre.trim()) e.nombre   = 'Requerido';
    if (poligono.length < 3) e.poligono = 'Necesita al menos 3 puntos en el mapa';
    setErrores(e);
    return Object.keys(e).length === 0;
  };

  const guardar = async (ev) => {
    ev.preventDefault();
    if (!validar()) return;
    setGuardando(true);
    try {
      const coords = [...poligono, poligono[0]].map(([lat, lng]) => [lng, lat]);
      const resp = await api.post('/cuadrantes', {
        nombre:      form.nombre.trim(),
        descripcion: form.descripcion?.trim() || null,
        barrio:      form.barrio?.trim()       || null,
        geometry:    { type: 'Polygon', coordinates: [coords] },
      });
      const asignadas = resp.data.personas_asignadas || 0;
      toast.success(`✅ "${form.nombre}" creado${asignadas ? ` — ${asignadas} personas asignadas` : ''}`);
      cancelar();
      cargar();
      cargarBarrios();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error guardando cuadrante');
    } finally { setGuardando(false); }
  };

  const eliminar          = (id, nombre) => setDeleteModal({ id, nombre });
  const confirmarEliminar = async () => {
    try {
      await api.delete(`/cuadrantes/${deleteModal.id}`);
      toast.success('Cuadrante eliminado');
      setDeleteModal(null);
      cargar();
    } catch { toast.error('Error eliminando'); }
  };

  const guardarEdicion = async () => {
    if (!editando?.nombre?.trim()) return;
    try {
      await api.patch(`/cuadrantes/${editando.id}`, { nombre: editando.nombre.trim(), descripcion: editando.descripcion || '' });
      const cuadranteActual = cuadrantes.find(f => f.properties.id === editando.id);
      if (cuadranteActual && cuadranteActual.properties.barrio !== editando.barrio) {
        await api.patch(`/cuadrantes/${editando.id}/barrio`, { barrio: editando.barrio || null });
      }
      toast.success('✅ Cuadrante actualizado');
      setEditando(null);
      cargar();
      cargarBarrios();
    } catch { toast.error('Error actualizando'); }
  };

  // Asignar masivamente una comuna a todos los cuadrantes de un barrio
  const asignarComunaPorBarrio = async () => {
    if (!asignComuna.barrio || !asignComuna.comuna) {
      toast.error('Selecciona barrio y comuna'); return;
    }
    setAsignComuna(prev => ({ ...prev, guardando: true }));
    try {
      const { data } = await api.patch(
        `/cuadrantes/barrio/${encodeURIComponent(asignComuna.barrio)}/comuna`,
        { comuna: asignComuna.comuna }
      );
      toast.success(`✅ ${data.actualizados} cuadrantes de "${asignComuna.barrio}" → ${asignComuna.comuna}`);
      setAsignComuna({ barrio: '', comuna: '', guardando: false });
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error asignando comuna');
      setAsignComuna(prev => ({ ...prev, guardando: false }));
    }
  };

  // Generar códigos para cuadrantes sin código
  const ejecutarBackfill = async () => {
    setBackfilling(true);
    try {
      const { data } = await api.post('/cuadrantes/backfill-codigos');
      toast.success(`✅ ${data.actualizados} cuadrantes con código generado`);
      cargar();
    } catch (err) {
      toast.error('Error generando códigos');
    } finally { setBackfilling(false); }
  };

  const cambiarColor = async (id, color) => {
    try {
      await api.patch(`/cuadrantes/${id}/color`, { color });
      setCuadrantes(prev => prev.map(f =>
        f.properties.id === id ? { ...f, properties: { ...f.properties, color } } : f
      ));
    } catch { toast.error('Error cambiando color'); }
  };

  const cambiarColorBarrio = async (barrio, color) => {
    try {
      await api.patch(`/cuadrantes/barrio/${encodeURIComponent(barrio)}/color`, { color });
      setCuadrantes(prev => prev.map(f =>
        f.properties.barrio === barrio ? { ...f, properties: { ...f.properties, color } } : f
      ));
    } catch { toast.error('Error cambiando color del barrio'); }
  };

  // ── Edición de GEOMETRÍA ───────────────────────────────────
  const iniciarEdicionGeometria = (f) => {
    const coords = f.geometry?.coordinates?.[0] || [];
    const puntos = coords.slice(0, -1).map(([lng, lat]) => [lat, lng]);
    setEditandoGeom({ id: f.properties.id, nombre: f.properties.nombre, puntos });
  };

  const cerrarEdicionGeom = () => {
    setEditandoGeom(null);
    if (leafletEdit.current) { leafletEdit.current.remove(); leafletEdit.current = null; }
  };

  const guardarGeometria = async () => {
    if (!editandoGeom || editandoGeom.puntos.length < 3) { toast.error('Mínimo 3 puntos'); return; }
    try {
      const coords = [...editandoGeom.puntos, editandoGeom.puntos[0]].map(([lat, lng]) => [lng, lat]);
      await api.put(`/cuadrantes/${editandoGeom.id}/geometria`, { geometry: { type: 'Polygon', coordinates: [coords] } });
      toast.success('✅ Geometría actualizada');
      cerrarEdicionGeom();
      cargar();
    } catch { toast.error('Error guardando geometría'); }
  };

  useEffect(() => {
    if (!editandoGeom) {
      if (leafletEdit.current) { leafletEdit.current.remove(); leafletEdit.current = null; }
      return;
    }
    const timer = setTimeout(() => {
      if (!mapEditRef.current || leafletEdit.current) return;
      const centro = editandoGeom.puntos.length ? editandoGeom.puntos[0] : [6.2518, -75.5636];
      const map = L.map(mapEditRef.current, { center: centro, zoom: 15 });
      L.tileLayer('https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png', {
        attribution: '© CartoDB', maxZoom: 19,
      }).addTo(map);
      poliEditLayer.current = L.layerGroup().addTo(map);
      ptosEditLayer.current = L.layerGroup().addTo(map);

      const redibujar = (pts) => {
        poliEditLayer.current.clearLayers();
        ptosEditLayer.current.clearLayers();
        pts.forEach((pt, i) => {
          const marker = L.marker(pt, {
            draggable: true,
            icon: L.divIcon({
              className: '',
              html: `<div style="background:#DC2626;color:white;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);cursor:move">${i+1}</div>`,
              iconSize: [24,24], iconAnchor: [12,12],
            }),
          }).addTo(ptosEditLayer.current);

          marker.on('drag', (ev) => {
            const { lat, lng } = ev.target.getLatLng();
            const copia = [...pts]; copia[i] = [lat, lng];
            poliEditLayer.current.clearLayers();
            if (copia.length >= 3)
              L.polygon(copia, { color:'#DC2626', weight:2, fillColor:'#EF4444', fillOpacity:0.15 }).addTo(poliEditLayer.current);
          });

          marker.on('dragend', (ev) => {
            const { lat, lng } = ev.target.getLatLng();
            setEditandoGeom(prev => {
              const nuevos = [...prev.puntos]; nuevos[i] = [lat, lng];
              redibujar(nuevos);
              return { ...prev, puntos: nuevos };
            });
          });
        });
        if (pts.length >= 3)
          L.polygon(pts, { color:'#DC2626', weight:2, fillColor:'#EF4444', fillOpacity:0.15 }).addTo(poliEditLayer.current);
        else if (pts.length === 2)
          L.polyline(pts, { color:'#DC2626', weight:2 }).addTo(poliEditLayer.current);
      };

      redibujar(editandoGeom.puntos);
      map.on('click', (e) => {
        setEditandoGeom(prev => {
          const nuevos = [...prev.puntos, [e.latlng.lat, e.latlng.lng]];
          redibujar(nuevos);
          return { ...prev, puntos: nuevos };
        });
      });
      leafletEdit.current = map;
    }, 150);
    return () => { clearTimeout(timer); };
  }, [editandoGeom?.id]);

  const handleGeoJSONImport = async (e) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    if (!archivo.name.toLowerCase().match(/\.(geojson|json)$/)) { toast.error('Solo .geojson o .json'); return; }
    setImportando(true);
    try {
      const texto = await archivo.text();
      let geojson;
      try { geojson = JSON.parse(texto); } catch { toast.error('JSON inválido'); return; }
      if (geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) { toast.error('No es un FeatureCollection'); return; }
      const features = geojson.features.filter(f => f.geometry && ['Polygon','MultiPolygon'].includes(f.geometry.type));
      if (!features.length) { toast.error('Sin features Polygon/MultiPolygon'); return; }
      const nombreArchivo = archivo.name.replace(/\.(geojson|json)$/i, '');
      const { data } = await api.post('/cuadrantes/importar-geojson', { features, nombreArchivo });
      toast.success(`✅ ${data.exitosos.length} cuadrantes importados`);
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error importando');
    } finally {
      setImportando(false);
      if (geojsonFileRef.current) geojsonFileRef.current.value = '';
    }
  };

  // ── Agrupar cuadrantes filtrados por barrio ────────────────
  const grupos = {};
  cuadrantesFiltrados.forEach(f => {
    const barrio = f.properties.barrio || '__manual__';
    if (!grupos[barrio]) grupos[barrio] = [];
    grupos[barrio].push(f);
  });

  // Barrios únicos de todos los cuadrantes (para el selector de asignación)
  // const barriosUnicos = [...new Set(cuadrantes.map(f => f.properties.barrio).filter(Boolean))].sort();
  // Cuadrantes sin código (para mostrar aviso de backfill)
  const sinCodigo = cuadrantes.filter(f => !f.properties.codigo).length;
  // Cuadrantes sin comuna
  const sinComuna = cuadrantes.filter(f => !f.properties.comuna).length;

  return (
    <>
    <div className="cuadrantes-panel">

      {/* Encabezado */}
      <div className="panel-header">
        <div>
          <h2>🔲 Gestión de cuadrantes</h2>
          <p className="panel-desc">Crea, filtra y edita cuadrantes.</p>
        </div>
        {!modoCrear && (
          <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
            <label className={`btn-secondary ${importando?'disabled':''}`}
              style={{ cursor:'pointer', display:'flex', alignItems:'center', gap:'5px' }}>
              {importando?'⏳':'📥'} Importar GeoJSON
              <input ref={geojsonFileRef} type="file" accept=".geojson,.json"
                onChange={handleGeoJSONImport} disabled={importando} style={{ display:'none' }} />
            </label>
            <button className="btn-primary" onClick={() => setModoCrear(true)}>+ Nuevo cuadrante</button>
          </div>
        )}
      </div>

      {/* ── Panel de mantenimiento ─────────────────────────────── */}
      {!modoCrear && (sinCodigo > 0 || sinComuna > 0) && (
        <div style={{
          background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '10px',
          padding: '14px 16px', marginBottom: '16px',
        }}>
          <p style={{ margin: '0 0 12px', fontWeight: 600, fontSize: '13px', color: '#92400E' }}>
            ⚠️ Mantenimiento necesario
            {sinCodigo > 0 && ` — ${sinCodigo} cuadrante${sinCodigo > 1 ? 's' : ''} sin código`}
            {sinComuna > 0 && ` — ${sinComuna} cuadrante${sinComuna > 1 ? 's' : ''} sin comuna`}
          </p>

          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'flex-start' }}>

            {/* Backfill de códigos */}
            {sinCodigo > 0 && (
              <div>
                <p style={{ margin: '0 0 6px', fontSize: '12px', color: '#374151', fontWeight: 500 }}>
                  Generar códigos faltantes (formato C1-Barrio):
                </p>
                <button
                  className="btn-secondary"
                  onClick={ejecutarBackfill}
                  disabled={backfilling}
                  style={{ fontSize: '12px', padding: '6px 14px' }}
                >
                  {backfilling ? '⏳ Generando...' : '🔧 Generar códigos'}
                </button>
              </div>
            )}

            {/* Asignación masiva de comuna por barrio */}
            {sinComuna > 0 && (
              <div style={{ flex: 1, minWidth: '280px' }}>
                <p style={{ margin: '0 0 6px', fontSize: '12px', color: '#374151', fontWeight: 500 }}>
                  Asignar comuna a todos los cuadrantes de un barrio:
                </p>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <select
                    value={asignComuna.barrio}
                    onChange={e => setAsignComuna(prev => ({ ...prev, barrio: e.target.value }))}
                    className="filter-select"
                    style={{ minWidth: '150px' }}
                  >
                    <option value="">Seleccionar barrio</option>
                    {barriosUnicos.map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>

                  <select
                    value={asignComuna.comuna}
                    onChange={e => setAsignComuna(prev => ({ ...prev, comuna: e.target.value }))}
                    className="filter-select"
                    style={{ minWidth: '150px' }}
                  >
                    <option value="">Seleccionar comuna</option>
                    {COMUNAS_MEDELLIN.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>

                  <button
                    className="btn-primary"
                    onClick={asignarComunaPorBarrio}
                    disabled={asignComuna.guardando || !asignComuna.barrio || !asignComuna.comuna}
                    style={{ fontSize: '12px', padding: '6px 14px' }}
                  >
                    {asignComuna.guardando ? '⏳...' : '✅ Asignar comuna'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Filtros ─────────────────────────────────────────── */}
      {!modoCrear && (
        <div style={{ display:'flex', gap:'10px', marginBottom:'14px', flexWrap:'wrap', alignItems:'center' }}>
          <select
            value={filtroComunas}
            onChange={e => setFiltroComunas(e.target.value)}
            className="filter-select"
            style={{ minWidth:'160px' }}
          >
            <option value="">Todas las comunas</option>
            {comunasUnicas.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select
            value={filtroBarrio}
            onChange={e => setFiltroBarrio(e.target.value)}
            className="filter-select"
            style={{ minWidth:'160px' }}
          >
            <option value="">Todos los barrios</option>
            {barriosUnicos.map(b => <option key={b} value={b}>{b}</option>)}
          </select>

          {(filtroComunas || filtroBarrio) && (
            <button
              className="btn-secondary"
              onClick={() => { setFiltroComunas(''); setFiltroBarrio(''); }}
              style={{ fontSize:'12px', padding:'4px 10px' }}
            >
              ✕ Limpiar filtros
            </button>
          )}

          <span style={{ fontSize:'13px', color:'var(--text-secondary)', marginLeft:'auto' }}>
            {cuadrantesFiltrados.length} de {cuadrantes.length} cuadrantes
          </span>
        </div>
      )}

      {/* Formulario de creación */}
      {modoCrear && (
        <div className="cuadrante-form-card">
          <h3 style={{ marginBottom:'16px', fontWeight:500, fontSize:'16px' }}>Nuevo cuadrante</h3>
          <div className="form-grid" style={{ marginBottom:'14px' }}>
            <div className="form-field">
              <label>Nombre *</label>
              <input name="nombre" value={form.nombre} onChange={cambiar} placeholder="Ej: Zona Norte" />
              {errores.nombre && <span className="form-error">{errores.nombre}</span>}
            </div>
            <div className="form-field">
              <label>Observación</label>
              <input name="descripcion" value={form.descripcion||''} onChange={cambiar} placeholder="Opcional" />
            </div>
            <div className="form-field form-field--full">
              <label style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                Barrio
                {colorPreviewForm && (
                  <span style={{ display:'inline-block', width:'14px', height:'14px', borderRadius:'3px', background:colorPreviewForm, border:'1px solid rgba(0,0,0,0.15)' }} />
                )}
                <span style={{ fontSize:'11px', color:'var(--text-secondary)', fontWeight:400 }}>(hereda color)</span>
              </label>
              <div style={{ display:'flex', gap:'8px' }}>
                <select name="barrio" value={form.barrio} onChange={cambiar}
                  style={{ flex:1, padding:'6px 9px', borderRadius:'6px', border:'1.5px solid #D1D5DB', fontSize:'13px' }}>
                  <option value="">Sin barrio</option>
                  {barrios.map(b => <option key={b.barrio} value={b.barrio}>{b.barrio} ({b.total_cuadrantes})</option>)}
                </select>
                <input name="barrio" value={form.barrio} onChange={cambiar} placeholder="O escribe uno nuevo"
                  style={{ flex:1, padding:'6px 9px', borderRadius:'6px', border:'1.5px solid #D1D5DB', fontSize:'13px' }} />
              </div>
            </div>
          </div>

          <div>
            <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'8px' }}>
              <label style={{ fontSize:'12px', fontWeight:500, color:'var(--text-secondary)' }}>
                Dibuja el cuadrante (click en el mapa) *
              </label>
              <span style={{ fontSize:'12px', color:poligono.length>=3?'#2C9A5E':'var(--text-secondary)', marginLeft:'auto' }}>
                {poligono.length===0?'Haz click para comenzar':`${poligono.length} punto${poligono.length!==1?'s':''} ${poligono.length>=3?'✅':'(mín. 3)'}`}
              </span>
              {poligono.length > 0 && (
                <>
                  <button type="button" onClick={deshacer} className="btn-secondary" style={{ padding:'3px 10px', fontSize:'12px' }}>↩ Deshacer</button>
                  <button type="button" onClick={limpiar}  className="btn-secondary" style={{ padding:'3px 10px', fontSize:'12px' }}>🗑 Limpiar</button>
                </>
              )}
            </div>
            {errores.poligono && <span className="form-error" style={{ display:'block', marginBottom:'6px' }}>{errores.poligono}</span>}
            <div ref={mapRef} style={{ width:'100%', height:'340px', borderRadius:'8px', border:'0.5px solid var(--border)' }} />
          </div>

          <div className="form-actions" style={{ marginTop:'16px' }}>
            <button type="button" onClick={cancelar} className="btn-secondary">Cancelar</button>
            <button onClick={guardar} className="btn-primary" disabled={guardando}>
              {guardando?'Guardando...':'✅ Crear cuadrante'}
            </button>
          </div>
        </div>
      )}

      {/* Tabla */}
      {loading ? (
        <div className="loading-state">Cargando cuadrantes...</div>
      ) : cuadrantes.length === 0 ? (
        <div style={{ textAlign:'center', padding:'48px 20px', color:'var(--text-secondary)' }}>
          <div style={{ fontSize:'36px', marginBottom:'10px' }}>🗺️</div>
          <p style={{ fontWeight:500, marginBottom:'6px' }}>Sin cuadrantes definidos</p>
          <p style={{ fontSize:'13px' }}>Usa <strong>"+ Nuevo cuadrante"</strong> o <strong>"Importar GeoJSON"</strong>.</p>
        </div>
      ) : cuadrantesFiltrados.length === 0 ? (
        <div style={{ textAlign:'center', padding:'32px', color:'var(--text-secondary)' }}>
          <p>Ningún cuadrante coincide con los filtros.</p>
          <button className="btn-secondary" onClick={() => { setFiltroComunas(''); setFiltroBarrio(''); }} style={{ marginTop:'8px' }}>
            Limpiar filtros
          </button>
        </div>
      ) : (
        <div style={{ overflowX:'auto', marginTop:'8px' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width:'34px' }}>Color</th>
                <th>Nombre</th>
                <th>Código</th>
                <th>Comuna</th>
                <th>Barrio/Origen</th>
                <th>Observación</th>
                <th>Personas</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(grupos).map(([barrio, items]) => {
                const colorBarrio  = items[0].properties.color || '#2563EB';
                const esImportado  = barrio !== '__manual__';

                return items.map((f, idx) => {
                  const p            = f.properties;
                  const esEditando   = editando?.id === p.id;
                  const esPrimera    = idx === 0;

                  return (
                    <tr key={p.id} style={esPrimera && idx > 0 ? { borderTop:'2px solid #E2E8F0' } : {}}>

                      <td>
                        {esPrimera && esImportado ? (
                          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'2px' }}>
                            <input type="color" defaultValue={colorBarrio}
                              onBlur={e => cambiarColorBarrio(barrio, e.target.value)}
                              title={`Color del barrio "${barrio}" (cambia todos)`}
                              style={{ width:'28px', height:'28px', border:'2px solid #94A3B8', borderRadius:'5px', cursor:'pointer', padding:'1px', background:'none' }} />
                            {items.length > 1 && <span style={{ fontSize:'9px', color:'var(--text-secondary)' }}>×{items.length}</span>}
                          </div>
                        ) : (
                          <input type="color" defaultValue={p.color||'#2563EB'}
                            onBlur={e => cambiarColor(p.id, e.target.value)}
                            title="Color individual"
                            style={{ width:'28px', height:'28px', border:'none', borderRadius:'4px', cursor:'pointer', padding:'2px', background:'none' }} />
                        )}
                      </td>

                      <td style={{ fontWeight:500 }}>
                        {esEditando ? (
                          <input value={editando.nombre}
                            onChange={e => setEditando(prev => ({...prev, nombre:e.target.value}))}
                            onKeyDown={e => { if (e.key==='Enter') guardarEdicion(); if (e.key==='Escape') setEditando(null); }}
                            autoFocus
                            style={{ width:'100%', padding:'3px 7px', borderRadius:'5px', border:'1.5px solid #2563EB', fontSize:'13px' }} />
                        ) : p.nombre}
                      </td>

                      <td style={{ fontFamily:'monospace', fontSize:'12px', color:'var(--text-secondary)' }}>
                        {p.codigo || '-'}
                      </td>

                      {/* Comuna */}
                      <td style={{ fontSize:'13px', color:'var(--text-secondary)' }}>
                        {p.comuna || '-'}
                      </td>

                      {/* Barrio */}
                      <td style={{ color:'var(--text-secondary)', fontSize:'13px' }}>
                        {esPrimera ? (
                          esEditando ? (
                            <div style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
                              <select value={editando.barrio||''}
                                onChange={e => setEditando(prev => ({...prev, barrio:e.target.value}))}
                                style={{ width:'100%', padding:'3px 7px', borderRadius:'5px', border:'1.5px solid #D1D5DB', fontSize:'12px' }}>
                                <option value="">Sin barrio</option>
                                {barrios.map(b => <option key={b.barrio} value={b.barrio}>{b.barrio}</option>)}
                              </select>
                              <input value={editando.barrio||''}
                                onChange={e => setEditando(prev => ({...prev, barrio:e.target.value}))}
                                placeholder="O escribe barrio nuevo"
                                style={{ width:'100%', padding:'3px 7px', borderRadius:'5px', border:'1.5px solid #D1D5DB', fontSize:'12px' }} />
                            </div>
                          ) : (
                            <span style={{ display:'flex', alignItems:'center', gap:'5px' }}>
                              {(p.barrio||esImportado) && (
                                <span style={{ display:'inline-block', width:'8px', height:'8px', borderRadius:'50%', background:colorBarrio, flexShrink:0 }} />
                              )}
                              {p.barrio || p.descripcion || '-'}
                            </span>
                          )
                        ) : <span style={{ color:'#CBD5E1' }}>↳</span>}
                      </td>

                      {/* Observación */}
                      <td style={{ fontSize:'12px', color:'var(--text-secondary)', maxWidth:'160px' }}>
                        {esEditando ? (
                          <input
                            value={editando.descripcion || ''}
                            onChange={e => setEditando(prev => ({ ...prev, descripcion: e.target.value }))}
                            placeholder="Observación..."
                            style={{ width:'100%', padding:'3px 7px', borderRadius:'5px', border:'1.5px solid #D1D5DB', fontSize:'12px' }}
                          />
                        ) : (
                          <span title={p.descripcion || ''} style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', display:'block' }}>
                            {p.descripcion || <span style={{ color:'#CBD5E1' }}>—</span>}
                          </span>
                        )}
                      </td>

                      <td>{p.total_personas}</td>

                      <td>
                        <div style={{ display:'flex', gap:'4px' }}>
                          {esEditando ? (
                            <>
                              <button onClick={guardarEdicion} className="btn-icon" style={{ color:'#2C9A5E' }} title="Guardar">✅</button>
                              <button onClick={() => setEditando(null)} className="btn-icon" title="Cancelar">✕</button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => setEditando({ id:p.id, nombre:p.nombre, descripcion:p.descripcion||'', barrio:p.barrio||'' })}
                                className="btn-icon" title="Editar nombre">✏️</button>
                              <button onClick={() => iniciarEdicionGeometria(f)}
                                className="btn-icon" title="Editar geometría">🗺️</button>
                            </>
                          )}
                          <button onClick={() => eliminar(p.id, p.nombre)} className="btn-icon btn-icon--danger" title="Eliminar">🗑️</button>
                        </div>
                      </td>
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>

    {deleteModal && (
      <ConfirmDeleteModal
        mensaje={`¿Eliminar el cuadrante "${deleteModal.nombre}"? Las personas asociadas quedarán sin cuadrante.`}
        onConfirm={confirmarEliminar}
        onCancelar={() => setDeleteModal(null)}
      />
    )}

    {/* Modal edición de geometría */}
    {editandoGeom && (
      <div className="modal-overlay" onClick={(e) => { if (e.target.className==='modal-overlay') cerrarEdicionGeom(); }}>
        <div className="modal-content" style={{ maxWidth:'720px', width:'95vw' }}>
          <h3 style={{ margin:'0 0 8px', fontSize:'16px', fontWeight:600 }}>
            🗺️ Editar geometría — <em style={{ fontWeight:400 }}>{editandoGeom.nombre}</em>
          </h3>
          <p style={{ fontSize:'12px', color:'var(--text-secondary)', margin:'0 0 12px' }}>
            <strong>Arrastra</strong> los puntos rojos para moverlos. <strong>Click en el mapa</strong> para agregar vértices.
          </p>
          <div style={{ display:'flex', gap:'8px', marginBottom:'10px' }}>
            <span style={{
              background: editandoGeom.puntos.length>=3?'#DCFCE7':'#FEF9C3',
              color:      editandoGeom.puntos.length>=3?'#166534':'#92400E',
              padding:'3px 10px', borderRadius:'20px', fontWeight:500, fontSize:'12px',
            }}>
              {editandoGeom.puntos.length} puntos {editandoGeom.puntos.length>=3?'✅':'(mín. 3)'}
            </span>
          </div>
          <div ref={mapEditRef} style={{ width:'100%', height:'420px', borderRadius:'8px', border:'1px solid var(--border)' }} />
          <div style={{ display:'flex', gap:'8px', marginTop:'14px', justifyContent:'flex-end', flexWrap:'wrap' }}>
            <button
              onClick={() => setEditandoGeom(prev => ({ ...prev, puntos: prev.puntos.slice(0,-1) }))}
              className="btn-secondary"
              disabled={editandoGeom.puntos.length===0}
            >↩ Deshacer punto</button>
            <button onClick={cerrarEdicionGeom} className="btn-secondary">Cancelar</button>
            <button onClick={guardarGeometria} className="btn-primary" disabled={editandoGeom.puntos.length<3}>
              ✅ Guardar geometría
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
