// ============================================================
// frontend/src/forms/PersonaForm.jsx
// ============================================================

import { useState, useEffect } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';

const COMUNAS_MEDELLIN = [
  'Popular','Santa Cruz','Manrique','Aranjuez','Castilla',
  'Doce de Octubre','Robledo','Villa Hermosa','Buenos Aires',
  'La Candelaria','Laureles','La América','San Javier',
  'El Poblado','Guayabal','Belén'
];

const FORM_VACIO = {
  nombre: '', cedula: '', telefono: '', correo: '',
  direccion: '', municipio: '', comuna: '', barrio: '',
  latitud: '', longitud: ''
};

export default function PersonaForm({ modo, persona, coordInicial, onGuardado, onCancelar }) {
  const [form,           setForm]           = useState(FORM_VACIO);
  const [geocodificando, setGeocodificando] = useState(false);
  const [guardando,      setGuardando]      = useState(false);
  const [errores,        setErrores]        = useState({});
  const [geoStatus,      setGeoStatus]      = useState('');

  useEffect(() => {
    if (modo === 'editar' && persona) {
      if (persona.id && !persona.nombre) {
        api.get(`/personas/${persona.id}`)
          .then(({ data }) => setForm({
            nombre:    data.nombre    || '',
            cedula:    data.cedula    || '',
            telefono:  data.telefono  || '',
            correo:    data.correo    || '',
            direccion: data.direccion || '',
            municipio: data.municipio || '',
            comuna:    data.comuna    || '',
            barrio:    data.barrio    || '',
            latitud:   data.latitud   || '',
            longitud:  data.longitud  || '',
          }))
          .catch(() => toast.error('No se pudo cargar la persona'));
      } else {
        setForm({
          nombre:    persona.nombre    || '',
          cedula:    persona.cedula    || '',
          telefono:  persona.telefono  || '',
          correo:    persona.correo    || '',
          direccion: persona.direccion || '',
          municipio: persona.municipio || '',
          comuna:    persona.comuna    || '',
          barrio:    persona.barrio    || '',
          latitud:   persona.latitud   || '',
          longitud:  persona.longitud  || '',
        });
      }
      return;
    }

    if (coordInicial) {
      setForm(f => ({
        ...f,
        latitud:  String(coordInicial.latitud.toFixed  ? coordInicial.latitud.toFixed(6)  : coordInicial.latitud),
        longitud: String(coordInicial.longitud.toFixed ? coordInicial.longitud.toFixed(6) : coordInicial.longitud),
      }));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const obtenerGeolocalizacion = () => {
    if (!navigator.geolocation) return;
    setGeoStatus('📡 Obteniendo ubicación...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm(f => ({
          ...f,
          latitud:  pos.coords.latitude.toFixed(6),
          longitud: pos.coords.longitude.toFixed(6),
        }));
        setGeoStatus('📍 Ubicación obtenida automáticamente');
        setTimeout(() => setGeoStatus(''), 3000);
      },
      () => setGeoStatus(''),
      { timeout: 6000, maximumAge: 30000 }
    );
  };

  const cambiar = (e) => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
    if (errores[name]) setErrores(er => ({ ...er, [name]: null }));
  };

  const geocodificar = async () => {
    if (!form.direccion) { toast.error('Ingresa una dirección primero'); return; }
    setGeocodificando(true);
    try {
      const { data } = await api.get('/geocodificar', {
        params: { direccion: form.direccion, barrio: form.barrio }
      });
      setForm(f => ({ ...f, latitud: data.latitud.toFixed(6), longitud: data.longitud.toFixed(6) }));
      toast.success('📍 Ubicado correctamente');
    } catch {
      toast.error('No se pudo geocodificar. Intenta con más detalle.');
    } finally {
      setGeocodificando(false);
    }
  };

  const validar = () => {
    const e = {};
    if (!form.nombre.trim()) e.nombre  = 'Requerido';
    if (!form.cedula.trim()) e.cedula  = 'Requerido';
    if (!form.latitud)       e.latitud = 'Requerido — usa "Geocodificar" o permite la ubicación';
    if (!form.longitud)      e.longitud = 'Requerido';
    setErrores(e);
    return Object.keys(e).length === 0;
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (!validar()) return;
    setGuardando(true);
    try {
      const payload = { ...form, latitud: parseFloat(form.latitud), longitud: parseFloat(form.longitud) };
      if (modo === 'crear') {
        await api.post('/personas', payload);
        toast.success('✅ Persona creada');
      } else {
        await api.put(`/personas/${persona.id}`, payload);
        toast.success('✅ Persona actualizada');
      }
      onGuardado();
    } catch (err) {
      if (err.response?.status === 409) {
        setErrores({ cedula: 'Ya existe esta cédula' });
        toast.error('Esta cédula ya está registrada');
      } else {
        toast.error(err.response?.data?.error || 'Error guardando');
      }
    } finally {
      setGuardando(false);
    }
  };

  return (
    <form onSubmit={guardar} className="persona-form">
      <h2 style={{ margin: '0 0 1.25rem', fontSize: '18px', fontWeight: 500 }}>
        {modo === 'crear' ? '➕ Nueva persona' : '✏️ Editar persona'}
      </h2>

      <div className="form-grid">
        <div className="form-field">
          <label>Nombre completo *</label>
          <input name="nombre" value={form.nombre} onChange={cambiar} placeholder="Juan García" />
          {errores.nombre && <span className="form-error">{errores.nombre}</span>}
        </div>

        <div className="form-field">
          <label>Cédula *</label>
          <input name="cedula" value={form.cedula} onChange={cambiar} placeholder="1234567890" />
          {errores.cedula && <span className="form-error">{errores.cedula}</span>}
        </div>

        <div className="form-field">
          <label>Teléfono</label>
          <input name="telefono" value={form.telefono} onChange={cambiar} placeholder="3001234567" />
        </div>

        <div className="form-field">
          <label>Correo electrónico</label>
          <input name="correo" type="email" value={form.correo} onChange={cambiar} placeholder="ejemplo@correo.com (opcional)" />
        </div>

        <div className="form-field">
          <label>Comuna</label>
          <select name="comuna" value={form.comuna} onChange={cambiar}>
            <option value="">Seleccionar...</option>
            {COMUNAS_MEDELLIN.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="form-field">
          <label>Barrio</label>
          <input name="barrio" value={form.barrio} onChange={cambiar} placeholder="Estadio" />
        </div>

        <div className="form-field form-field--full">
          <label>Dirección</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input name="direccion" value={form.direccion} onChange={cambiar} placeholder="Carrera 50 # 45-20" style={{ flex: 1 }} />
            <button type="button" onClick={geocodificar} className="btn-secondary" disabled={geocodificando} style={{ whiteSpace: 'nowrap' }}>
              {geocodificando ? '⏳' : '📍'} Geocodificar
            </button>
          </div>
        </div>

        <div className="form-field">
          <label>Municipio</label>
          <input name="municipio" value={form.municipio} onChange={cambiar} placeholder="Medellín (opcional)" />
        </div>

        <div className="form-field">
          <label>Latitud *</label>
          <input name="latitud" type="number" step="any" value={form.latitud} onChange={cambiar} placeholder="6.2518" />
          {errores.latitud && <span className="form-error">{errores.latitud}</span>}
        </div>

        <div className="form-field">
          <label>Longitud *</label>
          <input name="longitud" type="number" step="any" value={form.longitud} onChange={cambiar} placeholder="-75.5636" />
          {errores.longitud && <span className="form-error">{errores.longitud}</span>}
        </div>

        {geoStatus && (
          <div className="form-field form-field--full">
            <p style={{ fontSize: '12px', color: '#2563EB', margin: 0 }}>{geoStatus}</p>
          </div>
        )}
      </div>

      <div className="form-actions">
        <button type="button" onClick={onCancelar} className="btn-secondary">Cancelar</button>
        <button type="submit" className="btn-primary" disabled={guardando}>
          {guardando ? 'Guardando...' : (modo === 'crear' ? '✅ Crear persona' : '✅ Guardar cambios')}
        </button>
      </div>
    </form>
  );
}
