// ============================================================
// frontend/src/components/CuadrantesPanel.jsx
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../utils/api';
import toast from 'react-hot-toast';
import ConfirmDeleteModal from './ConfirmDeleteModal';

const FORM_INICIAL = { nombre: '', descripcion: '', barrio: '' };

export default function CuadrantesPanel() {
  const [cuadrantes,  setCuadrantes]  = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [modoCrear,   setModoCrear]   = useState(false);
  const [form,        setForm]        = useState(FORM_INICIAL);
  const [poligono,    setPoligono]    = useState([]);
  const [errores,     setErrores]     = useState({});
  const [guardando,   setGuardando]   = useState(false);
  const [deleteModal, setDeleteModal] = useState(null);
  const [editando,    setEditando]    = useState(null);
  const [importando,  setImportando]  = useState(false);
  // Barrios disponibles: [{ barrio, color, total_cuadrantes }]
  const [barrios,     setBarrios]     = useState([]);
  const geojsonFileRef = useRef(null);

  const mapRef      = useRef(null);
  const leafletMap  = useRef(null);
  const poliLayer   = useRef(null);
  const puntosLayer = useRef(null);

  // ── Cargar cuadrantes ──────────────────────────────────────
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
    } catch { /* silencioso — barrios son opcionales */ }
  }, []);

  useEffect(() => { cargar(); cargarBarrios(); }, [cargar, cargarBarrios]);

  // ── Mini-mapa de dibujo ────────────────────────────────────
  useEffect(() => {
    if (!modoCrear) {
      if (leafletMap.current) { leafletMap.current.remove(); leafletMap.current = null; }
      return;
    }
    const timer = setTimeout(() => {
      if (!mapRef.current || leafletMap.current) return;
      const map = L.map(mapRef.current, { center: [6.2518, -75.5636], zoom: 13 });
      L.tileLayer('https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png', {
        attribution: '© CartoDB © OpenStreetMap', maxZoom: 19,
      }).addTo(map);
      poliLayer.current   = L.layerGroup().addTo(map);
      puntosLayer.current = L.layerGroup().addTo(map);

      api.get('/cuadrantes').then(({ data }) => {
        if (!data.features?.length) return;
        L.geoJSON(data, {
          style: (f) => {
            const c = f.properties?.color || '#94A3B8';
            return { color: c, weight: 1.5, fillColor: c, fillOpacity: 0.12 };
          },
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
    if (!puntos.length) return;
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

  // Color preview del barrio seleccionado en el form
  const colorPreviewForm = (() => {
    if (!form.barrio) return null;
    const encontrado = barrios.find(b => b.barrio === form.barrio);
    if (encontrado) return encontrado.color;
    // Calcular igual que el backend (hash del nombre)
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
        barrio:      form.barrio?.trim()       || null,  // ← barrio → color automático
        geometry:    { type: 'Polygon', coordinates: [coords] },
      });
      const asignadas = resp.data.personas_asignadas || 0;
      toast.success(`✅ Cuadrante "${form.nombre}" creado${asignadas ? ` — ${asignadas} personas asignadas` : ''}`);
      cancelar();
      cargar();
      cargarBarrios(); // refrescar barrios por si se creó uno nuevo
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error guardando cuadrante');
    } finally { setGuardando(false); }
  };

  const eliminar = (id, nombre) => setDeleteModal({ id, nombre });

  const confirmarEliminar = async () => {
    try {
      await api.delete(`/cuadrantes/${deleteModal.id}`);
      toast.success('Cuadrante eliminado');
      setDeleteModal(null);
      cargar();
    } catch { toast.error('Error eliminando cuadrante'); }
  };

  const guardarEdicion = async () => {
    if (!editando?.nombre?.trim()) return;
    try {
      // Guardar nombre y descripción
      await api.patch(`/cuadrantes/${editando.id}`, {
        nombre:      editando.nombre.trim(),
        descripcion: editando.descripcion || '',
      });
      // Si cambió el barrio, actualizarlo (también actualiza color)
      const cuadranteActual = cuadrantes.find(f => f.properties.id === editando.id);
      if (cuadranteActual && cuadranteActual.properties.barrio !== editando.barrio) {
        await api.patch(`/cuadrantes/${editando.id}/barrio`, { barrio: editando.barrio || null });
      }
      toast.success('✅ Cuadrante actualizado');
      setEditando(null);
      cargar();
      cargarBarrios();
    } catch { toast.error('Error actualizando cuadrante'); }
  };

  // ── Cambiar color de un cuadrante individual ───────────────
  const cambiarColor = async (id, color) => {
    try {
      await api.patch(`/cuadrantes/${id}/color`, { color });
      setCuadrantes(prev => prev.map(f =>
        f.properties.id === id
          ? { ...f, properties: { ...f.properties, color } }
          : f
      ));
    } catch { toast.error('Error cambiando color'); }
  };

  // ── Cambiar color de TODOS los cuadrantes de un barrio ──────
  const cambiarColorBarrio = async (barrio, color) => {
    try {
      await api.patch(`/cuadrantes/barrio/${encodeURIComponent(barrio)}/color`, { color });
      // Actualizar localmente todos los del mismo barrio
      setCuadrantes(prev => prev.map(f =>
        f.properties.barrio === barrio
          ? { ...f, properties: { ...f.properties, color } }
          : f
      ));
    } catch { toast.error('Error cambiando color del barrio'); }
  };

  // ── Cambiar barrio de un cuadrante (actualiza color automáticamente) ──
  const cambiarBarrio = async (id, barrio) => {
    try {
      const { data } = await api.patch(`/cuadrantes/${id}/barrio`, { barrio });
      setCuadrantes(prev => prev.map(f =>
        f.properties.id === id
          ? { ...f, properties: { ...f.properties, barrio: data.barrio, color: data.color } }
          : f
      ));
      cargarBarrios();
    } catch { toast.error('Error cambiando barrio'); }
  };
  const handleGeoJSONImport = async (e) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    if (!archivo.name.toLowerCase().endsWith('.geojson') && !archivo.name.toLowerCase().endsWith('.json')) {
      toast.error('Solo se aceptan archivos .geojson o .json'); return;
    }

    setImportando(true);
    try {
      const texto = await archivo.text();
      let geojson;
      try { geojson = JSON.parse(texto); }
      catch { toast.error('Archivo JSON inválido'); return; }

      if (geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
        toast.error('El archivo no es un FeatureCollection GeoJSON válido'); return;
      }

      const features = geojson.features.filter(f =>
        f.geometry && ['Polygon','MultiPolygon'].includes(f.geometry.type)
      );

      if (!features.length) {
        toast.error('No se encontraron features de tipo Polygon o MultiPolygon'); return;
      }

      const nombreArchivo = archivo.name.replace(/\.(geojson|json)$/i, '');
      const { data } = await api.post('/cuadrantes/importar-geojson', {
        features,
        nombreArchivo,
      });

      if (data.errores?.length) {
        data.errores.forEach(e => console.warn('[GeoJSON import]', e));
      }

      toast.success(`✅ ${data.exitosos.length} cuadrantes importados de "${nombreArchivo}"`);
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error importando GeoJSON');
    } finally {
      setImportando(false);
      if (geojsonFileRef.current) geojsonFileRef.current.value = '';
    }
  };

  // ── Render ─────────────────────────────────────────────────
  return (
    <>
    <div className="cuadrantes-panel">

      {/* Encabezado */}
      <div className="panel-header">
        <div>
          <h2>🔲 Gestión de cuadrantes</h2>
          <p className="panel-desc">
            Crea cuadrantes manualmente dibujando en el mapa, o importa un GeoJSON exportado desde QGIS.
          </p>
        </div>
        {!modoCrear && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {/* Importar GeoJSON de QGIS */}
            <label
              className={`btn-secondary ${importando ? 'disabled' : ''}`}
              style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
              title="Importar GeoJSON exportado de QGIS (Polygon / MultiPolygon)"
            >
              {importando ? '⏳' : '📥'} Importar GeoJSON
              <input
                ref={geojsonFileRef}
                type="file"
                accept=".geojson,.json"
                onChange={handleGeoJSONImport}
                disabled={importando}
                style={{ display: 'none' }}
              />
            </label>
            <button className="btn-primary" onClick={() => setModoCrear(true)}>
              + Nuevo cuadrante
            </button>
          </div>
        )}
      </div>

      {/* Formulario de creación manual */}
      {modoCrear && (
        <div className="cuadrante-form-card">
          <h3 style={{ marginBottom: '16px', fontWeight: 500, fontSize: '16px' }}>Nuevo cuadrante</h3>
          <div className="form-grid" style={{ marginBottom: '14px' }}>
            <div className="form-field">
              <label>Nombre *</label>
              <input name="nombre" value={form.nombre} onChange={cambiar} placeholder="Ej: Zona Norte" />
              {errores.nombre && <span className="form-error">{errores.nombre}</span>}
            </div>
            <div className="form-field">
              <label>Descripción</label>
              <input name="descripcion" value={form.descripcion || ''} onChange={cambiar} placeholder="Opcional" />
            </div>

            {/* Selector de barrio — hereda color automáticamente */}
            <div className="form-field form-field--full">
              <label style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                Barrio
                {colorPreviewForm && (
                  <span style={{
                    display:'inline-block', width:'14px', height:'14px',
                    borderRadius:'3px', background: colorPreviewForm,
                    border:'1px solid rgba(0,0,0,0.15)', flexShrink:0,
                  }} title={`Color: ${colorPreviewForm}`} />
                )}
                <span style={{ fontSize:'11px', color:'var(--text-secondary)', fontWeight:400 }}>
                  (el cuadrante hereda el color del barrio)
                </span>
              </label>
              <div style={{ display:'flex', gap:'8px' }}>
                {/* Selector con barrios existentes */}
                <select
                  name="barrio"
                  value={form.barrio}
                  onChange={cambiar}
                  style={{ flex:1, padding:'6px 9px', borderRadius:'6px', border:'1.5px solid #D1D5DB', fontSize:'13px' }}
                >
                  <option value="">Sin barrio / color automático</option>
                  {barrios.map(b => (
                    <option key={b.barrio} value={b.barrio}>
                      {b.barrio} ({b.total_cuadrantes} cuadrantes)
                    </option>
                  ))}
                </select>
                {/* Input libre para barrio nuevo */}
                <input
                  name="barrio"
                  value={form.barrio}
                  onChange={cambiar}
                  placeholder="O escribe uno nuevo"
                  style={{ flex:1, padding:'6px 9px', borderRadius:'6px', border:'1.5px solid #D1D5DB', fontSize:'13px' }}
                />
              </div>
            </div>
          </div>

          <div>
            <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'8px' }}>
              <label style={{ fontSize:'12px', fontWeight:500, color:'var(--text-secondary)' }}>
                Dibuja el cuadrante (click en el mapa para agregar vértices) *
              </label>
              <span style={{ fontSize:'12px', color: poligono.length>=3?'#2C9A5E':'var(--text-secondary)', marginLeft:'auto' }}>
                {poligono.length === 0
                  ? 'Haz click en el mapa para comenzar'
                  : `${poligono.length} punto${poligono.length!==1?'s':''} ${poligono.length>=3?'✅':'(mín. 3)'}`}
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
              {guardando ? 'Guardando...' : '✅ Crear cuadrante'}
            </button>
          </div>
        </div>
      )}

      {/* Tabla de cuadrantes */}
      {loading ? (
        <div className="loading-state">Cargando cuadrantes...</div>
      ) : cuadrantes.length === 0 ? (
        <div style={{ textAlign:'center', padding:'48px 20px', color:'var(--text-secondary)' }}>
          <div style={{ fontSize:'36px', marginBottom:'10px' }}>🗺️</div>
          <p style={{ fontWeight:500, marginBottom:'6px' }}>Sin cuadrantes definidos</p>
          <p style={{ fontSize:'13px' }}>
            Usa el botón <strong>"+ Nuevo cuadrante"</strong> para trazar uno manualmente,
            o <strong>"Importar GeoJSON"</strong> para cargar datos de QGIS.
          </p>
        </div>
      ) : (() => {
        // Agrupar cuadrantes por barrio para mostrar color de barrio
        const grupos = {};
        cuadrantes.forEach(f => {
          const barrio = f.properties.barrio || '__manual__';
          if (!grupos[barrio]) grupos[barrio] = [];
          grupos[barrio].push(f);
        });

        return (
          <div style={{ overflowX:'auto', marginTop:'8px' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width:'34px' }} title="Color del cuadrante individual">Color</th>
                  <th>Nombre</th>
                  <th>Código</th>
                  <th>Barrio/Origen</th>
                  <th>Personas</th>
                  <th>Pacto</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(grupos).map(([barrio, items]) => {
                  // Color representativo del barrio = primer cuadrante del grupo
                  const colorBarrio = items[0].properties.color || '#2563EB';
                  const esImportado = barrio !== '__manual__';

                  return items.map((f, idx) => {
                    const p = f.properties;
                    const esEditando = editando?.id === p.id;
                    const esPrimeraDeFila = idx === 0;

                    return (
                      <tr key={p.id} style={esPrimeraDeFila && idx > 0 ? { borderTop: '2px solid #E2E8F0' } : {}}>

                        {/* Color: primer fila del barrio muestra picker de barrio completo */}
                        <td>
                          {esPrimeraDeFila && esImportado ? (
                            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'2px' }}>
                              <input
                                type="color"
                                defaultValue={colorBarrio}
                                onBlur={e => cambiarColorBarrio(barrio, e.target.value)}
                                title={`Color del barrio "${barrio}" (cambia todos) — suelta el picker para aplicar`}
                                style={{ width:'28px', height:'28px', border:'2px solid #94A3B8', borderRadius:'5px', cursor:'pointer', padding:'1px', background:'none' }}
                              />
                              {items.length > 1 && (
                                <span style={{ fontSize:'9px', color:'var(--text-secondary)', lineHeight:1 }}>
                                  ×{items.length}
                                </span>
                              )}
                            </div>
                          ) : (
                            <input
                              type="color"
                              defaultValue={p.color || '#2563EB'}
                              onBlur={e => cambiarColor(p.id, e.target.value)}
                              title="Cambiar color individual — suelta el picker para aplicar"
                              style={{ width:'28px', height:'28px', border:'none', borderRadius:'4px', cursor:'pointer', padding:'2px', background:'none' }}
                            />
                          )}
                        </td>

                        <td style={{ fontWeight:500 }}>
                          {esEditando ? (
                            <input
                              value={editando.nombre}
                              onChange={e => setEditando(prev => ({...prev, nombre: e.target.value}))}
                              onKeyDown={e => { if (e.key==='Enter') guardarEdicion(); if (e.key==='Escape') setEditando(null); }}
                              autoFocus
                              style={{ width:'100%', padding:'3px 7px', borderRadius:'5px', border:'1.5px solid #2563EB', fontSize:'13px' }}
                            />
                          ) : p.nombre}
                        </td>

                        <td style={{ fontFamily:'monospace', fontSize:'12px', color:'var(--text-secondary)' }}>
                          {p.codigo || '-'}
                        </td>

                        {/* Barrio: mostrar nombre solo en primera fila del grupo */}
                        <td style={{ color:'var(--text-secondary)', fontSize:'13px' }}>
                          {esPrimeraDeFila ? (
                            esEditando ? (
                              <div style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
                                <select
                                  value={editando.barrio || ''}
                                  onChange={e => setEditando(prev => ({...prev, barrio: e.target.value}))}
                                  style={{ width:'100%', padding:'3px 7px', borderRadius:'5px', border:'1.5px solid #D1D5DB', fontSize:'12px' }}
                                >
                                  <option value="">Sin barrio</option>
                                  {barrios.map(b => (
                                    <option key={b.barrio} value={b.barrio}>{b.barrio}</option>
                                  ))}
                                </select>
                                <input
                                  value={editando.barrio || ''}
                                  onChange={e => setEditando(prev => ({...prev, barrio: e.target.value}))}
                                  placeholder="O escribe barrio nuevo"
                                  style={{ width:'100%', padding:'3px 7px', borderRadius:'5px', border:'1.5px solid #D1D5DB', fontSize:'12px' }}
                                />
                              </div>
                            ) : (
                              <span style={{ display:'flex', alignItems:'center', gap:'5px' }}>
                                {(p.barrio || esImportado) && (
                                  <span
                                    style={{ display:'inline-block', width:'8px', height:'8px', borderRadius:'50%', background: colorBarrio, flexShrink:0 }}
                                  />
                                )}
                                {p.barrio || p.descripcion || '-'}
                              </span>
                            )
                          ) : (
                            <span style={{ color:'#CBD5E1' }}>↳</span>
                          )}
                        </td>

                        <td>{p.total_personas}</td>
                        <td><span className="badge badge-green">{p.votantes_pacto}</span></td>
                        <td>
                          <div style={{ display:'flex', gap:'4px' }}>
                            {esEditando ? (
                              <>
                                <button onClick={guardarEdicion} className="btn-icon" title="Guardar" style={{ color:'#2C9A5E' }}>✅</button>
                                <button onClick={() => setEditando(null)} className="btn-icon" title="Cancelar">✕</button>
                              </>
                            ) : (
                              <button
                                onClick={() => setEditando({ id: p.id, nombre: p.nombre, descripcion: p.descripcion || '', barrio: p.barrio || '' })}
                                className="btn-icon" title="Editar nombre"
                              >✏️</button>
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
        );
      })()}
    </div>

    {deleteModal && (
      <ConfirmDeleteModal
        mensaje={`¿Eliminar el cuadrante "${deleteModal.nombre}"? Las personas asociadas quedarán sin cuadrante.`}
        onConfirm={confirmarEliminar}
        onCancelar={() => setDeleteModal(null)}
      />
    )}
    </>
  );
}
