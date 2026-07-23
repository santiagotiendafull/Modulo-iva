import { useState } from 'react';
import { api, setToken } from '../api';

const STORAGE_KEY = 'modulo-iva-sesion';

// sessionStorage (no localStorage): la sesión sobrevive a un F5 pero se borra sola al
// cerrar la pestaña o el navegador — así cada persona vuelve a loguearse en su próxima visita.
export function sesionGuardada() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function guardarSesion(sesion) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(sesion));
}

export function borrarSesion() {
  sessionStorage.removeItem(STORAGE_KEY);
}

export default function Login({ onIngresar }) {
  const [username, setUsername] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const sesion = await api.login(username, clave);
      setToken(sesion.token);
      guardarSesion(sesion);
      onIngresar(sesion);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="login-shell">
      <form className="login-box" onSubmit={enviar}>
        <img src="/logo-tiendafull.svg" alt="Tienda Full" className="login-logo" />
        <h1>Módulo IVA al día</h1>
        <p className="subtitle">Ingresá con tu usuario para continuar</p>
        <input
          type="text"
          className="login-input"
          placeholder="Usuario"
          value={username}
          autoFocus
          autoComplete="username"
          onChange={(e) => { setUsername(e.target.value); setError(null); }}
        />
        <input
          type="password"
          className="login-input"
          placeholder="Contraseña"
          value={clave}
          autoComplete="current-password"
          onChange={(e) => { setClave(e.target.value); setError(null); }}
        />
        {error && <p className="login-error">{error}</p>}
        <button type="submit" className="login-btn" disabled={enviando}>
          {enviando ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}
