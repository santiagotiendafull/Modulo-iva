import { useState } from 'react';
import { api } from '../api';
import { money } from '../format';
import InfoTooltip from './InfoTooltip';

const EXPLICACION = {
  ventas: "Grupo A: Facturas A, B y C, tiques y recibos de venta suman al Débito Fiscal. Grupo B: las Notas de Crédito de ventas NO restan acá — se exponen como restitución en el Crédito Fiscal, metodología DDJJ de ARCA (prohibido netear en origen).",
  compras: "Grupo C: suma el IVA solo de Facturas A (las únicas que toman crédito fiscal válido; B/C no cuentan) al Crédito Fiscal Computable. Grupo D: las Notas de Crédito A NO restan acá — se exponen como restitución en el Débito Fiscal. Excluye proveedores 'No corresponde'. Incluye el crédito fiscal del Formulario 931 y el crédito fiscal manual, si hay cargados.",
};

const LABEL_ALICUOTA = { '10.5': '10,5%', '21': '21%', '27': '27%' };

function TablaAlicuotas({ filas }) {
  return (
    <table className="desglose-alicuotas-tabla">
      <thead>
        <tr>
          <th className="col-concepto">Alícuota</th>
          <th>Neto gravado</th>
          <th>IVA</th>
        </tr>
      </thead>
      <tbody>
        {filas.map(([tasa, v]) => (
          <tr key={tasa}>
            <td className="col-concepto">{LABEL_ALICUOTA[tasa] ?? `${tasa}%`}</td>
            <td>{money(v.neto_gravado)}</td>
            <td>{money(v.iva)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DesgloseAlicuotas({ razonSocial, periodo, tipo }) {
  const [abierto, setAbierto] = useState(false);
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  async function toggle() {
    if (!abierto && !datos && !error) {
      setCargando(true);
      try {
        setDatos(await api.desgloseAlicuotas(razonSocial, periodo, tipo));
      } catch (err) {
        setError(err.message);
      } finally {
        setCargando(false);
      }
    }
    setAbierto((v) => !v);
  }

  const conMonto = ([, v]) => Math.abs(v.neto_gravado) > 0.005 || Math.abs(v.iva) > 0.005;
  const filasOperaciones = datos ? Object.entries(datos.operaciones).filter(conMonto) : [];
  const filasRestitucion = datos ? Object.entries(datos.restitucion).filter(conMonto) : [];

  return (
    <div className="desglose-alicuotas">
      <button type="button" className="btn-desglose" onClick={toggle}>
        {abierto ? 'Ocultar desglose por alícuota' : 'Ver desglose por alícuota'}
      </button>
      {abierto && (
        <div className="desglose-alicuotas-panel">
          {cargando && <p className="desglose-cargando">Cargando…</p>}
          {error && <p className="error-banner">{error}</p>}
          {!cargando && !error && filasOperaciones.length === 0 && filasRestitucion.length === 0 && (
            <p className="desglose-vacio">Sin montos gravados a 10,5%, 21% o 27% en este período.</p>
          )}
          {!cargando && filasOperaciones.length > 0 && (
            <>
              <p className="desglose-alicuotas-subtitulo">Operaciones</p>
              <TablaAlicuotas filas={filasOperaciones} />
            </>
          )}
          {!cargando && filasRestitucion.length > 0 && (
            <>
              <p className="desglose-alicuotas-subtitulo">Restitución (Notas de Crédito)</p>
              <TablaAlicuotas filas={filasRestitucion} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Bloque({ titulo, totalIva, detalle, esCompras, razonSocial, periodo, credito931, credito931Estimado }) {
  const filas = detalle?.filas ?? [];
  const totales = detalle?.totales;

  const labelOperaciones = esCompras ? 'Operaciones de Compras' : 'Operaciones de Ventas';
  const labelRestitucion = esCompras
    ? 'Notas de Crédito de Compras → Restitución de Crédito Fiscal'
    : 'Notas de Crédito de Ventas → Restitución del Débito Fiscal';

  const porTipo = new Map();
  for (const f of filas) {
    const key = f.tipo_comprobante || 'Sin tipo';
    const actual = porTipo.get(key) || { n: 0, excluido: f.excluido, restitucion: f.restitucion };
    porTipo.set(key, { n: actual.n + 1, excluido: f.excluido, restitucion: f.restitucion });
  }

  return (
    <div className="bloque">
      <h3>
        {titulo}
        {credito931Estimado && <span className="origen-pill-mini origen-estimado">931 estimado</span>}
        <InfoTooltip texto={esCompras ? EXPLICACION.compras : EXPLICACION.ventas} />
      </h3>
      <div className="bloque-total">{money(totalIva)}</div>
      {detalle?.disponible === false && (
        <p className="bloque-nota">{detalle.motivo}</p>
      )}
      {detalle?.disponible && (
        <>
          <div className="bloque-stats">
            <span>{filas.length} comprobantes</span>
          </div>
          <table className="bloque-desglose-grupos desglose-alicuotas-tabla">
            <thead>
              <tr>
                <th className="col-concepto"></th>
                <th>Neto gravado</th>
                <th>IVA</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="col-concepto">{labelOperaciones}</td>
                <td>{money(totales?.operaciones_neto_gravado ?? 0)}</td>
                <td>{money(totales?.operaciones_iva ?? 0)}</td>
              </tr>
              <tr className="fila-restitucion">
                <td className="col-concepto">{labelRestitucion}</td>
                <td>{money(totales?.restitucion_neto_gravado ?? 0)}</td>
                <td>{money(totales?.restitucion_iva ?? 0)}</td>
              </tr>
            </tbody>
          </table>
          {credito931 > 0 && (
            <p className="bloque-credito-931">
              Incluye {money(credito931)} de crédito fiscal por Formulario 931
              {credito931Estimado
                ? ' — todavía no se cargó el 931 de este período, se está estimando con el del mes anterior.'
                : ' (Suma de Rem. 10 × porcentaje configurado).'}
            </p>
          )}
          {porTipo.size > 0 && (
            <ul className="bloque-tipos">
              {[...porTipo.entries()].map(([tipo, info]) => {
                let clase = '';
                if (info.excluido) clase = 'tipo-excluido';
                else if (info.restitucion) clase = 'tipo-resta';
                else if (esCompras) clase = 'tipo-computa';
                return (
                  <li key={tipo} className={clase}>
                    <span>{tipo}</span>
                    <span>{info.n}</span>
                  </li>
                );
              })}
            </ul>
          )}
          <DesgloseAlicuotas
            key={`${razonSocial}-${periodo}-${esCompras}`}
            razonSocial={razonSocial}
            periodo={periodo}
            tipo={esCompras ? 'compra' : 'venta'}
          />
        </>
      )}
      {!detalle && <p className="bloque-nota">Sin datos para este período.</p>}
    </div>
  );
}

export default function VentasCompras({ resumen, ventasCompras }) {
  if (!resumen) return null;
  const ventasDetalle = ventasCompras
    ? { disponible: ventasCompras.disponible, motivo: ventasCompras.motivo, filas: ventasCompras.ventas, totales: ventasCompras.ventasTotales }
    : null;
  const comprasDetalle = ventasCompras
    ? { disponible: ventasCompras.disponible, motivo: ventasCompras.motivo, filas: ventasCompras.compras, totales: ventasCompras.comprasTotales }
    : null;

  return (
    <div className="ventas-compras">
      <Bloque
        titulo="Débito Fiscal"
        totalIva={resumen.iva_ventas}
        detalle={ventasDetalle}
        esCompras={false}
        razonSocial={resumen.razon_social}
        periodo={resumen.periodo}
      />
      <Bloque
        titulo="Crédito Fiscal"
        totalIva={resumen.iva_compras}
        detalle={comprasDetalle}
        esCompras={true}
        razonSocial={resumen.razon_social}
        periodo={resumen.periodo}
        credito931={ventasCompras?.credito_931}
        credito931Estimado={ventasCompras?.credito_931_estimado}
      />
    </div>
  );
}
