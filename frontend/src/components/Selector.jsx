import SelectorPeriodo from './SelectorPeriodo';

const RAZONES = ['Target', 'NT', 'Consolidado'];

export default function Selector({ razonSocial, setRazonSocial, periodo, periodos, onCambiarPeriodo }) {
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
      <SelectorPeriodo periodo={periodo} periodos={periodos} onCambiarPeriodo={onCambiarPeriodo} />
    </div>
  );
}
