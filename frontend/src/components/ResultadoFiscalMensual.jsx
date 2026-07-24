import { useEffect, useRef } from 'react';
import { money, periodoLabel, esCierreDeMes } from '../format';

function origenInfo(m) {
  if (m.origen !== 'actual') return { texto: 'DDJJ', clase: 'historico' };
  if (esCierreDeMes(m.periodo, m.ultima_fecha)) return { texto: 'Pendiente DDJJ', clase: 'estimado' };
  return { texto: 'Mes en curso', clase: 'actual' };
}

export default function ResultadoFiscalMensual({ razonSocial, meses, periodoSeleccionado, onSeleccionarPeriodo, onDeseleccionar }) {
  const cajaRef = useRef(null);

  useEffect(() => {
    if (!periodoSeleccionado) return;
    function alTocarFuera(e) {
      if (cajaRef.current && !cajaRef.current.contains(e.target)) {
        onDeseleccionar?.();
      }
    }
    document.addEventListener('mousedown', alTocarFuera);
    return () => document.removeEventListener('mousedown', alTocarFuera);
  }, [periodoSeleccionado, onDeseleccionar]);

  if (!meses || meses.length === 0) return null;
  const ordenados = [...meses].sort((a, b) => a.periodo.localeCompare(b.periodo));

  return (
    <div className="resultado-fiscal" ref={cajaRef}>
      <h3>Resultado fiscal por mes — {razonSocial}</h3>
      <p className="resultado-fiscal-hint">Hacé clic en un mes para ver el detalle de comprobantes más abajo.</p>
      <div className="tabla-scroll">
        <table>
          <thead>
            <tr>
              <th className="col-concepto">Período</th>
              <th>IVA Ventas</th>
              <th>IVA Compras</th>
              <th>Saldo Técnico</th>
              <th>Saldo anterior</th>
              <th className="col-total">Saldo Resultante</th>
            </tr>
          </thead>
          <tbody>
            {ordenados.map((m) => {
              const aFavor = m.saldo_tecnico >= 0;
              const origen = origenInfo(m);
              const seleccionada = m.periodo === periodoSeleccionado;
              return (
                <tr
                  key={m.periodo}
                  className={seleccionada ? 'fila-seleccionada' : ''}
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
