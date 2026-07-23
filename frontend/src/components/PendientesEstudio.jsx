import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { money, fechaLabel } from '../format';
import InfoTooltip from './InfoTooltip';

const RAZONES = ['Target', 'NT'];

function normalizar(texto) {
  return (texto || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function sugerirRazonSocial(nombreHoja) {
  const n = normalizar(nombreHoja);
  if (n.includes('target') || /(^|[^a-z])t[^a-z]/.test(n)) return 'Target';
  if (n.includes('nt')) return 'NT';
  return 'Target';
}

function fechaHoraLabel(iso) {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function PendientesEstudio({ razonSocial }) {
  const [pendientes, setPendientes] = useState(null);
  const [historial, setHistorial] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [seleccionados, setSeleccionados] = useState(new Set());
  const [busqueda, setBusqueda] = useState('');
  const [orden, setOrden] = useState('fecha');
  const [envioIdAbierto, setEnvioIdAbierto] = useState(null);

  const [archivo, setArchivo] = useState(null);
  const [hojas, setHojas] = useState(null);
  const [hojasElegidas, setHojasElegidas] = useState(new Set());
  const [razonImport, setRazonImport] = useState('Target');
  const [previsualizando, setPrevisualizando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [estadoImport, setEstadoImport] = useState(null);

  const [enviando, setEnviando] = useState(false);
  const [proveedorPdf, setProveedorPdf] = useState('');
  const [generandoPdfProveedor, setGenerandoPdfProveedor] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    setSeleccionados(new Set());
    try {
      const [p, h] = await Promise.all([api.pendientesEstudio(razonSocial), api.historialPendientesEstudio(razonSocial)]);
      setPendientes(p);
      setHistorial(h);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, [razonSocial]);

  useEffect(() => { cargar(); }, [cargar]);

  async function elegirArchivo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setArchivo(file);
    setHojas(null);
    setEstadoImport(null);
    setPrevisualizando(true);
    try {
      const { hojas: h } = await api.previsualizarPendientesEstudio(file);
      setHojas(h);
      if (h.length > 0) {
        const razonSugerida = sugerirRazonSocial(h[0].nombre);
        setRazonImport(razonSugerida);
        // Pre-tilda las hojas que coinciden con la razón social sugerida por la primera hoja: el
        // estudio suele mandar varias hojas relevantes para la misma razón social (ej. una con lo
        // que falta de meses anteriores y otra con el mes en curso completo) y hay que importarlas
        // juntas para que ninguna se quede afuera.
        setHojasElegidas(new Set(h.filter((s) => sugerirRazonSocial(s.nombre) === razonSugerida).map((s) => s.nombre)));
      }
    } catch (err) {
      setEstadoImport({ tipo: 'error', mensaje: err.message });
    } finally {
      setPrevisualizando(false);
    }
  }

  function toggleHoja(nombre) {
    setHojasElegidas((prev) => {
      const next = new Set(prev);
      if (next.has(nombre)) next.delete(nombre); else next.add(nombre);
      return next;
    });
  }

  async function confirmarImportacion() {
    setImportando(true);
    setEstadoImport(null);
    try {
      const r = await api.importarPendientesEstudio(archivo, [...hojasElegidas], razonImport);
      setEstadoImport({ tipo: 'ok', mensaje: `${r.cantidad} comprobantes pendientes cargados para ${razonImport} (${hojasElegidas.size} hoja${hojasElegidas.size > 1 ? 's' : ''}). Reemplazó la lista anterior de esa razón social.` });
      setArchivo(null);
      setHojas(null);
      setHojasElegidas(new Set());
      if (razonImport === razonSocial) cargar();
    } catch (err) {
      setEstadoImport({ tipo: 'error', mensaje: err.message });
    } finally {
      setImportando(false);
    }
  }

  const filas = pendientes?.filas ?? [];
  const busquedaN = normalizar(busqueda.trim());
  const filtradas = filas.filter((f) => !busquedaN || normalizar(f.denominacion_contraparte).includes(busquedaN) || (f.cuit_contraparte || '').includes(busquedaN));
  const ordenadas = [...filtradas].sort((a, b) => {
    if (orden === 'proveedor') return normalizar(a.denominacion_contraparte).localeCompare(normalizar(b.denominacion_contraparte));
    if (orden === 'iva-desc') return b.iva - a.iva;
    if (orden === 'iva-asc') return a.iva - b.iva;
    return (a.fecha || '').localeCompare(b.fecha || '');
  });

  const proveedoresConPendientes = [...new Map(filas.map((f) => [f.cuit_contraparte, { cuit: f.cuit_contraparte, denominacion: f.denominacion_contraparte }])).values()]
    .sort((a, b) => normalizar(a.denominacion).localeCompare(normalizar(b.denominacion)));

  function toggleSeleccion(id) {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSeleccionTodas() {
    const idsVisibles = ordenadas.map((f) => f.id);
    const todasSeleccionadas = idsVisibles.length > 0 && idsVisibles.every((id) => seleccionados.has(id));
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (todasSeleccionadas) idsVisibles.forEach((id) => next.delete(id));
      else idsVisibles.forEach((id) => next.add(id));
      return next;
    });
  }

  async function generarPdfEnvio() {
    setEnviando(true);
    setError(null);
    try {
      await api.enviarPendientesEstudio(razonSocial, [...seleccionados]);
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  async function generarPdfProveedor() {
    if (!proveedorPdf) return;
    setGenerandoPdfProveedor(true);
    try {
      const p = proveedoresConPendientes.find((x) => x.cuit === proveedorPdf);
      await api.pdfProveedorPendientes(razonSocial, proveedorPdf, p?.denominacion);
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerandoPdfProveedor(false);
    }
  }

  const todasVisiblesSeleccionadas = ordenadas.length > 0 && ordenadas.every((f) => seleccionados.has(f.id));

  return (
    <div className="pendientes-estudio">
      <p className="nota">
        Comprobantes que el estudio contable todavía no tiene. Se sube el Excel acumulado que manda
        cada mes (elegís qué hoja importar); la carga nueva reemplaza por completo la lista de esa
        razón social. Tildá los que ya tenés listos para mandar y generá el PDF — se registran solos
        en el historial de abajo.
      </p>

      <div className="fuente-card">
        <div className="fuente-card-header">
          <div>
            <h3>Importar Excel del estudio</h3>
            <p>Después de elegir el archivo vas a poder elegir qué hoja importar y para qué razón social.</p>
          </div>
        </div>
        <input type="file" accept=".xlsx" onChange={elegirArchivo} disabled={previsualizando || importando} />
        {previsualizando && <p className="estado-mensaje">Leyendo el Excel…</p>}
        {hojas && (
          <div className="pendientes-import-controles">
            <p className="nota">
              Tildá todas las hojas que correspondan a la razón social elegida (ej. la de meses
              anteriores y la del mes en curso) — se importan juntas.
            </p>
            <ul className="hojas-lista">
              {hojas.map((h) => (
                <li key={h.nombre}>
                  <label>
                    <input type="checkbox" checked={hojasElegidas.has(h.nombre)} onChange={() => toggleHoja(h.nombre)} />
                    {h.nombre} ({h.filas} filas)
                  </label>
                </li>
              ))}
            </ul>
            <div className="razon-tabs">
              {RAZONES.map((r) => (
                <button key={r} type="button" className={`razon-tab ${razonImport === r ? 'active' : ''}`} onClick={() => setRazonImport(r)}>{r}</button>
              ))}
            </div>
            <button type="button" className="btn-cargar-todo" onClick={confirmarImportacion} disabled={importando || hojasElegidas.size === 0}>
              {importando ? 'Importando…' : `Importar ${hojasElegidas.size} hoja${hojasElegidas.size === 1 ? '' : 's'} como pendientes de ${razonImport}`}
            </button>
          </div>
        )}
        {estadoImport && <p className={`estado-mensaje ${estadoImport.tipo}`}>{estadoImport.mensaje}</p>}
      </div>

      {error && <p className="error-banner">{error}</p>}

      {!cargando && pendientes && (
        <>
          <div className="resumen-cards">
            <div className="card">
              <div className="card-label">
                Total IVA pendiente
                <InfoTooltip texto="Suma del IVA de todos los comprobantes que todavía no le mandamos al estudio." />
              </div>
              <div className="card-value">{money(pendientes.kpis.total_iva)}</div>
            </div>
            <div className="card">
              <div className="card-label">Comprobantes pendientes</div>
              <div className="card-value">{pendientes.kpis.cantidad_pendiente}</div>
            </div>
            <div className="card">
              <div className="card-label">Comprobantes ya enviados</div>
              <div className="card-value">{pendientes.kpis.cantidad_enviados}</div>
            </div>
          </div>

          {pendientes.kpis.top_proveedores.length > 0 && (
            <div className="tabla-comparativa">
              <div className="tabla-comparativa-header">
                <h3>
                  Proveedores con más IVA pendiente
                  <InfoTooltip texto="Suma del IVA pendiente por proveedor, de mayor a menor." />
                </h3>
              </div>
              <ul className="top-proveedores-lista">
                {pendientes.kpis.top_proveedores.map((p) => (
                  <li key={p.cuit}>
                    <span>{p.denominacion || p.cuit}</span>
                    <span className="top-proveedores-cantidad">{p.cantidad} comprobantes</span>
                    <span className="top-proveedores-iva">{money(p.iva)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="tabla-comparativa">
            <div className="tabla-comparativa-header">
              <h3>Comprobantes pendientes — {razonSocial}</h3>
              <div className="conciliacion-acciones">
                <input
                  type="text"
                  className="buscador-proveedores"
                  placeholder="Buscar por proveedor o CUIT…"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                />
                <select value={orden} onChange={(e) => setOrden(e.target.value)}>
                  <option value="fecha">Ordenar por fecha</option>
                  <option value="proveedor">Ordenar por proveedor (A-Z)</option>
                  <option value="iva-desc">IVA: mayor a menor</option>
                  <option value="iva-asc">IVA: menor a mayor</option>
                </select>
              </div>
            </div>

            <div className="pendientes-acciones">
              <button type="button" className="btn-cargar-todo" onClick={generarPdfEnvio} disabled={enviando || seleccionados.size === 0}>
                {enviando ? 'Generando…' : `Generar PDF y marcar como enviados (${seleccionados.size})`}
              </button>
              {proveedoresConPendientes.length > 0 && (
                <div className="pendientes-pdf-proveedor">
                  <select value={proveedorPdf} onChange={(e) => setProveedorPdf(e.target.value)}>
                    <option value="">PDF para un proveedor…</option>
                    {proveedoresConPendientes.map((p) => (
                      <option key={p.cuit} value={p.cuit}>{p.denominacion || p.cuit}</option>
                    ))}
                  </select>
                  <button type="button" className="btn-desglose" onClick={generarPdfProveedor} disabled={!proveedorPdf || generandoPdfProveedor}>
                    {generandoPdfProveedor ? 'Generando…' : 'Descargar'}
                  </button>
                </div>
              )}
            </div>

            <div className="tabla-scroll">
              <table className="tabla-conciliacion-comprobantes">
                <thead>
                  <tr>
                    <th><input type="checkbox" checked={todasVisiblesSeleccionadas} onChange={toggleSeleccionTodas} /></th>
                    <th>Fecha</th>
                    <th className="col-concepto">Comprobante</th>
                    <th>PDV</th>
                    <th>Número</th>
                    <th>CUIT</th>
                    <th className="col-concepto">Proveedor</th>
                    <th>Neto Gravado</th>
                    <th>IVA</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {ordenadas.map((f) => (
                    <tr key={f.id} className={seleccionados.has(f.id) ? 'fila-seleccionada' : ''}>
                      <td><input type="checkbox" checked={seleccionados.has(f.id)} onChange={() => toggleSeleccion(f.id)} /></td>
                      <td>{fechaLabel(f.fecha)}</td>
                      <td className="col-concepto" title={f.tipo_comprobante}>{f.tipo_comprobante}</td>
                      <td>{f.pdv}</td>
                      <td>{f.numero}</td>
                      <td>{f.cuit_contraparte}</td>
                      <td className="col-concepto" title={f.denominacion_contraparte || ''}>{f.denominacion_contraparte || '—'}</td>
                      <td>{money(f.neto_gravado)}</td>
                      <td>{money(f.iva)}</td>
                      <td>{money(f.total)}</td>
                    </tr>
                  ))}
                  {ordenadas.length === 0 && (
                    <tr><td colSpan={10} className="bloque-nota">
                      {filas.length === 0 ? `No hay comprobantes pendientes cargados para ${razonSocial}.` : 'Ningún comprobante coincide con la búsqueda.'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
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
                                <td className="col-concepto">{it.tipo_comprobante}</td>
                                <td>{it.pdv}</td>
                                <td>{it.numero}</td>
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
    </div>
  );
}
