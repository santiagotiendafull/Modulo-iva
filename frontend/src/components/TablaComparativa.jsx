import { useEffect, useState } from 'react';
import { api } from '../api';
import { money } from '../format';
import SelectorPeriodo from './SelectorPeriodo';
import TablaComparativaSkeleton from './TablaComparativaSkeleton';

function fila(label, target, nt, total, resaltar) {
  return (
    <tr className={resaltar ? 'fila-resaltada' : ''}>
      <td className="col-concepto">{label}</td>
      <td>{money(target)}</td>
      <td>{money(nt)}</td>
      <td className="col-total">{money(total)}</td>
    </tr>
  );
}

function estadoRazon(nombre, p) {
  if (!p) return { nombre, texto: 'Sin datos cargados', tipo: 'neutro' };
  if (p.saldo_tecnico < 0) return { nombre, texto: `A pagar ${money(-p.saldo_tecnico)}`, tipo: 'debe' };
  if (p.saldo_tecnico > 0) return { nombre, texto: `A favor ${money(p.saldo_tecnico)}`, tipo: 'favor' };
  return { nombre, texto: 'Saldo en cero', tipo: 'neutro' };
}

export default function TablaComparativa() {
  const [periodos, setPeriodos] = useState([]);
  const [periodo, setPeriodo] = useState(null);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [cargandoPeriodos, setCargandoPeriodos] = useState(true);

  useEffect(() => {
    let cancelado = false;
    api.periodos('Consolidado')
      .then(({ periodos: p }) => {
        if (cancelado) return;
        setPeriodos(p);
        setPeriodo((actual) => (actual && p.includes(actual) ? actual : p.at(-1) ?? null));
      })
      .catch((e) => !cancelado && setError(e.message))
      .finally(() => !cancelado && setCargandoPeriodos(false));
    return () => { cancelado = true; };
  }, []);

  useEffect(() => {
    if (!periodo) { setDatos(null); return; }
    let cancelado = false;
    api.comparativa(periodo).then((d) => !cancelado && setDatos(d)).catch((e) => !cancelado && setError(e.message));
    return () => { cancelado = true; };
  }, [periodo]);

  if (error) return <p className="error-banner">{error}</p>;
  if (cargandoPeriodos || (periodo && !datos)) return <TablaComparativaSkeleton />;
  if (periodos.length === 0) return null;

  const nt = datos.razones.NT;
  const target = datos.razones.Target;
  const { total } = datos;
  const montoAPagar = total.a_pagar;
  const hayPagoPendiente = montoAPagar > 0;
  const estados = [estadoRazon('Target', target), estadoRazon('NT', nt)];

  return (
    <div className="tabla-comparativa">
      <div className="tabla-comparativa-header">
        <h3>Posición consolidada Target + NT</h3>
        <SelectorPeriodo periodo={periodo} periodos={periodos} onCambiarPeriodo={setPeriodo} />
      </div>
      <div className="tabla-scroll">
        <table>
          <thead>
            <tr>
              <th className="col-concepto">Concepto</th>
              <th>Target {!target && <span className="sin-datos-marca">sin datos</span>}</th>
              <th>NT {!nt && <span className="sin-datos-marca">sin datos</span>}</th>
              <th className="col-total">Total</th>
            </tr>
          </thead>
          <tbody>
            {fila('IVA Ventas', target?.iva_ventas, nt?.iva_ventas, total.iva_ventas)}
            {fila('IVA Compras', target?.iva_compras, nt?.iva_compras, total.iva_compras)}
            {fila('Diferencia', target?.diferencia, nt?.diferencia, total.diferencia, true)}
            {fila('Saldo anterior', target?.saldo_tecnico_anterior, nt?.saldo_tecnico_anterior, total.saldo_tecnico_anterior)}
            {fila('Saldo técnico', target?.saldo_tecnico, nt?.saldo_tecnico, total.saldo_tecnico, true)}
          </tbody>
        </table>
      </div>
      <div className={`monto-a-pagar ${hayPagoPendiente ? 'debe' : 'favor'}`}>
        <div className="monto-a-pagar-label">
          {hayPagoPendiente ? 'Plata que la empresa necesita juntar este mes' : 'Sin pagos pendientes este mes'}
        </div>
        <div className="monto-a-pagar-valor">{money(hayPagoPendiente ? montoAPagar : total.a_favor)}</div>
        <div className="monto-a-pagar-desglose">
          {estados.map((e) => (
            <div key={e.nombre} className={`desglose-item desglose-${e.tipo}`}>
              <span className="desglose-nombre">{e.nombre}</span>
              <span className="desglose-texto">{e.texto}</span>
            </div>
          ))}
        </div>
        <p className="monto-a-pagar-nota">
          Target y NT son CUIT distintos ante ARCA: lo que una tiene a favor no compensa lo que la otra debe pagar.
          El monto a juntar suma solo lo que cada una debe pagar, aunque la otra esté a favor.
        </p>
      </div>
    </div>
  );
}
