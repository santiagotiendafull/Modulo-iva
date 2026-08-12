import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { money, fechaLabel, periodoLabelCompleto, tipoComprobanteLabel } from '../format';

const hoyIso = () => new Date().toISOString().slice(0, 10);
const CAMPOS_VACIOS = { fecha: hoyIso(), tipo: '', pdv: '', numero: '', proveedorHabitual: '', cuit: '', denominacion: '', iva: '', monto: '' };

// Comprobantes de compra que no aparecen en ARCA (peajes, estaciones de servicio, etc.) — se cargan
// acá a mano, en el mismo orden en que vienen en Mis Comprobantes Recibidos (Fecha, Tipo, PDV, Nro.
// Operación, Nro. Doc. Emisor, Denominación Emisor, Total IVA, Importe Total), y de ahí pasan solos
// al Control mensual del período que les toque por fecha. Enter avanza al campo siguiente en ese
// mismo orden, así se puede cargar una pila de comprobantes físicos sin tocar el mouse. El campo
// "enviado" (si ya se mandó) se marca desde Control mensual, no desde acá.
export default function ComprobantesManuales({ razonSocial }) {
  const [filas, setFilas] = useState([]);
  const [proveedoresHabituales, setProveedoresHabituales] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [periodoFiltro, setPeriodoFiltro] = useState('');

  const [campos, setCampos] = useState(CAMPOS_VACIOS);
  const [guardando, setGuardando] = useState(false);
  const [estado, setEstado] = useState(null);

  const refFecha = useRef(null);
  const refTipo = useRef(null);
  const refPdv = useRef(null);
  const refNumero = useRef(null);
  const refProveedorHabitual = useRef(null);
  const refCuit = useRef(null);
  const refDenominacion = useRef(null);
  const refIva = useRef(null);
  const refMonto = useRef(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [lista, proveedores] = await Promise.all([
        api.comprobantesManuales(razonSocial),
        api.proveedoresManuales(),
      ]);
      setFilas(lista);
      setProveedoresHabituales(proveedores);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, [razonSocial]);

  useEffect(() => { cargar(); }, [cargar]);

  function setCampo(campo, valor) {
    setCampos((prev) => ({ ...prev, [campo]: valor }));
  }

  // Enter en cualquier campo (salvo el último) avanza al siguiente, en vez de mandar el form —
  // el form se manda recién con Enter en Importe Total (comportamiento nativo del <form>).
  function avanzarCon(siguienteRef) {
    return (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      siguienteRef.current?.focus();
      siguienteRef.current?.select?.();
    };
  }

  function elegirProveedorHabitual(cuit) {
    setCampo('proveedorHabitual', cuit);
    const p = proveedoresHabituales.find((x) => x.cuit === cuit);
    if (p) {
      setCampos((prev) => ({ ...prev, cuit: p.cuit, denominacion: p.denominacion }));
      refIva.current?.focus(); // ya está el proveedor completo, se salta directo a los montos
      refIva.current?.select?.();
    } else {
      refCuit.current?.focus();
    }
  }

  async function agregar(e) {
    e.preventDefault();
    setGuardando(true);
    setEstado(null);
    try {
      await api.agregarComprobanteManual({
        razonSocial,
        fecha: campos.fecha,
        proveedor: campos.denominacion,
        cuit: campos.cuit,
        tipoComprobante: campos.tipo || null,
        numero: campos.numero || null,
        iva: campos.iva,
        monto: campos.monto,
      });
      setEstado({ tipo: 'ok', mensaje: `Comprobante de ${campos.denominacion} cargado para ${razonSocial}.` });
      setCampos({ ...CAMPOS_VACIOS, fecha: campos.fecha }); // la fecha se mantiene: se suele cargar varios del mismo día seguidos
      await cargar();
      refFecha.current?.focus();
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
        por su fecha — ahí es donde se marca cuando ya se mandaron. Cargá los datos en orden y apretá
        Enter para pasar al siguiente campo.
      </p>

      <div className="fuente-card">
        <div className="fuente-card-header">
          <div>
            <h3>Cargar comprobante — {razonSocial}</h3>
          </div>
        </div>
        <form className="comprobante-manual-form" onSubmit={agregar}>
          <label className="campo-manual">
            <span>Fecha</span>
            <input
              ref={refFecha}
              type="date"
              value={campos.fecha}
              onChange={(e) => setCampo('fecha', e.target.value)}
              onKeyDown={avanzarCon(refTipo)}
              required
            />
          </label>
          <label className="campo-manual">
            <span>Tipo</span>
            <input
              ref={refTipo}
              type="text"
              placeholder="Ticket Factura A"
              value={campos.tipo}
              onChange={(e) => setCampo('tipo', e.target.value)}
              onKeyDown={avanzarCon(refPdv)}
            />
          </label>
          <label className="campo-manual campo-manual-chico">
            <span>PDV</span>
            <input
              ref={refPdv}
              type="text"
              value={campos.pdv}
              onChange={(e) => setCampo('pdv', e.target.value)}
              onKeyDown={avanzarCon(refNumero)}
            />
          </label>
          <label className="campo-manual">
            <span>Nro. Operación</span>
            <input
              ref={refNumero}
              type="text"
              value={campos.numero}
              onChange={(e) => setCampo('numero', e.target.value)}
              onKeyDown={avanzarCon(refProveedorHabitual)}
            />
          </label>
          <label className="campo-manual">
            <span>Proveedor habitual</span>
            <select
              ref={refProveedorHabitual}
              value={campos.proveedorHabitual}
              onChange={(e) => elegirProveedorHabitual(e.target.value)}
            >
              <option value="">Elegir o cargar nuevo abajo…</option>
              {proveedoresHabituales.map((p) => (
                <option key={p.cuit} value={p.cuit}>{p.denominacion}</option>
              ))}
            </select>
          </label>
          <label className="campo-manual">
            <span>Nro. Doc. Emisor (CUIT)</span>
            <input
              ref={refCuit}
              type="text"
              value={campos.cuit}
              onChange={(e) => setCampo('cuit', e.target.value)}
              onKeyDown={avanzarCon(refDenominacion)}
            />
          </label>
          <label className="campo-manual">
            <span>Denominación Emisor</span>
            <input
              ref={refDenominacion}
              type="text"
              value={campos.denominacion}
              onChange={(e) => setCampo('denominacion', e.target.value)}
              onKeyDown={avanzarCon(refIva)}
              required
            />
          </label>
          <label className="campo-manual campo-manual-chico">
            <span>Total IVA</span>
            <input
              ref={refIva}
              type="number"
              step="0.01"
              min="0"
              value={campos.iva}
              onChange={(e) => setCampo('iva', e.target.value)}
              onKeyDown={avanzarCon(refMonto)}
            />
          </label>
          <label className="campo-manual campo-manual-chico">
            <span>Importe Total</span>
            <input
              ref={refMonto}
              type="number"
              step="0.01"
              min="0"
              value={campos.monto}
              onChange={(e) => setCampo('monto', e.target.value)}
              required
            />
          </label>
          <button type="submit" className="btn-desglose" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Agregar (Enter)'}
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
                  <th className="col-concepto">Tipo</th>
                  <th>Nro. Operación</th>
                  <th>CUIT</th>
                  <th className="col-concepto">Proveedor</th>
                  <th>IVA</th>
                  <th>Total</th>
                  <th>Enviado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filasFiltradas.map((f) => (
                  <tr key={f.id}>
                    <td>{fechaLabel(f.fecha)}</td>
                    <td className="col-concepto">{tipoComprobanteLabel(f.tipo_comprobante) || '—'}</td>
                    <td>{f.numero || '—'}</td>
                    <td>{f.cuit_contraparte || '—'}</td>
                    <td className="col-concepto">{f.proveedor}</td>
                    <td>{money(f.iva)}</td>
                    <td>{money(f.monto)}</td>
                    <td>{f.enviado ? 'Sí' : 'No'}</td>
                    <td>
                      <button type="button" className="staged-item-quitar" onClick={() => borrar(f.id)} aria-label="Borrar">×</button>
                    </td>
                  </tr>
                ))}
                {filasFiltradas.length === 0 && (
                  <tr><td colSpan={9} className="bloque-nota">Todavía no hay comprobantes cargados a mano para {razonSocial}.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
