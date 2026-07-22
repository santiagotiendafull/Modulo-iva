import { useState } from 'react';

const CLAVE_CORRECTA = 'IVAfull';
const STORAGE_KEY = 'modulo-iva-autenticado';

export function estaAutenticado() {
  return localStorage.getItem(STORAGE_KEY) === 'true';
}

export default function Login({ onIngresar }) {
  const [clave, setClave] = useState('');
  const [error, setError] = useState(false);

  function enviar(e) {
    e.preventDefault();
    if (clave === CLAVE_CORRECTA) {
      localStorage.setItem(STORAGE_KEY, 'true');
      onIngresar();
    } else {
      setError(true);
    }
  }

  return (
    <div className="login-shell">
      <form className="login-box" onSubmit={enviar}>
        <img src="/logo-tiendafull.svg" alt="Tienda Full" className="login-logo" />
        <h1>Módulo IVA al día</h1>
        <p className="subtitle">Ingresá la contraseña para continuar</p>
        <input
          type="password"
          className="login-input"
          placeholder="Contraseña"
          value={clave}
          autoFocus
          onChange={(e) => { setClave(e.target.value); setError(false); }}
        />
        {error && <p className="login-error">Contraseña incorrecta</p>}
        <button type="submit" className="login-btn">Ingresar</button>
      </form>
    </div>
  );
}
