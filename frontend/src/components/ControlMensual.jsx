import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { money, fechaLabel, tipoComprobanteLabel } from '../format';
import InfoTooltip from './InfoTooltip';
import Dropzone from './Dropzone';

const periodoActual = () => new Date().toISOString().slice(0, 7);

function normalizar(texto) {
  return (texto || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

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
  const [busqueda, setBusqueda] = useState('');

  const [archivo, setArchivo] = useState(null);
  const [previsualizando, setPrevisualizando] = useState(false);
  const [previsualizacion, setPrevisualizacion] = useState(null);
  const [importando, setImportando] = useState(false);
  const [estadoImport, setEstadoImport] = useState(null);

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

  async function elegirArchivo(file) {
    setArchivo(file);
    setPrevisualizacion(null);
    setEstadoImport(null);
    setPrevisualizando(true);
    try {
      const p = await api.previsualizarMesEnCurso(file, razonSocial);
      if (!p.razonSocial) throw new Error('No se pudo determinar la razón social (CUIT) del archivo.');
      setPrevisualizacion(p);
    } catch (err) {
      setEstadoImport({ tipo: 'error', mensaje: err.message });
    } finally {
      setPrevisualizando(false);
    }
  }

  async function confirmarImportacion() {
    setImportando(true);
    setEstadoImport(null);
    try {
      const r = await api.importarMesEnCurso(archivo, razonSocial);
      setEstadoImport({ tipo: 'ok', mensaje: `${r.filas.length} comprobantes cargados para ${r.razonSocial}.` });
      setArchivo(null);
      setPrevisualizacion(null);
      if (previsualizacion?.periodos?.length === 1) setPeriodo(previsualizacion.periodos[0]);
      else cargar();
    } catch (err) {
      setEstadoImport({ tipo: 'error', mensaje: err.message });
    } finally {
      setImportando(false);
    }
  }

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
  const busquedaN = normalizar(busqueda.trim());
  const filasFiltradas = filas.filter((f) =>
    !busquedaN
    || normalizar(f.denominacion_contraparte).includes(busquedaN)
    || (f.numero || '').toLowerCase().includes(busquedaN)
  );

  return (
    <div className="control-mensual">
      <p className="nota">
        Todo lo que debería mandarse este mes: comprobantes de Mis Comprobantes Recibidos más los
        cargados a mano, juntos. Tildá cada uno a medida que lo tenés listo o ya lo mandaste — queda
        marcado con color. Siempre se puede volver a destildar, no hay "cerrar el mes".
      </p>

      <div className="fuente-card">
        <div className="fuente-card-header">
          <div>
            <h3>Importar Mis Comprobantes Recibidos</h3>
            <p>Para no tener que ir a Cargar Datos — importa directo acá y se suma al checklist del mes.</p>
          </div>
        </div>
        <Dropzone
          accept=".xlsx"
          label={previsualizando ? 'Leyendo el Excel…' : 'Arrastrá o elegí el Excel de Recibidos'}
          hint='El nombre debe incluir "Recibidos"'
          disabled={previsualizando || importando}
          onFile={elegirArchivo}
        />
        {previsualizacion && (
          <div className="pendientes-import-controles">
            <p className="nota">
              {previsualizacion.comprobantes} comprobantes para {previsualizacion.razonSocial}
              {' '}— período{previsualizacion.periodos.length > 1 ? 's' : ''}: {previsualizacion.periodos.join(', ')}.
              {previsualizacion.razonSocial !== razonSocial && ` Ojo: estás en la pestaña de ${razonSocial}.`}
            </p>
            <button type="button" className="btn-cargar-todo" onClick={confirmarImportacion} disabled={importando}>
              {importando ? 'Importando…' : 'Confirmar importación'}
            </button>
          </div>
        )}
        {estadoImport && <p className={`estado-mensaje ${estadoImport.tipo}`}>{estadoImport.mensaje}</p>}
      </div>

      <div className="control-mensual-header">
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
                    <td>{f.origen === 'manual' ? 'Manual' : 'ARCA'}</td>
                    <td>{f.pdv || '—'}</td>
                    <td>{f.numero || '—'}</td>
                    <td className="col-concepto" title={f.denominacion_contraparte || ''}>{f.denominacion_contraparte || '—'}</td>
                    <td>{money(f.iva)}</td>
                    <td>{money(f.total)}</td>
                  </tr>
                ))}
                {filasFiltradas.length === 0 && (
                  <tr><td colSpan={8} className="bloque-nota">
                    {filas.length === 0 ? `No hay comprobantes de compra cargados para ${razonSocial} en este período.` : 'Ningún comprobante coincide con la búsqueda.'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
