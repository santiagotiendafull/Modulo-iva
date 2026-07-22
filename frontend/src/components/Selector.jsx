import { periodoLabelCompleto } from '../format';

const RAZONES = ['Target', 'NT', 'Consolidado'];

export default function Selector({ razonSocial, setRazonSocial, periodo, periodos, onCambiarPeriodo }) {
  const indice = periodos?.indexOf(periodo) ?? -1;
  const hayAnterior = indice > 0;
  const haySiguiente = indice !== -1 && indice < periodos.length - 1;

  return (
    <div className="selector">
      <div className="razon-tabs">
        {RAZONES.map((r) => (
          <button
            key={r}
            className={`razon-tab ${razonSocial === r ? 'active' : ''}`}
            onClick={() => setRazonSocial(r)}
          >
            {r}
          </button>
        ))}
      </div>
      {periodo && (
        <div className="selector-periodo-nav">
          <button
            type="button"
            className="selector-periodo-flecha"
            onClick={() => onCambiarPeriodo?.(periodos[indice - 1])}
            disabled={!hayAnterior}
            aria-label="Mes anterior"
          >
            ‹
          </button>
          <div className="selector-periodo">{periodoLabelCompleto(periodo)}</div>
          <button
            type="button"
            className="selector-periodo-flecha"
            onClick={() => onCambiarPeriodo?.(periodos[indice + 1])}
            disabled={!haySiguiente}
            aria-label="Mes siguiente"
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}
