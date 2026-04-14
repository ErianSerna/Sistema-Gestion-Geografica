// ============================================================
// frontend/src/components/PersonaTable.jsx
// Tabla de personas con filtros, edición y eliminación
// ============================================================

import { useState, useEffect } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import ConfirmDeleteModal from './ConfirmDeleteModal';

const COMUNAS_MEDELLIN = [
  'Popular','Santa Cruz','Manrique','Aranjuez','Castilla',
  'Doce de Octubre','Robledo','Villa Hermosa','Buenos Aires',
  'La Candelaria','Laureles','La América','San Javier',
  'El Poblado','Guayabal','Belén'
];

export default function PersonaTable({ onEdit }) {
  const [personas, setPersonas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState({
    busqueda:   '',
    vota_pacto: '',
    comuna:     ''
  });
  const [deleteModal, setDeleteModal] = useState(null); // { id, nombre }

  useEffect(() => {
    cargar();
  }, []);

  const cargar = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/personas');
      setPersonas(data.data);
    } catch (err) {
      toast.error('Error cargando personas');
    } finally {
      setLoading(false);
    }
  };

  const eliminar = (id, nombre) => {
    setDeleteModal({ id, nombre });
  };

  const confirmarEliminar = async () => {
    try {
      await api.delete(`/personas/${deleteModal.id}`);
      toast.success('Persona eliminada');
      setDeleteModal(null);
      cargar();
    } catch (err) {
      toast.error('Error eliminando');
    }
  };

  // Filtrado en cliente sobre los datos ya cargados
  const filtradas = personas.filter(p => {
    if (filtros.vota_pacto === 'true'  && !p.vota_pacto) return false;
    if (filtros.vota_pacto === 'false' &&  p.vota_pacto) return false;
    if (filtros.comuna && p.comuna !== filtros.comuna)   return false;
    if (filtros.busqueda) {
      const q = filtros.busqueda.toLowerCase();
      return (
        (p.nombre  || '').toLowerCase().includes(q) ||
        (p.cedula  || '').toLowerCase().includes(q) ||
        (p.barrio  || '').toLowerCase().includes(q) ||
        (p.direccion || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  if (loading) return <div className="loading-state">Cargando personas...</div>;

  return (
    <>
    <div className="table-container">

      {/* Barra de filtros */}
      <div className="table-toolbar">
        <input
          placeholder="Buscar por nombre, cédula, barrio, dirección..."
          value={filtros.busqueda}
          onChange={e => setFiltros(f => ({ ...f, busqueda: e.target.value }))}
          className="filter-input"
          style={{ flex: 1, minWidth: '220px' }}
        />

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

        <select
          value={filtros.vota_pacto}
          onChange={e => setFiltros(f => ({ ...f, vota_pacto: e.target.value }))}
          className="filter-select"
        >
          <option value="">Todos los votantes</option>
          <option value="true">✅ Solo Pacto</option>
          <option value="false">❌ Solo No-Pacto</option>
        </select>

        <button onClick={cargar} className="btn-secondary" title="Recargar">
          🔄
        </button>

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
              <th>Coordenadas</th>
              <th>Pacto</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>
                  {personas.length === 0
                    ? 'No hay personas registradas aún. Agrega pins en el mapa o importa un Excel.'
                    : 'Ningún registro coincide con los filtros aplicados.'}
                </td>
              </tr>
            ) : (
              filtradas.map(p => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 500 }}>{p.nombre}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{p.cedula}</td>
                  <td>{p.telefono || '-'}</td>
                  <td style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={p.direccion}>
                    {p.direccion || '-'}
                  </td>
                  <td>{p.barrio || '-'}</td>
                  <td>{p.comuna || '-'}</td>
                  <td>{p.cuadrante_nombre || <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Sin asignar</span>}</td>
                  <td style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                    {p.latitud && p.longitud
                      ? `${parseFloat(p.latitud).toFixed(4)}, ${parseFloat(p.longitud).toFixed(4)}`
                      : '-'}
                  </td>
                  <td>
                    <span className={`badge ${p.vota_pacto ? 'badge-green' : 'badge-red'}`}>
                      {p.vota_pacto ? '✅ Sí' : '❌ No'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        onClick={() => onEdit(p)}
                        className="btn-icon"
                        title="Editar persona"
                      >✏️</button>
                      <button
                        onClick={() => eliminar(p.id, p.nombre)}
                        className="btn-icon btn-icon--danger"
                        title="Eliminar persona y pin"
                      >🗑️</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>

    {deleteModal && (
      <ConfirmDeleteModal
        mensaje={`¿Eliminar a "${deleteModal.nombre}"? Esta acción también eliminará su pin del mapa.`}
        onConfirm={confirmarEliminar}
        onCancelar={() => setDeleteModal(null)}
      />
    )}
    </>
  );
}
