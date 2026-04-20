// ============================================================
// frontend/src/App.jsx
// Fix: todos los hooks ANTES de cualquier return condicional
// ============================================================

import { useState, useCallback, useEffect } from 'react';
import MapView from './components/MapView';
import PersonaTable from './components/PersonaTable';
import PersonaForm from './forms/PersonaForm';
import ExcelPanel from './components/ExcelPanel';
import StatsPanel from './components/StatsPanel';
import CuadrantesPanel from './components/CuadrantesPanel';
import LoginModal, { getSession, clearSession } from './components/LoginModal';
import { Toaster } from 'react-hot-toast';

export default function App() {
  // ── TODOS los hooks primero, sin excepción ────────────────
  const [sesion,           setSesion]           = useState(() => getSession());
  const [activeTab,        setActiveTab]        = useState('mapa');
  const [selectedPin,      setSelectedPin]      = useState(null);
  const [showForm,         setShowForm]         = useState(false);
  const [formMode,         setFormMode]         = useState('crear');
  const [pendingCoords,    setPendingCoords]    = useState(null);
  const [refreshKey,       setRefreshKey]       = useState(0);
  const [recargarTrigger,  setRecargarTrigger]  = useState(0);
  const [modoMapa,         setModoMapa]         = useState('normal');
  const [cuadranteEnCurso, setCuadranteEnCurso] = useState(null);

  // Escuchar evento global "editar-persona" desde popups del mapa
  useEffect(() => {
    const handler = (e) => {
      const { persona } = e.detail;
      setSelectedPin(persona);
      setFormMode('editar');
      setShowForm(true);
    };
    window.addEventListener('editar-persona', handler);
    return () => window.removeEventListener('editar-persona', handler);
  }, []);

  const handleMapClick  = useCallback(() => {}, []);
  const handlePinClick  = useCallback((persona) => setSelectedPin(persona), []);

  const handleGuardado  = useCallback(() => {
    setRefreshKey(k => k + 1);
    setRecargarTrigger(k => k + 1);
    setShowForm(false);
    setPendingCoords(null);
    setSelectedPin(null);
    setModoMapa('normal');
  }, []);

  const handleImportado = useCallback(() => {
    setRefreshKey(k => k + 1);
    setRecargarTrigger(k => k + 1);
  }, []);

  const handleCuadranteGuardado = useCallback(() => {
    setRefreshKey(k => k + 1);
    setRecargarTrigger(k => k + 1);
    setModoMapa('normal');
    setCuadranteEnCurso(null);
  }, []);

  const agregarPersona = () => {
    setPendingCoords(null);
    setFormMode('crear');
    setSelectedPin(null);
    setShowForm(true);
  };

  const toggleCrearCuadrante = () => {
    if (modoMapa === 'crear-cuadrante') {
      setModoMapa('normal');
      setCuadranteEnCurso(null);
    } else {
      setModoMapa('crear-cuadrante');
      setCuadranteEnCurso({ nombre: '', codigo: '', comuna: '', descripcion: '', poligono: [] });
    }
  };

  const handleLogout = () => {
    clearSession();
    setSesion(null);
  };

  // ── Returns condicionales DESPUÉS de todos los hooks ──────
  if (!sesion) return <LoginModal onLogin={setSesion} />;

  const tabs = [
    { id: 'mapa',         label: '🗺️ Mapa' },
    { id: 'tabla',        label: '📋 Tabla' },
    { id: 'cuadrantes',   label: '🔲 Cuadrantes' },
    { id: 'estadisticas', label: '📊 Estadísticas' },
    { id: 'excel',        label: '📥 Excel' },
  ];

  const esModoCrearCuadrante = modoMapa === 'crear-cuadrante';

  return (
    <div className="app-container">
      <Toaster position="top-right" />

      <header className="app-header">
        <div className="header-brand">
          <img src="/pacto_logo.png" alt="Logo" className="header-logo" />
          <div>
            <h1>Sistema de gestión geografica</h1>
            <p>Manejo geográfico y electoral por comunas</p>
          </div>
        </div>

        <nav className="tab-nav">
          {tabs.map(t => (
            <button
              key={t.id}
              className={`tab-btn ${activeTab === t.id ? 'active' : ''}`}
              onClick={() => { setActiveTab(t.id); setModoMapa('normal'); setCuadranteEnCurso(null); }}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{
            fontSize: '12px', color: 'var(--text-secondary)',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '6px', padding: '4px 10px', whiteSpace: 'nowrap',
          }}>
            {sesion.rol === 'admin' ? '👑 Admin' : `📍 ${sesion.comuna}`}
          </span>

          <button
            className="btn-secondary"
            onClick={handleLogout}
            style={{ fontSize: '12px', padding: '5px 12px' }}
            title="Cerrar sesión"
          >
            Salir
          </button>

          {activeTab === 'mapa' && (
            <button
              className="btn-secondary"
              onClick={toggleCrearCuadrante}
              style={esModoCrearCuadrante
                ? { background: '#F59E0B', color: 'white', borderColor: '#F59E0B' }
                : {}}
            >
              {esModoCrearCuadrante ? '❌ Cancelar cuadrante' : '🔲 Crear cuadrante'}
            </button>
          )}

          <button className="btn-primary" onClick={agregarPersona}>
            + Agregar persona
          </button>
        </div>
      </header>

      <main className="app-main">
        {activeTab === 'mapa' && (
          <MapView
            onMapClick={handleMapClick}
            onPinClick={handlePinClick}
            selectedPin={selectedPin}
            modoMapa={modoMapa}
            cuadranteEnCurso={cuadranteEnCurso}
            onCuadranteEnCursoChange={setCuadranteEnCurso}
            onCuadranteGuardado={handleCuadranteGuardado}
            onCancelarCuadrante={() => { setModoMapa('normal'); setCuadranteEnCurso(null); }}
            recargarTrigger={recargarTrigger}
          />
        )}
        {activeTab === 'tabla' && (
          <PersonaTable
            key={refreshKey}
            sesion={sesion}
            onEdit={(p) => { setSelectedPin(p); setFormMode('editar'); setShowForm(true); }}
          />
        )}
        {activeTab === 'estadisticas' && <StatsPanel key={refreshKey} />}
        {activeTab === 'cuadrantes'   && <CuadrantesPanel key={refreshKey} />}
        {activeTab === 'excel'        && <ExcelPanel onImportado={handleImportado} />}
      </main>

      {showForm && (
        <div className="modal-overlay" onClick={(e) => {
          if (e.target.className === 'modal-overlay') setShowForm(false);
        }}>
          <div className="modal-content">
            <PersonaForm
              modo={formMode}
              persona={formMode === 'editar' ? selectedPin : null}
              coordInicial={pendingCoords}
              onGuardado={handleGuardado}
              onCancelar={() => setShowForm(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
