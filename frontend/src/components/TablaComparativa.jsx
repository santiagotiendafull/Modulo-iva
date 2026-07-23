import { useEffect, useState } from 'react';
import { api } from '../api';
import { money } from '../format';
import SelectorPeriodo from './SelectorPeriodo';
import TablaComparativaSkeleton from './TablaComparativaSkeleton';
import { cacheGet, cacheSet } from '../cache';
import InfoTooltip from './InfoTooltip';

const CACHE_KEY_PERIODOS = 'consolidado-periodos';
const cacheKeyDatos = (periodo) => `consolidado-comparativa-${periodo}`;

const TOOLTIP_FILA = {
  'IVA Ventas': 'Suma el IVA de todas las ventas: Facturas A, B y C. Las Notas de Crédito restan.',
  'IVA Compras': "Suma el IVA solo de Facturas A. Excluye proveedores 'No corresponde'. Incluye crédito fiscal del Formulario 931 y manual, si hay cargados.",
  'Diferencia': 'IVA Ventas menos IVA Compras del período.',
  'Saldo anterior': 'Saldo técnico que quedó al cierre del mes anterior.',
  'Saldo técnico': 'Saldo anterior más la diferencia de este mes: a favor del contribuyente o a pagar a ARCA.',
};

function fila(label, target, nt, total, resaltar) {
  return (
    <tr className={resaltar ? 'fila-resaltada' : ''}>
      <td className="col-concepto">
        {label}
        {TOOLTIP_FILA[label] && <InfoTooltip texto={TOOLTIP_FILA[label]} />}
      </td>
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
  const periodosCache = cacheGet(CACHE_KEY_PERIODOS);
  const [periodos, setPeriodos] = useState(periodosCache ?? []);
  const [periodo, setPeriodo] = useState(periodosCache?.at(-1) ?? null);
  const [datos, setDatos] = useState(() => (periodosCache ? cacheGet(cacheKeyDatos(periodosCache.at(-1))) ?? null : null));
  const [error, setError] = useState(null);
  const [cargandoPeriodos, setCargandoPeriodos] = useState(!periodosCache);

  useEffect(() => {
    let cancelado = false;
    const habiaCache = !!cacheGet(CACHE_KEY_PERIODOS);
    api.periodos('Consolidado')
      .then(({ periodos: p }) => {
        if (cancelado) return;
        setPeriodos(p);
        cacheSet(CACHE_KEY_PERIODOS, p);
        setPeriodo((actual) => (actual && p.includes(actual) ? actual : p.at(-1) ?? null));
      })
      .catch((e) => !cancelado && !habiaCache && setError(e.message))
      .finally(() => !cancelado && setCargandoPeriodos(false));
    return () => { cancelado = true; };
  }, []);

  useEffect(() => {
    if (!periodo) { setDatos(null); return; }
    let cancelado = false;
    const key = cacheKeyDatos(periodo);
    const habiaCache = !!cacheGet(key);
    setDatos(cacheGet(key) ?? null);
    api.comparativa(periodo)
      .then((d) => { if (!cancelado) { setDatos(d); cacheSet(key, d); } })
      .catch((e) => !cancelado && !habiaCache && setError(e.message));
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
