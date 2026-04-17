// ============================================================
// frontend/src/components/ExcelPanel.jsx
// Panel de importación/exportación Excel (bidireccional)
// ============================================================

import { useState, useRef } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';

export default function ExcelPanel({ onImportado }) {
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [progreso, setProgreso] = useState('');
  const fileRef = useRef();

  const importar = async (e) => {
    const archivo = e.target.files[0];
    if (!archivo) return;

    setImportando(true);
    setResultado(null);
    setProgreso('Leyendo archivo Excel...');

    const form = new FormData();
    form.append('archivo', archivo);

    try {
      setProgreso('Geocodificando direcciones (puede tardar)...');
      const { data } = await api.post('/excel/importar', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000 // 2 minutos para geocodificación masiva
      });

      setResultado(data);
      toast.success(`✅ ${data.exitosos} registros importados al mapa`);
      onImportado();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error importando Excel');
    } finally {
      setImportando(false);
      setProgreso('');
      fileRef.current.value = '';
    }
  };

  const exportar = async () => {
    try {
      const response = await api.get('/excel/exportar', {
        responseType: 'blob'
      });
      const url = URL.createObjectURL(response.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `votantes_${new Date().toISOString().slice(0,10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('✅ Excel descargado');
    } catch (err) {
      toast.error('Error exportando');
    }
  };

  const descargarPlantilla = async () => {
    try {
      const response = await api.get('/excel/plantilla', { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'plantilla_votantes.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error('Error descargando plantilla');
    }
  };

  return (
    <div className="excel-panel">
      <h2>📥 Manejo de Excel</h2>
      <p className="panel-desc">
        Sincronización bidireccional: importa desde Excel para crear pines en el mapa,
        o exporta los datos actuales del mapa a Excel.
      </p>

      <div className="excel-cards">
        {/* Importar */}
        <div className="excel-card">
          <div className="excel-card-icon">⬆️</div>
          <h3>Importar Excel → Mapa</h3>
          <p>Sube un archivo .xlsx con personas. El sistema geocodificará las direcciones y creará los pines automáticamente.</p>

          <div className="columns-hint">
            <strong>Columnas esperadas:</strong>
            <code>nombre, cedula, telefono, direccion, comuna, barrio, vota, latitud, longitud</code>
            <em>(lat/lon opcionales si hay dirección)</em>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button onClick={descargarPlantilla} className="btn-secondary">
              📋 Descargar plantilla
            </button>
          </div>

          <label className={`upload-btn ${importando ? 'disabled' : ''}`}>
            {importando ? `⏳ ${progreso}` : '📂 Seleccionar archivo .xlsx'}
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={importar}
              disabled={importando}
              style={{ display: 'none' }}
            />
          </label>
        </div>

        {/* Exportar */}
        <div className="excel-card">
          <div className="excel-card-icon">⬇️</div>
          <h3>Exportar Mapa → Excel</h3>
          <p>Descarga todos los datos actuales de la base de datos en formato Excel, con resumen por comuna incluido.</p>
          <button onClick={exportar} className="btn-primary" style={{ marginTop: 'auto' }}>
            📥 Descargar Excel
          </button>
        </div>
      </div>

      {/* Resultado de importación */}
      {resultado && (
        <div className="import-result">
          <h3>📊 Resultado de importación</h3>
          <div className="result-stats">
            <div className="stat-item success">
              <span className="stat-num">{resultado.exitosos}</span>
              <span className="stat-lbl">Importados</span>
            </div>
            <div className="stat-item info">
              <span className="stat-num">{resultado.total_filas}</span>
              <span className="stat-lbl">Total filas</span>
            </div>
            <div className="stat-item warn">
              <span className="stat-num">
                {resultado.errores_validacion?.length + resultado.errores_bd?.length}
              </span>
              <span className="stat-lbl">Con errores</span>
            </div>
          </div>

          {resultado.errores_validacion?.length > 0 && (
            <details style={{ marginTop: '12px' }}>
              <summary style={{ cursor: 'pointer', color: '#B45309' }}>
                ⚠️ {resultado.errores_validacion.length} filas con problemas
              </summary>
              <ul className="error-list">
                {resultado.errores_validacion.slice(0, 10).map((e, i) => (
                  <li key={i}>Fila {e.fila}: {e.error}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}


