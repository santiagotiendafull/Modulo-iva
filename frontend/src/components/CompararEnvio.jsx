import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { money, fechaLabel, tipoComprobanteLabel } from '../format';
import InfoTooltip from './InfoTooltip';

const periodoActual = () => new Date().toISOString().slice(0, 7);

function FilaComprobante({ f }) {
  return (
    <tr>
      <td>{fechaLabel(f.fecha)}</td>
      <td className="col-concepto" title={f.tipo_comprobante || ''}>{tipoComprobanteLabel(f.tipo_comprobante) || '—'}</td>
      <td>{f.pdv || '—'}</td>
      <td>{f.numero || '—'}</td>
      <td>{f.cuit_contraparte || '—'}</td>
      <td className="col-concepto" title={f.denominacion_contraparte || ''}>{f.denominacion_contraparte || '—'}</td>
      <td>{money(f.iva)}</td>
      <td>{money(f.total)}</td>
    </tr>
  );
}

// Cruza, para un mismo período, lo que el estudio dice que le falta (pendientes_estudio) contra tu
// propio Control mensual. Si algo que el estudio marca como faltante ya está tildado como enviado en
// tu control, es una discrepancia — señal para reclamarle que lo revise. El resto es lo que
// realmente falta todavía, según las dos fuentes.
export default function CompararEnvio({ razonSocial }) {
  const [periodo, setPeriodo] = useState(periodoActual());
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setDatos(await api.compararEnvio(razonSocial, periodo));
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, [razonSocial, periodo]);

  useEffect(() => { cargar(); }, [cargar]);

  return (
    <div className="comparar-envio">
      <p className="nota">
        Compara, para el mes elegido, la lista del estudio ("Lo que pide el estudio") contra tu
        Control mensual. Si algo aparece acá abajo como discrepancia es porque el estudio lo tiene
        como faltante pero vos ya lo tildaste como enviado — convendría avisarle que lo revise.
      </p>

      <div className="control-mensual-header">
        <input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} aria-label="Período" />
      </div>

      {error && <p className="error-banner">{error}</p>}

      {!cargando && datos && (
        <>
          {datos.resumen.cantidad_discrepancias > 0 && (
            <div className="aviso-nuevos-proveedores">
              {datos.resumen.cantidad_discrepancias} comprobante{datos.resumen.cantidad_discrepancias > 1 ? 's que el estudio marca' : ' que el estudio marca'} como faltante{datos.resumen.cantidad_discrepancias > 1 ? 's' : ''} ya {datos.resumen.cantidad_discrepancias > 1 ? 'están tildados' : 'está tildado'} como enviado en tu Control mensual — revisá con el estudio.
            </div>
          )}

          <div className="tabla-comparativa">
            <div className="tabla-comparativa-header">
              <h3>
                Discrepancias
                <InfoTooltip texto="El estudio dice que le falta, pero tu Control mensual de este período ya lo tiene marcado como enviado." />
              </h3>
            </div>
            <div className="tabla-scroll">
              <table className="tabla-conciliacion-comprobantes">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th className="col-concepto">Comprobante</th>
                    <th>PDV</th>
                    <th>Número</th>
                    <th>CUIT</th>
                    <th className="col-concepto">Proveedor</th>
                    <th>IVA</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.discrepancias.map((f) => <FilaComprobante key={f.id} f={f} />)}
                  {datos.discrepancias.length === 0 && (
                    <tr><td colSpan={8} className="bloque-nota">Sin discrepancias para este período.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="tabla-comparativa">
            <div className="tabla-comparativa-header">
              <h3>
                Falta de verdad
                <InfoTooltip texto="Coincide en las dos listas (o todavía no está en tu Control mensual): sigue pendiente de conseguir y mandar." />
              </h3>
            </div>
            <div className="tabla-scroll">
              <table className="tabla-conciliacion-comprobantes">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th className="col-concepto">Comprobante</th>
                    <th>PDV</th>
                    <th>Número</th>
                    <th>CUIT</th>
                    <th className="col-concepto">Proveedor</th>
                    <th>IVA</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.pendientes.map((f) => <FilaComprobante key={f.id} f={f} />)}
                  {datos.pendientes.length === 0 && (
                    <tr><td colSpan={8} className="bloque-nota">No hay comprobantes pendientes de este período según el estudio.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
