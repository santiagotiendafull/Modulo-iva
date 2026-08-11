import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { money, fechaLabel } from '../format';
import InfoTooltip from './InfoTooltip';

const periodoActual = () => new Date().toISOString().slice(0, 7);

// Checklist propio del mes: a diferencia de "Lo que pide el estudio" (que viene de su Excel), acá el
// universo sale de Mis Comprobantes + Comprobantes manuales de ese período. Tildar un comprobante
// significa "lo tengo listo / ya lo mandé este mes" — queda marcado con color y así se sabe de un
// vistazo qué falta todavía para terminar de mandar todo lo del mes.
export default function ControlMensual({ razonSocial }) {
  const [periodo, setPeriodo] = useState(periodoActual());
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [generandoPdf, setGenerandoPdf] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setDatos(await api.controlMensual(razonSocial, periodo));
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, [razonSocial, periodo]);

  useEffect(() => { cargar(); }, [cargar]);

  async function toggleEnviado(f) {
    const nuevoValor = !f.enviado;
    setDatos((prev) => ({
      ...prev,
      filas: prev.filas.map((x) => (x === f ? { ...x, enviado: nuevoValor } : x)),
      kpis: {
        ...prev.kpis,
        cantidad_enviados: prev.kpis.cantidad_enviados + (nuevoValor ? 1 : -1),
        monto_enviado: prev.kpis.monto_enviado + (nuevoValor ? f.total : -f.total),
      },
    }));
    try {
      if (f.origen === 'manual') {
        await api.marcarEnviadoManual(f.id, nuevoValor);
      } else {
        await api.marcarEnviadoControlMensual(razonSocial, f.cuit_contraparte, f.pdv, f.numero, nuevoValor);
      }
    } catch (err) {
      setError(err.message);
      cargar();
    }
  }

  async function descargarPdf() {
    setGenerandoPdf(true);
    try {
      await api.pdfControlMensual(razonSocial, periodo);
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerandoPdf(false);
    }
  }

  const filas = datos?.filas ?? [];

  return (
    <div className="control-mensual">
      <p className="nota">
        Todo lo que debería mandarse este mes: comprobantes de Mis Comprobantes Recibidos más los
        cargados a mano, juntos. Tildá cada uno a medida que lo tenés listo o ya lo mandaste — queda
        marcado con color. Siempre se puede volver a destildar, no hay "cerrar el mes".
      </p>

      <div className="control-mensual-header">
        <input
          type="month"
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value)}
          aria-label="Período"
        />
        <button type="button" className="btn-desglose" onClick={descargarPdf} disabled={generandoPdf || filas.length === 0}>
          {generandoPdf ? 'Generando…' : 'Descargar PDF de los marcados'}
        </button>
      </div>

      {error && <p className="error-banner">{error}</p>}

      {!cargando && datos && (
        <>
          <div className="resumen-cards">
            <div className="card">
              <div className="card-label">Comprobantes del mes</div>
              <div className="card-value">{datos.kpis.cantidad_total}</div>
            </div>
            <div className="card">
              <div className="card-label">
                Marcados para mandar
                <InfoTooltip texto="Comprobantes que ya tildaste como listos o ya enviados este mes." />
              </div>
              <div className="card-value">{datos.kpis.cantidad_enviados}</div>
            </div>
            <div className="card">
              <div className="card-label">Monto total del mes</div>
              <div className="card-value">{money(datos.kpis.monto_total)}</div>
            </div>
            <div className="card">
              <div className="card-label">Monto marcado</div>
              <div className="card-value">{money(datos.kpis.monto_enviado)}</div>
            </div>
          </div>

          <div className="tabla-scroll">
            <table className="tabla-conciliacion-comprobantes">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th className="col-concepto">Comprobante</th>
                  <th>Origen</th>
                  <th>PDV</th>
                  <th>Número</th>
                  <th className="col-concepto">Proveedor</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr
                    key={`${f.origen}-${f.id}`}
                    className={`fila-clickeable ${f.enviado ? 'fila-seleccionada' : ''}`}
                    onClick={() => toggleEnviado(f)}
                  >
                    <td>{fechaLabel(f.fecha)}</td>
                    <td className="col-concepto" title={f.tipo_comprobante || ''}>{f.tipo_comprobante || '—'}</td>
                    <td>{f.origen === 'manual' ? 'Manual' : 'ARCA'}</td>
                    <td>{f.pdv || '—'}</td>
                    <td>{f.numero || '—'}</td>
                    <td className="col-concepto" title={f.denominacion_contraparte || ''}>{f.denominacion_contraparte || '—'}</td>
                    <td>{money(f.total)}</td>
                  </tr>
                ))}
                {filas.length === 0 && (
                  <tr><td colSpan={7} className="bloque-nota">No hay comprobantes de compra cargados para {razonSocial} en este período.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
