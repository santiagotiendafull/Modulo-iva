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

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// El plan gratuito de Render a veces tarda unos segundos en responder el primer pedido después de
// estar inactivo (o justo después de un redeploy) — eso hace fallar el fetch a nivel de red (no es
// un usuario/contraseña incorrectos, que da un error distinto). En ese caso se reintenta solo, para
// no depender de que la persona se dé cuenta y vuelva a apretar "Ingresar".
async function loginConReintento(username, clave, intento = 1) {
  try {
    return await api.login(username, clave);
  } catch (err) {
    if (err instanceof TypeError && intento < 3) {
      await esperar(2500);
      return loginConReintento(username, clave, intento + 1);
    }
    throw err;
  }
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
      const sesion = await loginConReintento(username, clave);
      setToken(sesion.token);
      guardarSesion(sesion);
      onIngresar(sesion);
    } catch (err) {
      setError(err instanceof TypeError ? 'No se pudo conectar con el servidor. Probá de nuevo en unos segundos.' : err.message);
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
