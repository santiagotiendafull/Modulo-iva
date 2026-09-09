import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { money, fechaLabel, tipoComprobanteLabel } from '../format';
import InfoTooltip from './InfoTooltip';
import ComprobantesManuales from './ComprobantesManuales';

const periodoActual = () => new Date().toISOString().slice(0, 7);

function normalizar(texto) {
  return (texto || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function fechaHoraLabel(iso) {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
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
  const [historial, setHistorial] = useState(null);
  const [envioIdAbierto, setEnvioIdAbierto] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [generandoPdf, setGenerandoPdf] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [ordenFecha, setOrdenFecha] = useState('asc'); // 'asc' | 'desc' — clickeando el título de la columna
  const [modalManualAbierto, setModalManualAbierto] = useState(false);
  // Arranca bloqueado a propósito: un click accidental en la fila (al scrollear, seleccionar texto,
  // etc.) tilda o destilda sin querer. Hay que desbloquear a propósito antes de poder tocar algo —
  // y vuelve a bloquearse solo al cambiar de período o de razón social, o al recargar la pantalla.
  const [bloqueado, setBloqueado] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [d, h] = await Promise.all([
        api.controlMensual(razonSocial, periodo),
        api.historialControlMensual(razonSocial, periodo),
      ]);
      setDatos(d);
      setHistorial(h);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, [razonSocial, periodo]);

  useEffect(() => { cargar(); }, [cargar]);
  // Al cambiar de período o de razón social vuelve a quedar bloqueado — evita quedarse
  // desbloqueado sin darse cuenta y tildar algo de otro mes por error.
  useEffect(() => { setBloqueado(true); }, [razonSocial, periodo]);

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
      setHistorial(await api.historialControlMensual(razonSocial, periodo));
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
  const filasFiltradas = filas.filter((f) => {
    if (busquedaN
      && !normalizar(f.denominacion_contraparte).includes(busquedaN)
      && !(f.numero || '').toLowerCase().includes(busquedaN)) return false;
    if (filtroEstado === 'marcados') return f.enviado;
    if (filtroEstado === 'no-marcados') return !f.enviado;
    if (filtroEstado === 'ya-enviados') return f.ya_enviado;
    if (filtroEstado === 'factura-a') return (tipoComprobanteLabel(f.tipo_comprobante) || '').includes('Factura A');
    if (filtroEstado === 'factura-b') return (tipoComprobanteLabel(f.tipo_comprobante) || '').includes('Factura B');
    if (filtroEstado === 'manuales') return f.origen === 'manual';
    return true; // 'todos'
  });

  const filasOrdenadas = [...filasFiltradas].sort((a, b) => {
    const cmp = (a.fecha || '').localeCompare(b.fecha || '');
    return ordenFecha === 'asc' ? cmp : -cmp;
  });

  const totalIvaMes = filas.reduce((acc, f) => acc + (f.iva || 0), 0);
  const totalIvaMarcado = filas.filter((f) => f.enviado).reduce((acc, f) => acc + (f.iva || 0), 0);

  return (
    <div className="control-mensual">
      <p className="nota">
        Todo lo que debería mandarse este mes: comprobantes de Mis Comprobantes (cargados en Cargar
        Datos) más los cargados a mano, juntos. Tildá cada uno a medida que lo tenés listo para
        mandar — queda marcado en violeta y se guarda aunque después cargues un Excel de ARCA
        actualizado. Al descargar el PDF, esos comprobantes pasan a verde ("ya enviados") y no se
        vuelven a incluir si generás otro PDF más adelante en el mismo mes — solo se manda lo nuevo
        que vayas tildando. Siempre se puede volver a destildar, no hay "cerrar el mes".
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
          <option value="ya-enviados">Ya enviados</option>
          <option value="factura-a">Factura A</option>
          <option value="factura-b">Factura B</option>
          <option value="manuales">Manuales</option>
        </select>
        <div className="control-mensual-toolbar-acciones">
          <button
            type="button"
            className={`btn-candado ${bloqueado ? '' : 'desbloqueado'}`}
            onClick={() => setBloqueado((v) => !v)}
            title={bloqueado ? 'Desbloqueá para poder tildar comprobantes' : 'Bloqueá para evitar tildar sin querer'}
          >
            {bloqueado ? '🔒 Tildado bloqueado' : '🔓 Tildado desbloqueado'}
          </button>
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
              <div className="card-hint">{money(totalIvaMes)} de IVA</div>
            </div>
            <div className="card">
              <div className="card-label">Monto marcado</div>
              <div className="card-value">{money(datos.kpis.monto_enviado)}</div>
              <div className="card-hint">{money(totalIvaMarcado)} de IVA</div>
            </div>
          </div>

          <div className="tabla-scroll">
            <table className="tabla-conciliacion-comprobantes">
              <thead>
                <tr>
                  <th
                    className="th-ordenable"
                    onClick={() => setOrdenFecha((o) => (o === 'asc' ? 'desc' : 'asc'))}
                    title={ordenFecha === 'asc' ? 'Ordenado de más antigua a más reciente — click para invertir' : 'Ordenado de más reciente a más antigua — click para invertir'}
                  >
                    Fecha {ordenFecha === 'asc' ? '▲' : '▼'}
                  </th>
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
                {filasOrdenadas.map((f) => (
                  <tr
                    key={`${f.origen}-${f.id}`}
                    className={`fila-clickeable ${bloqueado ? 'fila-bloqueada' : ''} ${f.ya_enviado ? 'fila-ya-enviada' : (f.enviado ? 'fila-seleccionada' : '')}`}
                    onClick={() => { if (!bloqueado) toggleEnviado(f); }}
                    title={f.ya_enviado ? 'Ya se mandó en un PDF anterior de este mes' : ''}
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

          <div className="tabla-comparativa">
            <div className="tabla-comparativa-header">
              <h3>Ya enviados</h3>
            </div>
            {(!historial || historial.length === 0) && <p className="bloque-nota">Todavía no se generó ningún envío.</p>}
            {historial && historial.length > 0 && (
              <div className="envios-lista">
                {historial.map((envio) => (
                  <div key={envio.id} className="envio-item">
                    <button type="button" className="envio-item-header" onClick={() => setEnvioIdAbierto((v) => (v === envio.id ? null : envio.id))}>
                      <span>{fechaHoraLabel(envio.fecha_hora)} — {envio.cantidad} comprobantes{envio.usuario ? ` — ${envio.usuario}` : ''}</span>
                      <span>{envioIdAbierto === envio.id ? '▲' : '▼'}</span>
                    </button>
                    {envioIdAbierto === envio.id && (
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
                            {envio.items.map((it) => (
                              <tr key={it.id}>
                                <td>{fechaLabel(it.fecha)}</td>
                                <td className="col-concepto" title={it.tipo_comprobante}>{tipoComprobanteLabel(it.tipo_comprobante)}</td>
                                <td>{it.origen === 'manual' ? <span className="origen-pill origen-manual">Manual</span> : 'ARCA'}</td>
                                <td>{it.pdv || '—'}</td>
                                <td>{it.numero || '—'}</td>
                                <td className="col-concepto">{it.denominacion_contraparte || '—'}</td>
                                <td>{money(it.iva)}</td>
                                <td>{money(it.total)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
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
