import { useState } from 'react';
import EnvioEstudio from './EnvioEstudio';
import ConciliacionInternaExterna from './ConciliacionInternaExterna';
import { cacheGet, cacheSet } from '../cache';

const RAZONES = ['Target', 'NT'];
const CACHE_KEY_SUBVISTA = 'conciliacion-subvista';
const CACHE_KEY_RAZON_SOCIAL = 'conciliacion-razon-social';

export default function Conciliacion({ rol, visible }) {
  const puedeVerPendientes = rol !== 'gerente' && (visible ? visible('conciliacion.comprobantes') : true);
  // Recordar la sub-pestaña y razón social elegidas para que al volver a Conciliación (después de
  // navegar a otra sección) siga donde estaba, en vez de resetear siempre a Target/Interna vs Externa.
  const [subVista, setSubVistaState] = useState(() => cacheGet(CACHE_KEY_SUBVISTA) ?? 'interna-externa');
  const [razonSocial, setRazonSocialState] = useState(() => cacheGet(CACHE_KEY_RAZON_SOCIAL) ?? 'Target');

  function setSubVista(v) {
    setSubVistaState(v);
    cacheSet(CACHE_KEY_SUBVISTA, v);
  }
  function setRazonSocial(r) {
    setRazonSocialState(r);
    cacheSet(CACHE_KEY_RAZON_SOCIAL, r);
  }

  const subVistaEfectiva = puedeVerPendientes ? subVista : 'interna-externa';

  return (
    <div className="conciliacion">
      <div className="conciliacion-subnav">
        <div className="pill-tabs">
          <button
            className={`pill-tab ${subVistaEfectiva === 'interna-externa' ? 'active' : ''}`}
            onClick={() => setSubVista('interna-externa')}
          >
            Interna vs Externa
          </button>
          {puedeVerPendientes && (
            <button
              className={`pill-tab ${subVistaEfectiva === 'pendientes-estudio' ? 'active' : ''}`}
              onClick={() => setSubVista('pendientes-estudio')}
            >
              Pendientes de envío
            </button>
          )}
        </div>
        <div className="razon-tabs">
          {RAZONES.map((r) => (
            <button key={r} className={`razon-tab ${razonSocial === r ? 'active' : ''}`} onClick={() => setRazonSocial(r)}>
              {r}
            </button>
          ))}
        </div>
      </div>

      {subVistaEfectiva === 'pendientes-estudio' ? (
        <EnvioEstudio razonSocial={razonSocial} />
      ) : (
        <ConciliacionInternaExterna razonSocial={razonSocial} />
      )}
    </div>
  );
}
