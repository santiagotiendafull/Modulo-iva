import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { money, fechaLabel } from '../format';
import { cacheGet, cacheSet } from '../cache';

function EstadoPill({ estado }) {
  if (estado === 'ok') return <span className="estado-pill estado-pill-ok">En ambos</span>;
  if (estado === 'falta_interno') return <span className="estado-pill estado-pill-falta">Falta en sistema</span>;
  return <span className="estado-pill estado-pill-info">Falta en ARCA</span>;
}

export default function ConciliacionComprobantes({ razonSocial }) {
  const cacheKey = `conciliacion-comprobantes-${razonSocial}`;
  const cacheado = cacheGet(cacheKey);
  const [datos, setDatos] = useState(cacheado ?? null);
  const [cargando, setCargando] = useState(!cacheado);
  const [error, setError] = useState(null);
  const [soloFaltantes, setSoloFaltantes] = useState(true);

  const recargar = useCallback(async () => {
    const key = `conciliacion-comprobantes-${razonSocial}`;
    const habiaCache = !!cacheGet(key);
    setDatos(cacheGet(key) ?? null);
    setCargando(!habiaCache);
    if (!habiaCache) setError(null);
    try {
      const r = await api.conciliacionComprobantes(razonSocial);
      setDatos(r);
      cacheSet(key, r);
    } catch (err) {
      if (!habiaCache) setError(err.message);
    } finally {
      setCargando(false);
    }
  }, [razonSocial]);

  useEffect(() => { recargar(); }, [recargar]);

  const filas = datos?.filas ?? [];
  const filasMostradas = soloFaltantes ? filas.filter((f) => f.estado !== 'ok') : filas;

  return (
    <div className="conciliacion-comprobantes">
      <p className="nota">
        Los comprobantes de ARCA y del sistema de gestión interna se cargan en Cargar Datos, sección "Conciliación de compras".
      </p>

      {error && <p className="error-banner">{error}</p>}

      {!cargando && datos && (
        <div className="tabla-comparativa conciliacion-tabla">
          <div className="tabla-comparativa-header">
            <h3>Comprobantes — {razonSocial}</h3>
            <div className="conciliacion-acciones">
              <label className="conciliacion-check">
                <input type="checkbox" checked={soloFaltantes} onChange={(e) => setSoloFaltantes(e.target.checked)} />
                Solo mostrar faltantes
              </label>
              <a
                className="btn-desglose"
                href={api.urlFaltantesPdf(razonSocial)}
                target="_blank"
                rel="noreferrer"
              >
                Descargar PDF de faltantes
              </a>
            </div>
          </div>

          <div className="conciliacion-resumen">
            <div className="conciliacion-resumen-item"><span>{datos.resumen.total}</span>Comprobantes en total</div>
            <div className="conciliacion-resumen-item conciliacion-resumen-ok"><span>{datos.resumen.ok}</span>En ambos sistemas</div>
            <div className="conciliacion-resumen-item conciliacion-resumen-falta"><span>{datos.resumen.falta_interno}</span>Faltan en Sistema</div>
            <div className="conciliacion-resumen-item conciliacion-resumen-info"><span>{datos.resumen.falta_arca}</span>Faltan en ARCA</div>
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
                  <th>Total</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {filasMostradas.map((f, i) => (
                  <tr key={i} className={f.estado !== 'ok' ? 'fila-conciliacion-faltante' : ''}>
                    <td>{fechaLabel(f.fecha)}</td>
                    <td className="col-concepto" title={f.tipo_comprobante}>{f.tipo_comprobante}</td>
                    <td>{f.pdv}</td>
                    <td>{f.numero}</td>
                    <td>{f.cuit_contraparte}</td>
                    <td className="col-concepto" title={f.denominacion_contraparte || ''}>{f.denominacion_contraparte || '—'}</td>
                    <td>{money(f.total)}</td>
                    <td><EstadoPill estado={f.estado} /></td>
                  </tr>
                ))}
                {filasMostradas.length === 0 && (
                  <tr><td colSpan={8} className="bloque-nota">
                    {filas.length === 0 ? 'Todavía no hay comprobantes cargados para esta razón social.' : 'No hay comprobantes faltantes: la conciliación cierra perfecta.'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
