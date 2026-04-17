// ============================================================
// frontend/src/components/StatsPanel.jsx
// Panel de estadísticas por comuna, barrio y cuadrante
// ============================================================

import { useState, useEffect } from 'react';
import api from '../utils/api';

export default function StatsPanel() {
  const [resumen,      setResumen]      = useState(null);
  const [porComuna,    setPorComuna]    = useState([]);
  const [porBarrio,    setPorBarrio]    = useState([]);
  const [porCuadrante, setPorCuadrante] = useState([]);
  const [tab,          setTab]          = useState('comunas');
  const [error,        setError]        = useState(null);

  useEffect(() => {
    Promise.all([
      api.get('/estadisticas'),
      api.get('/estadisticas/por-comuna'),
      api.get('/estadisticas/por-barrio'),
      api.get('/estadisticas/por-cuadrante'),
    ]).then(([r, c, b, q]) => {
      setResumen(r.data);
      setPorComuna(c.data);
      setPorBarrio(b.data);
      setPorCuadrante(q.data);
    }).catch(err => {
      console.error(err);
      setError('Error cargando estadísticas');
    });
  }, []);

  if (error)    return <div className="loading-state" style={{ color: '#E54B4B' }}>⚠️ {error}</div>;
  if (!resumen) return <div className="loading-state">Cargando estadísticas...</div>;

  const total        = resumen.total_personas || 0;
  const sinCuadrante = resumen.sin_cuadrante  || 0;

  const TABS = [
    { id: 'comunas',    label: 'Por comuna' },
    { id: 'barrios',    label: 'Por barrio' },
    { id: 'cuadrantes', label: 'Por cuadrante' },
  ];

  return (
    <div className="stats-panel">

      {/* KPIs */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <span className="kpi-label">Total personas</span>
          <span className="kpi-value">{total.toLocaleString()}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Comunas</span>
          <span className="kpi-value">{resumen.total_comunas || 0}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Barrios</span>
          <span className="kpi-value">{resumen.total_barrios || 0}</span>
        </div>
        {sinCuadrante > 0 && (
          <div className="kpi-card" style={{ border: '0.5px solid #F59E0B' }}>
            <span className="kpi-label">Sin cuadrante</span>
            <span className="kpi-value" style={{ color: '#B45309' }}>{sinCuadrante}</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="stats-tabs">
        {TABS.map(t => (
          <button key={t.id} className={`tab-btn ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Por comuna */}
      {tab === 'comunas' && (
        <table className="data-table">
          <thead>
            <tr><th>Comuna</th><th>Total personas</th></tr>
          </thead>
          <tbody>
            {porComuna.length === 0 ? (
              <tr><td colSpan={2} style={{ textAlign:'center', padding:'24px', color:'var(--text-secondary)' }}>Sin datos</td></tr>
            ) : porComuna.map(c => (
              <tr key={c.comuna}>
                <td><strong>{c.comuna}</strong></td>
                <td>{(c.total || 0).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Por barrio */}
      {tab === 'barrios' && (
        <table className="data-table">
          <thead>
            <tr><th>Barrio</th><th>Comuna</th><th>Total personas</th></tr>
          </thead>
          <tbody>
            {porBarrio.length === 0 ? (
              <tr><td colSpan={3} style={{ textAlign:'center', padding:'24px', color:'var(--text-secondary)' }}>Sin datos</td></tr>
            ) : porBarrio.map((b, i) => (
              <tr key={i}>
                <td>{b.barrio}</td>
                <td>{b.comuna}</td>
                <td>{(b.total || 0).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Por cuadrante */}
      {tab === 'cuadrantes' && (
        <table className="data-table">
          <thead>
            <tr><th>Cuadrante</th><th>Código</th><th>Total personas</th></tr>
          </thead>
          <tbody>
            {porCuadrante.length === 0 ? (
              <tr><td colSpan={3} style={{ textAlign:'center', padding:'24px', color:'var(--text-secondary)' }}>Sin datos</td></tr>
            ) : porCuadrante.map((q, i) => (
              <tr key={i} style={q.cuadrante === '(sin cuadrante)' ? { color: 'var(--text-secondary)', fontStyle: 'italic' } : {}}>
                <td>{q.cuadrante}</td>
                <td style={{ fontFamily:'monospace', fontSize:'12px' }}>{q.codigo}</td>
                <td>{(q.total || 0).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
