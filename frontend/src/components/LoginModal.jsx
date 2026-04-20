// ============================================================
// frontend/src/components/LoginModal.jsx
// Sistema de login simple con roles (frontend only)
// ============================================================

import { useState } from 'react';

// ─── Usuarios del sistema ────────────────────────────────────
// Para agregar más coordinadores, copiar una línea con rol 'coordinador'
// y cambiar usuario, clave y comuna.
const USUARIOS = [
  { usuario: 'admin',     clave: 'admin2024',  rol: 'admin',       comuna: null },
  { usuario: 'comuna1',   clave: 'coord123',   rol: 'coordinador', comuna: 'Popular' },
  { usuario: 'comuna2',   clave: 'coord123',   rol: 'coordinador', comuna: 'Santa Cruz' },
  { usuario: 'comuna3',   clave: 'coord123',   rol: 'coordinador', comuna: 'Manrique' },
  { usuario: 'comuna4',   clave: 'coord123',   rol: 'coordinador', comuna: 'Aranjuez' },
  { usuario: 'comuna5',   clave: 'coord123',   rol: 'coordinador', comuna: 'Castilla' },
  { usuario: 'comuna6',   clave: 'coord123',   rol: 'coordinador', comuna: 'Doce de Octubre' },
  { usuario: 'comuna7',   clave: 'coord123',   rol: 'coordinador', comuna: 'Robledo' },
  { usuario: 'comuna8',   clave: 'coord123',   rol: 'coordinador', comuna: 'Villa Hermosa' },
  { usuario: 'comuna9',   clave: 'coord123',   rol: 'coordinador', comuna: 'Buenos Aires' },
  { usuario: 'comuna10',  clave: 'coord123',   rol: 'coordinador', comuna: 'La Candelaria' },
  { usuario: 'comuna11',  clave: 'coord123',   rol: 'coordinador', comuna: 'Laureles' },
  { usuario: 'comuna12',  clave: 'coord123',   rol: 'coordinador', comuna: 'La América' },
  { usuario: 'comuna13',  clave: 'coord123',   rol: 'coordinador', comuna: 'San Javier' },
  { usuario: 'comuna14',  clave: 'coord123',   rol: 'coordinador', comuna: 'El Poblado' },
  { usuario: 'comuna15',  clave: 'coord123',   rol: 'coordinador', comuna: 'Guayabal' },
  { usuario: 'comuna16',  clave: 'coord123',   rol: 'coordinador', comuna: 'Belén' },
];

export function getSession() {
  try {
    const s = localStorage.getItem('geo_session');
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

export function setSession(sesion) {
  localStorage.setItem('geo_session', JSON.stringify(sesion));
}

export function clearSession() {
  localStorage.removeItem('geo_session');
}

export default function LoginModal({ onLogin }) {
  const [usuario, setUsuario] = useState('');
  const [clave,   setClave]   = useState('');
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setLoading(true);
    const encontrado = USUARIOS.find(
      u => u.usuario === usuario.trim() && u.clave === clave
    );
    setTimeout(() => {
      setLoading(false);
      if (!encontrado) {
        setError('Usuario o contraseña incorrectos');
        return;
      }
      const sesion = {
        usuario: encontrado.usuario,
        rol:     encontrado.rol,
        comuna:  encontrado.comuna,
      };
      setSession(sesion);
      onLogin(sesion);
    }, 400);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'linear-gradient(135deg, #1e3a5f 0%, #2563EB 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
    }}>
      <div style={{
        background: 'white', borderRadius: '16px', padding: '40px 36px',
        width: '360px', boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'center' }}>
            <img
              src="/pacto_logo.png"
              alt="Pacto Histórico"
              style={{ height: '72px', width: 'auto', objectFit: 'contain' }}
            />
          </div>
          <h2 style={{ margin: '0 0 4px', fontSize: '20px', fontWeight: 700, color: '#1e293b' }}>
            Sistema de Gestión Geográfica
          </h2>
          <p style={{ margin: 0, fontSize: '13px', color: '#6B7280' }}>
            Ingresa tus credenciales para continuar
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: '#374151' }}>
              Usuario
            </label>
            <input
              value={usuario}
              onChange={e => { setUsuario(e.target.value); setError(''); }}
              autoFocus
              autoComplete="username"
              placeholder="Ej: admin"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: '8px',
                border: error ? '1.5px solid #DC2626' : '1.5px solid #D1D5DB',
                fontSize: '14px', boxSizing: 'border-box', outline: 'none',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => { if (!error) e.target.style.borderColor = '#2563EB'; }}
              onBlur={e  => { if (!error) e.target.style.borderColor = '#D1D5DB'; }}
            />
          </div>

          <div style={{ marginBottom: '22px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: '#374151' }}>
              Contraseña
            </label>
            <input
              type="password"
              value={clave}
              onChange={e => { setClave(e.target.value); setError(''); }}
              autoComplete="current-password"
              placeholder="••••••••"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: '8px',
                border: error ? '1.5px solid #DC2626' : '1.5px solid #D1D5DB',
                fontSize: '14px', boxSizing: 'border-box', outline: 'none',
              }}
            />
          </div>

          {error && (
            <div style={{
              background: '#FEF2F2', border: '1px solid #FECACA',
              borderRadius: '7px', padding: '9px 12px',
              color: '#DC2626', fontSize: '13px', marginBottom: '16px',
              display: 'flex', alignItems: 'center', gap: '6px',
            }}>
              ⚠️ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !usuario || !clave}
            style={{
              width: '100%', padding: '11px', borderRadius: '8px',
              background: loading || !usuario || !clave ? '#93C5FD' : '#2563EB',
              color: 'white', fontWeight: 700,
              fontSize: '14px', border: 'none',
              cursor: loading || !usuario || !clave ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
            }}
          >
            {loading ? '⏳ Verificando...' : 'Ingresar →'}
          </button>
        </form>
      </div>
    </div>
  );
}
