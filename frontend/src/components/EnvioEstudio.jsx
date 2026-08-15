import { useState } from 'react';
import PendientesEstudio from './PendientesEstudio';
import ControlMensual from './ControlMensual';
import CompararEnvio from './CompararEnvio';

const SUBVISTAS = [
  { id: 'pide-estudio', label: 'Lo que pide el estudio' },
  { id: 'control-mensual', label: 'Control mensual' },
  { id: 'comparar', label: 'Comparar' },
];

// Todo lo que antes era "Pendientes de envío" ahora vive acá, repartido en 3 vistas que resuelven
// dos cosas distintas: lo que el ESTUDIO dice que le falta (pide-estudio, tal cual estaba) y el
// control PROPIO de lo que se manda cada mes (control-mensual, que incluye los comprobantes
// cargados a mano — se agregan desde un popup ahí mismo), con una vista para cruzar ambas (comparar)
// y detectar cuando el estudio dice que algo falta pero acá ya está marcado como enviado.
export default function EnvioEstudio({ razonSocial }) {
  const [subVista, setSubVista] = useState('pide-estudio');

  return (
    <div className="envio-estudio">
      <div className="pill-tabs pill-tabs-secundaria">
        {SUBVISTAS.map((v) => (
          <button
            key={v.id}
            className={`pill-tab ${subVista === v.id ? 'active' : ''}`}
            onClick={() => setSubVista(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>

      {subVista === 'pide-estudio' && <PendientesEstudio razonSocial={razonSocial} />}
      {subVista === 'control-mensual' && <ControlMensual razonSocial={razonSocial} />}
      {subVista === 'comparar' && <CompararEnvio razonSocial={razonSocial} />}
    </div>
  );
}
