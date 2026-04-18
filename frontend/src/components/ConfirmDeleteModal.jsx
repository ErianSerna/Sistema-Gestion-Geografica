// ============================================================
// frontend/src/components/ConfirmDeleteModal.jsx
// Modal de confirmación con contraseña para eliminar datos
// ============================================================

import { useState, useEffect, useRef } from 'react';

// Contraseña fija de autorización para eliminar
const DELETE_PASSWORD = 'admin';

/**
 * Modal que solicita contraseña antes de permitir eliminar.
 *
 * Props:
 *   mensaje  — texto descriptivo de lo que se va a eliminar
 *   onConfirm — callback cuando la contraseña es correcta
 *   onCancelar — callback cuando se cancela o cierra
 */
export default function ConfirmDeleteModal({ mensaje, onConfirm, onCancelar }) {
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const inputRef                = useRef(null);

  useEffect(() => {
    // Foco automático al abrir el modal
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const handleConfirm = () => {
    if (password === DELETE_PASSWORD) {
      onConfirm();
    } else {
      setError('Contraseña incorrecta. No se puede eliminar.');
      setPassword('');
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleConfirm();
    if (e.key === 'Escape') onCancelar();
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancelar(); }}
    >
      <div style={{
        background: 'white', borderRadius: '12px', padding: '28px 24px',
        width: '100%', maxWidth: '380px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        fontFamily: 'system-ui, sans-serif',
      }}>
        {/* Icono y título */}
        <div style={{ textAlign: 'center', marginBottom: '16px' }}>
          <div style={{ fontSize: '40px', marginBottom: '8px' }}>🔒</div>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#111' }}>
            Confirmar eliminación
          </h3>
        </div>

        {/* Mensaje */}
        <p style={{
          fontSize: '13px', color: '#555', textAlign: 'center',
          margin: '0 0 20px', lineHeight: 1.5,
          background: '#FEF2F2', borderRadius: '8px', padding: '10px 12px',
          borderLeft: '3px solid #EF4444',
        }}>
          {mensaje}
        </p>

        {/* Input contraseña */}
        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
          Ingresa la contraseña para autorizar:
        </label>
        <input
          ref={inputRef}
          type="password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(''); }}
          onKeyDown={handleKeyDown}
          placeholder="Contraseña de autorización"
          style={{
            width: '100%', padding: '9px 12px', borderRadius: '8px',
            border: error ? '1.5px solid #EF4444' : '1.5px solid #D1D5DB',
            fontSize: '14px', outline: 'none', boxSizing: 'border-box',
            transition: 'border-color 0.15s',
          }}
        />
        {error && (
          <p style={{ fontSize: '12px', color: '#EF4444', margin: '5px 0 0', fontWeight: 500 }}>
            ⚠️ {error}
          </p>
        )}

        {/* Botones */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
          <button
            onClick={onCancelar}
            style={{
              flex: 1, padding: '9px', borderRadius: '8px', border: '1.5px solid #D1D5DB',
              background: 'white', color: '#374151', fontSize: '13px', fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            style={{
              flex: 1, padding: '9px', borderRadius: '8px', border: 'none',
              background: '#EF4444', color: 'white', fontSize: '13px', fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            🗑️ Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}
