import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { money, periodoLabel, esCierreDeMes } from '../format';
import SelectorPeriodo from './SelectorPeriodo';
import { cacheGet, cacheSet } from '../cache';
import InfoTooltip from './InfoTooltip';

const TOLERANCIA = 1; // redondeos de centavos entre metodologías no cuentan como diferencia real

function estadoFila(fila) {
  if (fila.interno && fila.externo) {
    return Math.abs(fila.diferencia_total) < TOLERANCIA
      ? { tipo: 'ok', texto: 'Coincide' }
      : { tipo: 'falta', texto: 'Hay diferencia' };
  }
  if (fila.externo && !fila.interno) {
    return { tipo: 'info', texto: 'Sin comprobantes cargados' };
  }
  const completo = esCierreDeMes(fila.periodo, fila.ultima_fecha_arca);
  return completo
    ? { tipo: 'warn', texto: 'Cerrado, sin DDJJ todavía' }
    : { tipo: 'neutro', texto: 'Mes en curso' };
}

function EstadoPill({ estado }) {
  return <span className={`estado-pill estado-pill-${estado.tipo}`}>{estado.texto}</span>;
}

const TOOLTIP_CARD = {
  Interno: 'Nuestro propio cálculo, con la misma metodología del Dashboard, a partir de los comprobantes ya cargados en Cargar Datos.',
  Externo: 'Lo que presentó el estudio contable (DDJJ) para ese período.',
  Diferencia: 'Interno menos Externo. Una diferencia real (no solo redondeo) puede indicar comprobantes que faltan cargar o un desfasaje con la DDJJ presentada.',
};

function CardComparacion({ label, sublabel, valor }) {
  return (
    <div className="card">
      <div className="card-label">
        {label}
        {TOOLTIP_CARD[label] && <InfoTooltip texto={TOOLTIP_CARD[label]} />}
      </div>
      {sublabel && <div className="card-sublabel">{sublabel}</div>}
      <div className="card-value">{valor != null ? money(valor) : '—'}</div>
    </div>
  );
}

function GrupoComparacion({ titulo, subtituloInterno, subtituloExterno, interno, externo, diferencia, credito931 }) {
  const hayDiferencia = diferencia != null && Math.abs(diferencia) >= TOLERANCIA;
  return (
    <div className="grupo-comparacion">
      <h4 className="grupo-comparacion-titulo">{titulo}</h4>
      <div className="grupo-comparacion-cards">
        <CardComparacion label="Interno" sublabel={subtituloInterno} valor={interno} />
        <CardComparacion label="Externo" sublabel={subtituloExterno} valor={externo} />
        <div className={`card card-diferencia ${diferencia == null ? '' : hayDiferencia ? 'card-diferencia-alerta' : 'card-diferencia-ok'}`}>
          <div className="card-label">
            Diferencia
            <InfoTooltip texto={TOOLTIP_CARD.Diferencia} />
          </div>
          <div className={`card-value ${diferencia == null ? '' : hayDiferencia ? 'neg' : 'pos'}`}>
            {diferencia != null ? money(diferencia) : '—'}
          </div>
        </div>
      </div>
      {credito931 > 0 && (
        <p className="bloque-credito-931">Interno incluye {money(credito931)} de crédito fiscal por Formulario 931.</p>
      )}
    </div>
  );
}

