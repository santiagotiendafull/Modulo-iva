import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { money, fechaLabel, periodoLabel } from '../format';

const RAZONES = ['Target', 'NT'];

function FilaProveedor({ proveedor, onCambiarEstado, guardando }) {
  const esNuevo = proveedor.estado === null;
  return (
    <tr className={esNuevo ? 'fila-proveedor-nueva' : ''}>
      <td className="col-concepto col-proveedor">{proveedor.denominacion || '—'}</td>
      <td className="col-cuit">{proveedor.cuit}</td>
      <td className="col-estado">
        <div className="toggle-corresponde">
          <button
            type="button"
            className={`toggle-opcion toggle-corresponde-si ${proveedor.estado === 'corresponde' ? 'activa' : ''}`}
            onClick={() => onCambiarEstado(proveedor.cuit, 'corresponde')}
            disabled={guardando}
          >
            Corresponde
          </button>
          <button
            type="button"
            className={`toggle-opcion toggle-corresponde-no ${proveedor.estado === 'no_corresponde' ? 'activa' : ''}`}
            onClick={() => onCambiarEstado(proveedor.cuit, 'no_corresponde')}
            disabled={guardando}
          >
            No corresponde
          </button>
        </div>
      </td>
    </tr>
  );
}

function normalizar(texto) {
  return (texto || '')
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export default function Proveedores({ onCambio }) {
  const [razonSocial, setRazonSocial] = useState('Target');
  const [proveedores, setProveedores] = useState([]);
  const [hayNuevos, setHayNuevos] = useState(false);
  const [excluidas, setExcluidas] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [guardandoCuit, setGuardandoCuit] = useState(null);
  const [busqueda, setBusqueda] = useState('');

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const [prov, exc] = await Promise.all([api.proveedores(), api.proveedoresExcluidas()]);
      setProveedores(prov.proveedores);
      setHayNuevos(prov.hayNuevos);
      setExcluidas(exc);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function cambiarEstado(cuit, estado) {
    setGuardandoCuit(cuit);
    try {
      await api.establecerEstadoProveedor(cuit, estado);
      await cargar();
      onCambio?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardandoCuit(null);
    }
  }

  if (cargando) return <p className="empty-state">Cargando proveedores…</p>;

  const busquedaNormalizada = normalizar(busqueda.trim());
  const proveedoresFiltrados = proveedores
    .filter((p) => p.razonesSociales.includes(razonSocial))
    .filter((p) => !busquedaNormalizada || normalizar(p.denominacion).includes(busquedaNormalizada) || p.cuit.includes(busquedaNormalizada));
  const excluidasFiltradas = excluidas?.filas.filter((f) => f.razon_social === razonSocial) ?? [];
  const totalesFiltrados = excluidasFiltradas.reduce(
    (acc, f) => ({ neto_gravado: acc.neto_gravado + f.neto_gravado, iva: acc.iva + f.iva }),
    { neto_gravado: 0, iva: 0 }
  );

  return (
    <div className="proveedores">
      <div className="proveedores-intro">
        <h2>Proveedores</h2>
        <p>
          Clasificación de proveedores de compras. Un proveedor "No corresponde" no toma crédito fiscal:
          se resta de IVA Compras todo lo que se le compró, en todas las razones sociales y períodos.
        </p>
      </div>

      {hayNuevos && <div className="aviso-nuevos-proveedores">Existen nuevos proveedores sin clasificar</div>}
      {error && <p className="error-banner">{error}</p>}

      <div className="proveedores-controles">
        <div className="razon-tabs">
          {RAZONES.map((r) => (
            <button
              key={r}
              className={`razon-tab ${razonSocial === r ? 'active' : ''}`}
              onClick={() => setRazonSocial(r)}
            >
              {r}
            </button>
          ))}
        </div>
        <input
          type="text"
          className="buscador-proveedores"
          placeholder="Buscar por nombre o CUIT…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      <div className="tabla-comparativa">
        <div className="tabla-scroll">
          <table className="tabla-proveedores">
            <thead>
              <tr>
                <th className="col-concepto col-proveedor">Razón social</th>
                <th className="col-cuit">CUIT</th>
                <th className="col-estado">Estado</th>
              </tr>
            </thead>
            <tbody>
              {proveedoresFiltrados.map((p) => (
                <FilaProveedor
                  key={p.cuit}
                  proveedor={p}
                  onCambiarEstado={cambiarEstado}
                  guardando={guardandoCuit === p.cuit}
                />
              ))}
              {proveedoresFiltrados.length === 0 && (
                <tr><td colSpan={3} className="bloque-nota">
                  {busquedaNormalizada ? 'Ningún proveedor coincide con la búsqueda.' : `Todavía no hay compras cargadas para ${razonSocial}.`}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="resultado-fiscal">
        <h3>Compras que no se toman por proveedor "No corresponde" — {razonSocial}</h3>
        {excluidasFiltradas.length === 0 && (
          <p className="bloque-nota">No hay compras excluidas por esta razón.</p>
        )}
        {excluidasFiltradas.length > 0 && (
          <>
            <div className="tabla-scroll">
              <table>
                <thead>
                  <tr>
                    <th className="col-concepto">Proveedor</th>
                    <th>Período</th>
                    <th>Fecha</th>
                    <th>Comprobante</th>
                    <th>Neto gravado</th>
                    <th>IVA</th>
                  </tr>
                </thead>
                <tbody>
                  {excluidasFiltradas.map((f, i) => (
                    <tr key={i}>
                      <td className="col-concepto">{f.denominacion}</td>
                      <td>{periodoLabel(f.periodo)}</td>
                      <td>{fechaLabel(f.fecha)}</td>
                      <td>{f.tipo_comprobante}</td>
                      <td>{money(f.neto_gravado)}</td>
                      <td>{money(f.iva)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="monto-a-pagar debe">
              <div className="monto-a-pagar-label">IVA que no se toma por proveedores no correspondientes ({razonSocial})</div>
              <div className="monto-a-pagar-valor">{money(totalesFiltrados.iva)}</div>
              <p className="monto-a-pagar-nota">Neto gravado excluido: {money(totalesFiltrados.neto_gravado)}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
