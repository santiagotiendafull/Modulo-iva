import { useState } from 'react';
import ConciliacionComprobantes from './ConciliacionComprobantes';
import ConciliacionInternaExterna from './ConciliacionInternaExterna';

const RAZONES = ['Target', 'NT'];

export default function Conciliacion({ rol, visible }) {
  const puedeVerComprobantes = rol !== 'gerente' && (visible ? visible('conciliacion.comprobantes') : true);
  const [subVista, setSubVista] = useState('interna-externa');
  const [razonSocial, setRazonSocial] = useState('Target');

  const subVistaEfectiva = puedeVerComprobantes ? subVista : 'interna-externa';

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
          {puedeVerComprobantes && (
            <button
              className={`pill-tab ${subVistaEfectiva === 'comprobantes' ? 'active' : ''}`}
              onClick={() => setSubVista('comprobantes')}
            >
              Comprobantes
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

      {subVistaEfectiva === 'comprobantes' ? (
        <ConciliacionComprobantes razonSocial={razonSocial} />
      ) : (
        <ConciliacionInternaExterna razonSocial={razonSocial} />
      )}
    </div>
  );
}
