import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { money, fechaLabel, periodoLabelCompleto } from '../format';

const hoyIso = () => new Date().toISOString().slice(0, 10);

// Comprobantes de compra que no aparecen en ARCA (peajes, estaciones de servicio, etc.) — se cargan
// acá a mano y de ahí pasan solos al Control mensual del período que les toque por fecha. El campo
// "enviado" (si ya se mandó) se marca desde Control mensual, no desde acá — esta pantalla es solo
// para cargar y mantener la lista.
export default function ComprobantesManuales({ razonSocial }) {
  const [filas, setFilas] = useState([]);
  const [proveedoresFrecuentes, setProveedoresFrecuentes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [periodoFiltro, setPeriodoFiltro] = useState('');

  const [fecha, setFecha] = useState(hoyIso());
  const [proveedor, setProveedor] = useState('');
  const [tipoComprobante, setTipoComprobante] = useState('');
  const [numero, setNumero] = useState('');
  const [monto, setMonto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [estado, setEstado] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [lista, proveedores] = await Promise.all([
        api.comprobantesManuales(razonSocial),
        api.proveedoresManuales(),
      ]);
      setFilas(lista);
      setProveedoresFrecuentes(proveedores);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, [razonSocial]);

  useEffect(() => { cargar(); }, [cargar]);

  async function agregar(e) {
    e.preventDefault();
    setGuardando(true);
    setEstado(null);
    try {
      await api.agregarComprobanteManual(razonSocial, fecha, proveedor, tipoComprobante || null, numero || null, monto);
      setEstado({ tipo: 'ok', mensaje: `Comprobante de ${proveedor} cargado para ${razonSocial}.` });
      setProveedor('');
      setTipoComprobante('');
      setNumero('');
      setMonto('');
      await cargar();
    } catch (err) {
      setEstado({ tipo: 'error', mensaje: err.message });
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(id) {
    if (!window.confirm('¿Borrar este comprobante cargado a mano?')) return;
    try {
      await api.eliminarComprobanteManual(id);
      await cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  const periodosDisponibles = [...new Set(filas.map((f) => f.periodo))].sort().reverse();
  const filasFiltradas = periodoFiltro ? filas.filter((f) => f.periodo === periodoFiltro) : filas;

  return (
    <div className="comprobantes-manuales">
      <p className="nota">
        Para comprobantes de compra que no aparecen en Mis Comprobantes (peajes, estaciones de
        servicio, etc.). Una vez cargados pasan solos al Control mensual del período que les toque
        por su fecha — ahí es donde se marca cuando ya se mandaron.
      </p>

      <div className="fuente-card">
        <div className="fuente-card-header">
          <div>
            <h3>Cargar comprobante — {razonSocial}</h3>
          </div>
        </div>
        <form className="comprobante-manual-form" onSubmit={agregar}>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
          <input
            type="text"
            list="proveedores-frecuentes"
            placeholder="Proveedor"
            value={proveedor}
            onChange={(e) => setProveedor(e.target.value)}
            required
          />
          <datalist id="proveedores-frecuentes">
            {proveedoresFrecuentes.map((p) => <option key={p} value={p} />)}
          </datalist>
          <input
            type="text"
            placeholder="Tipo (ej. Peaje, Combustible)"
            value={tipoComprobante}
            onChange={(e) => setTipoComprobante(e.target.value)}
          />
          <input
            type="text"
            placeholder="Número (opcional)"
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
          />
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="Monto"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            required
          />
          <button type="submit" className="btn-desglose" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Agregar'}
          </button>
        </form>
        {estado && <p className={`estado-mensaje ${estado.tipo}`}>{estado.mensaje}</p>}
      </div>

      {error && <p className="error-banner">{error}</p>}

      <div className="tabla-comparativa">
        <div className="tabla-comparativa-header">
          <h3>Comprobantes cargados a mano — {razonSocial}</h3>
          {periodosDisponibles.length > 1 && (
            <select value={periodoFiltro} onChange={(e) => setPeriodoFiltro(e.target.value)}>
              <option value="">Todos los meses</option>
              {periodosDisponibles.map((p) => (
                <option key={p} value={p}>{periodoLabelCompleto(p)}</option>
              ))}
            </select>
          )}
        </div>
        {!cargando && (
          <div className="tabla-scroll">
            <table className="tabla-conciliacion-comprobantes">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th className="col-concepto">Proveedor</th>
                  <th>Tipo</th>
                  <th>Número</th>
                  <th>Monto</th>
                  <th>Enviado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filasFiltradas.map((f) => (
                  <tr key={f.id}>
                    <td>{fechaLabel(f.fecha)}</td>
                    <td className="col-concepto">{f.proveedor}</td>
                    <td>{f.tipo_comprobante || '—'}</td>
                    <td>{f.numero || '—'}</td>
                    <td>{money(f.monto)}</td>
                    <td>{f.enviado ? 'Sí' : 'No'}</td>
                    <td>
                      <button type="button" className="staged-item-quitar" onClick={() => borrar(f.id)} aria-label="Borrar">×</button>
                    </td>
                  </tr>
                ))}
                {filasFiltradas.length === 0 && (
                  <tr><td colSpan={7} className="bloque-nota">Todavía no hay comprobantes cargados a mano para {razonSocial}.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
