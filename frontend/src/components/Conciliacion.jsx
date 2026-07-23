import { useState } from 'react';
import PendientesEstudio from './PendientesEstudio';
import ConciliacionInternaExterna from './ConciliacionInternaExterna';

const RAZONES = ['Target', 'NT'];

export default function Conciliacion({ rol, visible }) {
  const puedeVerPendientes = rol !== 'gerente' && (visible ? visible('conciliacion.comprobantes') : true);
  const [subVista, setSubVista] = useState('interna-externa');
  const [razonSocial, setRazonSocial] = useState('Target');

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
        <PendientesEstudio razonSocial={razonSocial} />
      ) : (
        <ConciliacionInternaExterna razonSocial={razonSocial} />
      )}
    </div>
  );
}
