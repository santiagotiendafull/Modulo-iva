import { useEffect, useState } from 'react';
import { api } from '../api';

const ETIQUETAS_VISIBILIDAD = {
  'nav.cargar-datos': 'Cargar datos (menú)',
  'nav.proveedores': 'Proveedores (menú)',
  'cargar-datos.conciliacion-compras': 'Cargar datos → Conciliación de compras',
  'conciliacion.comprobantes': 'Conciliación → Pendientes de envío',
  'dashboard.resultado-fiscal': 'Dashboard → Resultado fiscal por mes',
  'dashboard.ventas-compras': 'Dashboard → Desglose Ventas/Compras',
  'dashboard.evolucion': 'Dashboard → Gráfico de evolución del saldo técnico',
};

function fechaHoraLabel(iso) {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function Configuracion() {
  const [accesos, setAccesos] = useState(null);
  const [usuarios, setUsuarios] = useState(null);
  const [visibilidad, setVisibilidad] = useState(null);
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(null);

  useEffect(() => {
    Promise.all([api.accesos(), api.usuarios(), api.obtenerVisibilidad()])
      .then(([a, u, v]) => { setAccesos(a); setUsuarios(u); setVisibilidad(v); })
      .catch((err) => setError(err.message));
  }, []);

  async function toggle(clave) {
    // El tilde se dibuja con `!== false`, así que el valor nuevo se calcula igual: si se usara
    // `!visibilidad[clave]`, una clave sin guardar (undefined) se vería tildada pero al tocarla
    // pediría "true" de nuevo, y el tilde no se podría sacar nunca.
    const nuevoValor = visibilidad[clave] === false;
    setGuardando(clave);
    setVisibilidad((v) => ({ ...v, [clave]: nuevoValor }));
    try {
      const actualizado = await api.establecerVisibilidad({ [clave]: nuevoValor });
      setVisibilidad(actualizado);
    } catch (err) {
      setError(err.message);
      setVisibilidad((v) => ({ ...v, [clave]: !nuevoValor }));
    } finally {
      setGuardando(null);
    }
  }

  return (
    <div className="configuracion">
      <div className="proveedores-intro">
        <h2>Configuración</h2>
        <p className="nota">
          Solo visible para el rol dev. Acá se controla qué apartados de la app ve cada rol y se
          puede revisar quién entró y cuándo.
        </p>
      </div>

      {error && <p className="error-banner">{error}</p>}

      <div className="tabla-comparativa">
        <div className="tabla-comparativa-header">
          <h3>Visibilidad por apartado</h3>
        </div>
        <p className="nota">
          Estos interruptores ocultan secciones para gerente y administrador. El rol dev siempre
          ve todo, aunque él mismo apague algo acá.
        </p>
        <div className="visibilidad-lista">
          {/* Se listan las claves que devuelve el backend, no una copia local: si el frontend
              inventara una que el backend no conoce, el interruptor no haría nada al tocarlo. */}
          {visibilidad && Object.keys(visibilidad).map((clave) => (
            <label key={clave} className="visibilidad-item">
              <input
                type="checkbox"
                checked={visibilidad[clave] !== false}
                disabled={guardando === clave}
                onChange={() => toggle(clave)}
              />
              {ETIQUETAS_VISIBILIDAD[clave] ?? clave}
            </label>
          ))}
        </div>
      </div>

      <div className="tabla-comparativa">
        <div className="tabla-comparativa-header">
          <h3>Usuarios</h3>
        </div>
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th className="col-concepto">Usuario</th>
                <th>Rol</th>
                <th>Creado</th>
              </tr>
            </thead>
            <tbody>
              {usuarios?.map((u) => (
                <tr key={u.username}>
                  <td className="col-concepto">{u.username}</td>
                  <td>{u.rol}</td>
                  <td>{fechaHoraLabel(u.creado_en)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="tabla-comparativa">
        <div className="tabla-comparativa-header">
          <h3>Historial de accesos</h3>
        </div>
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>Fecha y hora</th>
                <th className="col-concepto">Usuario</th>
                <th>Rol</th>
                <th>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {accesos?.map((a, i) => (
                <tr key={i}>
                  <td>{fechaHoraLabel(a.fecha_hora)}</td>
                  <td className="col-concepto">{a.username}</td>
                  <td>{a.rol || '—'}</td>
                  <td>
                    <span className={`estado-pill ${a.exito ? 'estado-pill-ok' : 'estado-pill-falta'}`}>
                      {a.exito ? 'Éxito' : 'Fallido'}
                    </span>
                  </td>
                </tr>
              ))}
              {accesos?.length === 0 && (
                <tr><td colSpan={4} className="bloque-nota">Todavía no hay accesos registrados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
