import { periodoLabelCompleto } from '../format';

export default function SelectorPeriodo({ periodo, periodos, onCambiarPeriodo }) {
  if (!periodo) return null;
  const indice = periodos?.indexOf(periodo) ?? -1;
  const hayAnterior = indice > 0;
  const haySiguiente = indice !== -1 && indice < periodos.length - 1;

  return (
    <div className="periodo-nav">
      <button
        type="button"
        className="periodo-nav-flecha"
        onClick={() => onCambiarPeriodo?.(periodos[indice - 1])}
        disabled={!hayAnterior}
        aria-label="Mes anterior"
      >
        ‹
      </button>
      <div className="periodo-nav-label">{periodoLabelCompleto(periodo)}</div>
      <button
        type="button"
        className="periodo-nav-flecha"
        onClick={() => onCambiarPeriodo?.(periodos[indice + 1])}
        disabled={!haySiguiente}
        aria-label="Mes siguiente"
      >
        ›
      </button>
    </div>
  );
}
