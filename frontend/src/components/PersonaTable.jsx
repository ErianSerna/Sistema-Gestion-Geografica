// ============================================================
// frontend/src/components/PersonaTable.jsx
// - Sin columna Pacto
// - Roles: líder / coordinador
// - Asignación manual de cuadrante
// - Rate-limit de eliminaciones: máx 5 por hora (localStorage)
// ============================================================

import { useState, useEffect } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import ConfirmDeleteModal from './ConfirmDeleteModal';

const COMUNAS_MEDELLIN = [
  'Popular','Santa Cruz','Manrique','Aranjuez','Castilla',
  'Doce de Octubre','Robledo','Villa Hermosa','Buenos Aires',
  'La Candelaria','Laureles','La América','San Javier',
  'El Poblado','Guayabal','Belén',
];

// ── Rate-limit de eliminaciones ───────────────────────────────
const LIMIT_BORRAR    = 5;
const VENTANA_MS      = 60 * 60 * 1000; // 1 hora

function getBorradosRecientes() {
  try {
    const raw = localStorage.getItem('borrados_log');
    const log = raw ? JSON.parse(raw) : [];
    const ahora = Date.now();
    return log.filter(ts => ahora - ts < VENTANA_MS);
  } catch { return []; }
}

function registrarBorrado() {
  const recientes = getBorradosRecientes();
  recientes.push(Date.now());
  localStorage.setItem('borrados_log', JSON.stringify(recientes));
}

function puedeEliminar() {
  return getBorradosRecientes().length < LIMIT_BORRAR;
}

function tiempoRestante() {
  const recientes = getBorradosRecientes();
  if (recientes.length < LIMIT_BORRAR) return null;
  const masAntiguo = Math.min(...recientes);
  const liberaEn   = masAntiguo + VENTANA_MS - Date.now();
  const min = Math.ceil(liberaEn / 60000);
  return min;
}

