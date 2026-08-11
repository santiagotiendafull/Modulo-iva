import { useEffect, useRef, useState } from 'react';
import { money, periodoLabel, esCierreDeMes } from '../format';

function origenInfo(m) {
  if (m.origen !== 'actual') return { texto: 'DDJJ', clase: 'historico' };
  if (esCierreDeMes(m.periodo, m.ultima_fecha)) return { texto: 'Pendiente DDJJ', clase: 'estimado' };
  return { texto: 'Mes en curso', clase: 'actual' };
}

export default function ResultadoFiscalMensual({ razonSocial, meses, periodoSeleccionado, onSeleccionarPeriodo, onDeseleccionar }) {
  const cajaRef = useRef(null);
  const [anioFiltro, setAnioFiltro] = useState('');

  useEffect(() => {
    if (!periodoSeleccionado) return;
    function alTocarFuera(e) {
      // El selector de período de arriba también cambia de mes: si contara como "tocar fuera",
      // deseleccionar volvería al último período en el mousedown y el click de la flecha navegaría
      // desde ahí, con lo que nunca se podía pasar del anteúltimo mes.
      if (e.target.closest?.('.selector')) return;
      if (cajaRef.current && !cajaRef.current.contains(e.target)) {
        onDeseleccionar?.();
      }
    }
    document.addEventListener('mousedown', alTocarFuera);
    return () => document.removeEventListener('mousedown', alTocarFuera);
  }, [periodoSeleccionado, onDeseleccionar]);

  if (!meses || meses.length === 0) return null;
  const anios = [...new Set(meses.map((m) => m.periodo.slice(0, 4)))].sort();
  const ordenados = [...meses]
    .filter((m) => !anioFiltro || m.periodo.startsWith(anioFiltro))
    .sort((a, b) => a.periodo.localeCompare(b.periodo));

  return (
    <div className="resultado-fiscal" ref={cajaRef}>
      <div className="resultado-fiscal-header">
        <h3>Resultado fiscal por mes — {razonSocial}</h3>
        {anios.length > 1 && (
          <select value={anioFiltro} onChange={(e) => setAnioFiltro(e.target.value)} className="resultado-fiscal-anio">
            <option value="">Todo</option>
            {anios.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        )}
      </div>
      <p className="resultado-fiscal-hint">Hacé clic en un mes para ver el detalle de comprobantes más abajo.</p>
      <div className="tabla-scroll">
        <table>
          <thead>
            <tr>
              <th className="col-concepto">Período</th>
              <th>Débito Fiscal</th>
              <th>Crédito Fiscal</th>
              <th>Saldo Técnico</th>
              <th>Saldo anterior</th>
              <th className="col-total">Saldo Resultante</th>
            </tr>
          </thead>
          <tbody>
            {ordenados.map((m, i) => {
              const aFavor = m.saldo_tecnico >= 0;
              const origen = origenInfo(m);
              const seleccionada = m.periodo === periodoSeleccionado;
              // Primer mes de un año nuevo: lleva una línea más marcada arriba para separar
              // visualmente un ejercicio del otro.
              const abreAnio = i > 0 && m.periodo.slice(0, 4) !== ordenados[i - 1].periodo.slice(0, 4);
              return (
                <tr
                  key={m.periodo}
                  className={`${seleccionada ? 'fila-seleccionada' : ''} ${abreAnio ? 'fila-abre-anio' : ''}`.trim()}
                  onClick={() => onSeleccionarPeriodo?.(m.periodo)}
                >
                  <td className="col-concepto">
                    {periodoLabel(m.periodo)}
                    <span className={`origen-pill-mini origen-${origen.clase}`}>{origen.texto}</span>
                  </td>
                  <td>{money(m.iva_ventas)}</td>
                  <td>{money(m.iva_compras)}</td>
                  <td>{money(m.diferencia)}</td>
                  <td>{money(m.saldo_tecnico_anterior)}</td>
                  <td className={`col-total ${aFavor ? 'pos' : 'neg'}`}>
                    {money(Math.abs(m.saldo_tecnico))} {aFavor ? '(a favor)' : '(a pagar)'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