export default function ConciliacionInternaExterna({ razonSocial }) {
  const cacheKeyInicial = `conciliacion-interna-externa-${razonSocial}`;
  const cacheadoInicial = cacheGet(cacheKeyInicial);
  const [datos, setDatos] = useState(cacheadoInicial ?? null);
  const [cargando, setCargando] = useState(!cacheadoInicial);
  const [error, setError] = useState(null);
  const [periodoSeleccionado, setPeriodoSeleccionado] = useState(() => {
    const periodos = cacheadoInicial?.filas?.map((f) => f.periodo) ?? [];
    return periodos.at(-1) ?? null;
  });

  const recargar = useCallback(async () => {
    const key = `conciliacion-interna-externa-${razonSocial}`;
    const habiaCache = !!cacheGet(key);
    setDatos(cacheGet(key) ?? null);
    setCargando(!habiaCache);
    if (!habiaCache) setError(null);
    try {
      const r = await api.conciliacionInternaExterna(razonSocial);
      setDatos(r);
      cacheSet(key, r);
      setPeriodoSeleccionado((actual) => {
        const periodos = r.filas.map((f) => f.periodo);
        return actual && periodos.includes(actual) ? actual : periodos.at(-1) ?? null;
      });
    } catch (err) {
      if (!habiaCache) setError(err.message);
    } finally {
      setCargando(false);
    }
  }, [razonSocial]);

  useEffect(() => { recargar(); }, [recargar]);

  const filas = [...(datos?.filas ?? [])].sort((a, b) => a.periodo.localeCompare(b.periodo));
  const filaSeleccionada = filas.find((f) => f.periodo === periodoSeleccionado) ?? null;

  return (
    <div className="interna-externa">
      <p className="nota">
        Compara nuestra propia metodología de cálculo (a partir de los Emitidos/Recibidos ya cargados en Cargar Datos)
        contra la DDJJ que presentó el estudio contable. Un período solo se puede comparar si sus comprobantes se
        cargaron antes de que ese período tuviera DDJJ.
      </p>

      {error && <p className="error-banner">{error}</p>}

      {!cargando && filas.length === 0 && (
        <p className="empty-state">Todavía no hay datos (ni DDJJ ni comprobantes) para {razonSocial}.</p>
      )}

      {!cargando && filas.length > 0 && filaSeleccionada && (
        <>
          <div className="interna-externa-resumen">
            <div className="interna-externa-nav">
              <SelectorPeriodo
                periodo={filaSeleccionada.periodo}
                periodos={filas.map((f) => f.periodo)}
                onCambiarPeriodo={setPeriodoSeleccionado}
              />
              <EstadoPill estado={estadoFila(filaSeleccionada)} />
            </div>

            <GrupoComparacion
              titulo="IVA Ventas"
              subtituloInterno="de Mis Comprobantes ARCA"
              subtituloExterno="DDJJ presentada por estudio"
              interno={filaSeleccionada.interno?.iva_ventas}
              externo={filaSeleccionada.externo?.iva_ventas}
              diferencia={filaSeleccionada.diferencia_ventas}
            />
            <GrupoComparacion
              titulo="IVA Compras"
              subtituloInterno="de Mis Comprobantes ARCA"
              subtituloExterno="DDJJ presentada por estudio"
              interno={filaSeleccionada.interno?.iva_compras}
              externo={filaSeleccionada.externo?.iva_compras}
              diferencia={filaSeleccionada.diferencia_compras}
              credito931={filaSeleccionada.interno?.credito_931}
            />
            <GrupoComparacion
              titulo="Diferencia (Ventas − Compras)"
              subtituloInterno="Ventas − Compras"
              subtituloExterno="Según DDJJ"
              interno={filaSeleccionada.interno?.diferencia}
              externo={filaSeleccionada.externo?.diferencia}
              diferencia={filaSeleccionada.diferencia_total}
            />
          </div>

          <TablaInternaExterna filas={filas} razonSocial={razonSocial} periodoSeleccionado={periodoSeleccionado} onSeleccionarPeriodo={setPeriodoSeleccionado} />
        </>
      )}
    </div>
  );
}

function celda(valor, { negativoSiMenorQueCero = true } = {}) {
  if (valor == null) return <td className="col-vacio">—</td>;
  const negativo = negativoSiMenorQueCero && valor < -TOLERANCIA;
  return <td className={negativo ? 'col-negativo' : ''}>{money(valor)}</td>;
}

// Interno cubre todos los períodos, Externo (DDJJ) solo los que ya la tienen presentada. El total
// de las columnas de Diferencia suma solo lo comparable (ignora los "—"), para no mezclar meses con
// y sin DDJJ en un solo número.
function TablaInternaExterna({ filas, razonSocial, periodoSeleccionado, onSeleccionarPeriodo }) {
  const suma = (campo) => filas.reduce((acc, f) => acc + (f.interno?.[campo] ?? 0), 0);
  const sumaExterno = (campo) => filas.reduce((acc, f) => acc + (f.externo?.[campo] ?? 0), 0);
  const sumaDiferencia = (campo) => filas.reduce((acc, f) => acc + (f[campo] ?? 0), 0);

  return (
    <div className="resultado-fiscal">
      <h3>Por mes — {razonSocial}</h3>
      <p className="resultado-fiscal-hint">Hacé clic en un mes para verlo arriba.</p>
      <div className="tabla-scroll">
        <table className="tabla-interna-externa-completa">
          <thead>
            <tr>
              <th rowSpan={2} className="col-concepto">Período</th>
              <th colSpan={3}>IVA Ventas</th>
              <th colSpan={3} className="col-grupo-separador">IVA Compras</th>
            </tr>
            <tr>
              <th>Interno</th>
              <th>Externo</th>
              <th>Diferencia</th>
              <th className="col-grupo-separador">Interno</th>
              <th>Externo</th>
              <th>Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const seleccionada = f.periodo === periodoSeleccionado;
              return (
                <tr key={f.periodo} className={seleccionada ? 'fila-seleccionada' : ''} onClick={() => onSeleccionarPeriodo(f.periodo)}>
                  <td className="col-concepto">{periodoLabel(f.periodo)}</td>
                  <td>{money(f.interno?.iva_ventas ?? 0)}</td>
                  <td>{f.externo ? money(f.externo.iva_ventas) : '—'}</td>
                  {celda(f.diferencia_ventas)}
                  <td className="col-grupo-separador">{money(f.interno?.iva_compras ?? 0)}</td>
                  <td>{f.externo ? money(f.externo.iva_compras) : '—'}</td>
                  {celda(f.diferencia_compras)}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="fila-total">
              <td className="col-concepto">Total</td>
              <td>{money(suma('iva_ventas'))}</td>
              <td>{money(sumaExterno('iva_ventas'))}</td>
              {celda(sumaDiferencia('diferencia_ventas'))}
              <td className="col-grupo-separador">{money(suma('iva_compras'))}</td>
              <td>{money(sumaExterno('iva_compras'))}</td>
              {celda(sumaDiferencia('diferencia_compras'))}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="nota">
        El total de Interno suma todos los meses de la tabla; el de Externo solo los que ya tienen DDJJ presentada.
        Los totales de Diferencia excluyen los meses sin DDJJ, para no mezclar períodos de distinta cobertura.
      </p>
    </div>
  );
}
