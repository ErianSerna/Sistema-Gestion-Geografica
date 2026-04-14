// ============================================================
// frontend/src/components/StatsPanel.jsx
// Panel de estadísticas por comuna, barrio y cuadrante
// ============================================================

import { useState, useEffect } from 'react';
import api from '../utils/api';

export default function StatsPanel() {
  const [resumen,    setResumen]    = useState(null);
  const [porComuna,  setPorComuna]  = useState([]);
  const [porBarrio,  setPorBarrio]  = useState([]);
  const [porCuadrante, setPorCuadrante] = useState([]);
  const [tab,        setTab]        = useState('comunas');
  const [error,      setError]      = useState(null);

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

  if (error)   return <div className="loading-state" style={{ color: '#E54B4B' }}>⚠️ {error}</div>;
  if (!resumen) return <div className="loading-state">Cargando estadísticas...</div>;

  const total       = resumen.total_personas   || 0;
  const pacto       = resumen.votantes_pacto   || 0;
  const pctPacto    = total > 0 ? Math.round((pacto / total) * 100) : 0;
  const sinCuadrante = resumen.sin_cuadrante   || 0;

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
        <div className="kpi-card kpi-card--green">
          <span className="kpi-label">Votan Pacto</span>
          <span className="kpi-value">{pacto.toLocaleString()}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">% Pacto</span>
          <span className="kpi-value">{pctPacto}%</span>
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

      {/* Barra global */}
      <div className="progress-bar-container">
        <div className="progress-labels">
          <span>✅ Pacto: {pctPacto}%</span>
          <span>❌ No Pacto: {100 - pctPacto}%</span>
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${pctPacto}%` }} />
        </div>
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
            <tr><th>Comuna</th><th>Total</th><th>Pacto</th><th>No Pacto</th><th>%</th><th>Distribución</th></tr>
          </thead>
          <tbody>
            {porComuna.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign:'center', padding:'24px', color:'var(--text-secondary)' }}>Sin datos</td></tr>
            ) : porComuna.map(c => {
              const pct = parseFloat(c.pct_pacto) || 0;
              return (
                <tr key={c.comuna}>
                  <td><strong>{c.comuna}</strong></td>
                  <td>{(c.total || 0).toLocaleString()}</td>
                  <td><span className="badge badge-green">{c.pacto || 0}</span></td>
                  <td><span className="badge badge-red">{c.no_pacto || 0}</span></td>
                  <td>{pct}%</td>
                  <td style={{ width: '160px' }}>
                    <div className="mini-progress">
                      <div style={{ width: `${pct}%`, background: '#2C9A5E' }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Por barrio */}
      {tab === 'barrios' && (
        <table className="data-table">
          <thead>
            <tr><th>Barrio</th><th>Comuna</th><th>Total</th><th>Pacto</th><th>%</th></tr>
          </thead>
          <tbody>
            {porBarrio.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign:'center', padding:'24px', color:'var(--text-secondary)' }}>Sin datos</td></tr>
            ) : porBarrio.map((b, i) => (
              <tr key={i}>
                <td>{b.barrio}</td>
                <td>{b.comuna}</td>
                <td>{(b.total || 0).toLocaleString()}</td>
                <td><span className="badge badge-green">{b.pacto || 0}</span></td>
                <td>{parseFloat(b.pct_pacto) || 0}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Por cuadrante */}
      {tab === 'cuadrantes' && (
        <table className="data-table">
          <thead>
            <tr><th>Cuadrante</th><th>Código</th><th>Comuna</th><th>Total</th><th>Pacto</th></tr>
          </thead>
          <tbody>
            {porCuadrante.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign:'center', padding:'24px', color:'var(--text-secondary)' }}>Sin datos</td></tr>
            ) : porCuadrante.map((q, i) => (
              <tr key={i} style={q.cuadrante === '(sin cuadrante)' ? { color: 'var(--text-secondary)', fontStyle: 'italic' } : {}}>
                <td>{q.cuadrante}</td>
                <td style={{ fontFamily:'monospace', fontSize:'12px' }}>{q.codigo}</td>
                <td>{q.comuna}</td>
                <td>{(q.total || 0).toLocaleString()}</td>
                <td><span className="badge badge-green">{q.pacto || 0}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