export default function PersonaTable({ onEdit, sesion }) {
  const [personas,    setPersonas]    = useState([]);
  const [cuadrantes,  setCuadrantes]  = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [filtros,     setFiltros]     = useState({ busqueda: '', comuna: '' });
  const [deleteModal, setDeleteModal] = useState(null);

  useEffect(() => {
    cargar();
    api.get('/cuadrantes')
      .then(({ data }) => setCuadrantes(data.features || []))
      .catch(() => {});
  }, []);

  const cargar = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/personas');
      setPersonas(data.data);
    } catch {
      toast.error('Error cargando personas');
    } finally {
      setLoading(false);
    }
  };

  const intentarEliminar = (id, nombre) => {
    if (!puedeEliminar()) {
      const min = tiempoRestante();
      toast.error(`Límite alcanzado: máx ${LIMIT_BORRAR} eliminaciones/hora. Intenta en ${min} min.`);
      return;
    }
    setDeleteModal({ id, nombre });
  };

  const confirmarEliminar = async () => {
    try {
      await api.delete(`/personas/${deleteModal.id}`);
      registrarBorrado();
      const restantes = LIMIT_BORRAR - getBorradosRecientes().length;
      toast.success(`Persona eliminada (te quedan ${restantes} eliminaciones esta hora)`);
      setDeleteModal(null);
      cargar();
    } catch {
      toast.error('Error eliminando');
    }
  };

  const toggleRol = async (persona, campo, valor) => {
    try {
      await api.patch(`/personas/${persona.id}/rol`, { [campo]: valor });
      setPersonas(prev => prev.map(x =>
        x.id === persona.id ? { ...x, [campo]: valor } : x
      ));
    } catch {
      toast.error('Error actualizando rol');
    }
  };

  const asignarCuadrante = async (persona, cuadrante_id) => {
    try {
      await api.patch(`/personas/${persona.id}/cuadrante`, { cuadrante_id: cuadrante_id || null });
      const nombreCuadrante = cuadrante_id
        ? cuadrantes.find(f => String(f.properties.id) === String(cuadrante_id))?.properties?.nombre || ''
        : null;
      setPersonas(prev => prev.map(x =>
        x.id === persona.id
          ? { ...x, cuadrante_id: cuadrante_id || null, cuadrante_nombre: nombreCuadrante }
          : x
      ));
    } catch {
      toast.error('Error asignando cuadrante');
    }
  };

  const filtradas = personas.filter(p => {
    if (sesion?.rol === 'coordinador' && p.comuna !== sesion.comuna) return false;
    if (filtros.comuna && p.comuna !== filtros.comuna) return false;
    if (filtros.busqueda) {
      const q = filtros.busqueda.toLowerCase();
      return (
        (p.nombre    || '').toLowerCase().includes(q) ||
        (p.cedula    || '').toLowerCase().includes(q) ||
        (p.barrio    || '').toLowerCase().includes(q) ||
        (p.direccion || '').toLowerCase().includes(q) ||
        (p.correo    || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const borradosUsados = getBorradosRecientes().length;
  const limitAlcanzado = borradosUsados >= LIMIT_BORRAR;

  if (loading) return <div className="loading-state">Cargando personas...</div>;

  return (
    <>
    <div className="table-container">

      {/* Aviso rate-limit */}
      {borradosUsados > 0 && (
        <div style={{
          background: limitAlcanzado ? '#FEF2F2' : '#FFFBEB',
          border: `1px solid ${limitAlcanzado ? '#FECACA' : '#FDE68A'}`,
          borderRadius: '7px', padding: '8px 14px', marginBottom: '12px',
          fontSize: '13px', color: limitAlcanzado ? '#DC2626' : '#92400E',
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          {limitAlcanzado
            ? `🚫 Límite de eliminaciones alcanzado (${LIMIT_BORRAR}/${LIMIT_BORRAR}). Disponible en ${tiempoRestante()} min.`
            : `⚠️ Eliminaciones esta hora: ${borradosUsados}/${LIMIT_BORRAR}`}
        </div>
      )}

      {/* Barra de filtros */}
      <div className="table-toolbar">
        <input
          placeholder="Buscar por nombre, cédula, barrio, dirección..."
          value={filtros.busqueda}
          onChange={e => setFiltros(f => ({ ...f, busqueda: e.target.value }))}
          className="filter-input"
          style={{ flex: 1, minWidth: '220px' }}
        />

        {sesion?.rol !== 'coordinador' && (
          <select
            value={filtros.comuna}
            onChange={e => setFiltros(f => ({ ...f, comuna: e.target.value }))}
            className="filter-select"
          >
            <option value="">Todas las comunas</option>
            {COMUNAS_MEDELLIN.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}

        <button onClick={cargar} className="btn-secondary" title="Recargar">🔄</button>
        <span className="count-badge">{filtradas.length} registros</span>
      </div>

      {/* Tabla */}
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Cédula</th>
              <th>Teléfono</th>
              <th>Dirección</th>
              <th>Barrio</th>
              <th>Comuna</th>
              <th>Cuadrante</th>
              <th>Rol</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>
                  {personas.length === 0
                    ? 'No hay personas registradas aún.'
                    : 'Ningún registro coincide con los filtros.'}
                </td>
              </tr>
            ) : filtradas.map(p => (
              <tr key={p.id}>
                <td style={{ fontWeight: 500 }}>{p.nombre}</td>
                <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{p.cedula}</td>
                <td>{p.telefono || '-'}</td>
                <td style={{ maxWidth: '170px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={p.direccion}>
                  {p.direccion || '-'}
                </td>
                <td>{p.barrio || '-'}</td>
                <td>{p.comuna || '-'}</td>

                {/* Asignación manual de cuadrante */}
                <td>
                  <select
                    value={p.cuadrante_id || ''}
                    onChange={e => asignarCuadrante(p, e.target.value)}
                    style={{
                      fontSize: '12px', padding: '3px 6px', borderRadius: '5px',
                      border: '1px solid #D1D5DB', maxWidth: '140px',
                      color: p.cuadrante_id ? 'inherit' : 'var(--text-secondary)',
                      background: 'white',
                    }}
                  >
                    <option value="">Sin asignar</option>
                    {cuadrantes.map(f => (
                      <option key={f.properties.id} value={f.properties.id}>
                        {f.properties.nombre}
                      </option>
                    ))}
                  </select>
                </td>

                {/* Checkboxes de rol */}
                <td>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      <input
                        type="checkbox"
                        checked={!!p.es_lider}
                        onChange={e => toggleRol(p, 'es_lider', e.target.checked)}
                      />
                      🌟 Líder
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      <input
                        type="checkbox"
                        checked={!!p.es_coordinador}
                        onChange={e => toggleRol(p, 'es_coordinador', e.target.checked)}
                      />
                      📍 Coord.
                    </label>
                  </div>
                </td>

                <td>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button onClick={() => onEdit(p)} className="btn-icon" title="Editar persona">✏️</button>
                    <button
                      onClick={() => intentarEliminar(p.id, p.nombre)}
                      className="btn-icon btn-icon--danger"
                      title={limitAlcanzado ? `Límite alcanzado (${LIMIT_BORRAR}/hora)` : 'Eliminar persona'}
                      disabled={limitAlcanzado}
                      style={{ opacity: limitAlcanzado ? 0.4 : 1, cursor: limitAlcanzado ? 'not-allowed' : 'pointer' }}
                    >🗑️</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>

    {deleteModal && (
      <ConfirmDeleteModal
        mensaje={`¿Eliminar a "${deleteModal.nombre}"? Esta acción no se puede deshacer.`}
        onConfirm={confirmarEliminar}
        onCancelar={() => setDeleteModal(null)}
      />
    )}
    </>
  );
}
