// ============================================================
// frontend/src/App.jsx
// ============================================================

import { useState, useCallback, useEffect } from 'react';
import MapView from './components/MapView';
import PersonaTable from './components/PersonaTable';
import PersonaForm from './forms/PersonaForm';
import ExcelPanel from './components/ExcelPanel';
import StatsPanel from './components/StatsPanel';
import CuadrantesPanel from './components/CuadrantesPanel';
import { Toaster } from 'react-hot-toast';

export default function App() {
  const [activeTab,        setActiveTab]        = useState('mapa');
  const [selectedPin,      setSelectedPin]      = useState(null);
  const [showForm,         setShowForm]         = useState(false);
  const [formMode,         setFormMode]         = useState('crear');
  const [pendingCoords,    setPendingCoords]    = useState(null);
  // refreshKey: para tabla, stats, cuadrantesPanel, excel — NO para MapView
  const [refreshKey,       setRefreshKey]       = useState(0);
  // recargarTrigger: le dice al MapView que recargue pines/cuadrantes
  // sin desmontarse (sin perder zoom ni posición)
  const [recargarTrigger,  setRecargarTrigger]  = useState(0);

  const [modoMapa,          setModoMapa]          = useState('normal');
  const [cuadranteEnCurso,  setCuadranteEnCurso]  = useState(null);

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
    setRecargarTrigger(k => k + 1); // recargar pines sin desmontar mapa
    setShowForm(false);
    setPendingCoords(null);
    setSelectedPin(null);
    setModoMapa('normal');
  }, []);

  const handleImportado = useCallback(() => {
    setRefreshKey(k => k + 1);
    setRecargarTrigger(k => k + 1);
  }, []);

  // Al crear cuadrante: solo recargar capas internas del mapa, sin remontarlo
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
          <span className="header-icon">🗳️</span>
          <div>
            <h1>Medellín Electoral</h1>
            <p>Gestión geográfica y electoral por comunas</p>
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
          {activeTab === 'mapa' && (
            <button
              className="btn-secondary"
              onClick={toggleCrearCuadrante}
              style={esModoCrearCuadrante ? { background: '#F59E0B', color: 'white', borderColor: '#F59E0B' } : {}}
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
          // ⚠️ SIN key={refreshKey} — la instancia Leaflet es permanente
          // recargarTrigger le dice que recargue datos sin desmontarse
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
