import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { money, fechaLabel, tipoComprobanteLabel } from '../format';
import InfoTooltip from './InfoTooltip';
import ComprobantesManuales from './ComprobantesManuales';

const periodoActual = () => new Date().toISOString().slice(0, 7);

function normalizar(texto) {
  return (texto || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Checklist propio del mes: a diferencia de "Lo que pide el estudio" (que viene de su Excel), acá el
// universo sale de Mis Comprobantes (cargado una sola vez en Cargar Datos — no hay import propio
// acá) + Comprobantes manuales de ese período. Tildar un comprobante significa "lo tengo listo / ya
// lo mandé este mes" — queda marcado con color. El tilde se guarda por CUIT+PDV+Número, no por el id
// interno del comprobante, así que sigue ahí aunque Cargar Datos reemplace el archivo de ARCA al día
// siguiente con comprobantes nuevos (ver controlEnvioMensualService.obtenerControlMensual).
export default function ControlMensual({ razonSocial }) {
  const [periodo, setPeriodo] = useState(periodoActual());
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [generandoPdf, setGenerandoPdf] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [modalManualAbierto, setModalManualAbierto] = useState(false);

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

  function cerrarModalManual() {
    setModalManualAbierto(false);
    cargar(); // por si se cargó o borró algo mientras estaba abierto el popup
  }

  const filas = datos?.filas ?? [];
  const busquedaN = normalizar(busqueda.trim());
  const filasFiltradas = filas.filter((f) =>
    (!busquedaN
      || normalizar(f.denominacion_contraparte).includes(busquedaN)
      || (f.numero || '').toLowerCase().includes(busquedaN))
    && (filtroEstado === 'todos' || (filtroEstado === 'marcados' ? f.enviado : !f.enviado))
  );

  return (
    <div className="control-mensual">
      <p className="nota">
        Todo lo que debería mandarse este mes: comprobantes de Mis Comprobantes (cargados en Cargar
        Datos) más los cargados a mano, juntos. Tildá cada uno a medida que lo tenés listo o ya lo
        mandaste — queda marcado con color y se guarda aunque después cargues un Excel de ARCA
        actualizado. Siempre se puede volver a destildar, no hay "cerrar el mes".
      </p>

      <div className="control-mensual-toolbar">
        <input
          type="month"
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value)}
          aria-label="Período"
        />
        <input
          type="text"
          className="buscador-proveedores"
          placeholder="Buscar por proveedor o número de operación…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} aria-label="Filtrar por estado">
          <option value="todos">Todos</option>
          <option value="marcados">Marcados</option>
          <option value="no-marcados">No marcados</option>
        </select>
        <div className="control-mensual-toolbar-acciones">
          <button type="button" className="btn-desglose" onClick={() => setModalManualAbierto(true)}>
            Comprobantes manuales
          </button>
          <button type="button" className="btn-desglose" onClick={descargarPdf} disabled={generandoPdf || filas.length === 0}>
            {generandoPdf ? 'Generando…' : 'Descargar PDF de los marcados'}
          </button>
        </div>
      </div>

      {error && <p className="error-banner">{error}</p>}

      {!cargando && datos && (
        <>
          <div className="resumen-cards resumen-cards-compacto">
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
                  <th>IVA</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {filasFiltradas.map((f) => (
                  <tr
                    key={`${f.origen}-${f.id}`}
                    className={`fila-clickeable ${f.enviado ? 'fila-seleccionada' : ''}`}
                    onClick={() => toggleEnviado(f)}
                  >
                    <td>{fechaLabel(f.fecha)}</td>
                    <td className="col-concepto" title={f.tipo_comprobante || ''}>{tipoComprobanteLabel(f.tipo_comprobante) || '—'}</td>
                    <td>{f.origen === 'manual' ? <span className="origen-pill origen-manual">Manual</span> : 'ARCA'}</td>
                    <td>{f.pdv || '—'}</td>
                    <td>{f.numero || '—'}</td>
                    <td className="col-concepto" title={f.denominacion_contraparte || ''}>{f.denominacion_contraparte || '—'}</td>
                    <td>{money(f.iva)}</td>
                    <td>{money(f.total)}</td>
                  </tr>
                ))}
                {filasFiltradas.length === 0 && (
                  <tr><td colSpan={8} className="bloque-nota">
                    {filas.length === 0 ? `No hay comprobantes de compra cargados para ${razonSocial} en este período.` : 'Ningún comprobante coincide con el filtro.'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {modalManualAbierto && (
        <div className="modal-overlay" onClick={cerrarModalManual}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="modal-cerrar" onClick={cerrarModalManual} aria-label="Cerrar">×</button>
            <ComprobantesManuales razonSocial={razonSocial} />
          </div>
        </div>
      )}
    </div>
  );
}
