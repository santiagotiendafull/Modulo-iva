import { useState } from 'react';
import { api } from '../api';
import { money } from '../format';
import InfoTooltip from './InfoTooltip';

const EXPLICACION = {
  ventas: "Suma el IVA de todas las ventas: Facturas A, B y C. Las Notas de Crédito restan.",
  compras: "Suma el IVA solo de Facturas A. Excluye proveedores 'No corresponde'. Incluye el crédito fiscal del Formulario 931 y el crédito fiscal manual, si hay cargados.",
};

const LABEL_ALICUOTA = { '10.5': '10,5%', '21': '21%', '27': '27%' };

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

  const filas = datos
    ? Object.entries(datos).filter(([, v]) => Math.abs(v.neto_gravado) > 0.005 || Math.abs(v.iva) > 0.005)
    : [];

  return (
    <div className="desglose-alicuotas">
      <button type="button" className="btn-desglose" onClick={toggle}>
        {abierto ? 'Ocultar desglose por alícuota' : 'Ver desglose por alícuota'}
      </button>
      {abierto && (
        <div className="desglose-alicuotas-panel">
          {cargando && <p className="desglose-cargando">Cargando…</p>}
          {error && <p className="error-banner">{error}</p>}
          {!cargando && !error && filas.length === 0 && (
            <p className="desglose-vacio">Sin montos gravados a 10,5%, 21% o 27% en este período.</p>
          )}
          {!cargando && filas.length > 0 && (
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
          )}
        </div>
      )}
    </div>
  );
}

function Bloque({ titulo, totalIva, detalle, esCompras, razonSocial, periodo, credito931 }) {
  const filas = detalle?.filas ?? [];
  const totales = detalle?.totales;
  const netoGravado = totales?.neto_gravado ?? filas.reduce((acc, f) => acc + (f.neto_gravado || 0), 0);

  const porTipo = new Map();
  for (const f of filas) {
    const key = f.tipo_comprobante || 'Sin tipo';
    const actual = porTipo.get(key) || { n: 0, excluido: f.excluido, resta: f.resta };
    porTipo.set(key, { n: actual.n + 1, excluido: f.excluido, resta: f.resta });
  }

  return (
    <div className="bloque">
      <h3>
        {titulo}
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
            <span>Neto gravado: {money(netoGravado)}</span>
          </div>
          {credito931 > 0 && (
            <p className="bloque-credito-931">
              Incluye {money(credito931)} de crédito fiscal por Formulario 931 (Suma de Rem. 10 × porcentaje configurado).
            </p>
          )}
          {porTipo.size > 0 && (
            <ul className="bloque-tipos">
              {[...porTipo.entries()].map(([tipo, info]) => {
                let clase = '';
                if (info.excluido) clase = 'tipo-excluido';
                else if (info.resta) clase = 'tipo-resta';
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
        titulo="IVA Ventas"
        totalIva={resumen.iva_ventas}
        detalle={ventasDetalle}
        esCompras={false}
        razonSocial={resumen.razon_social}
        periodo={resumen.periodo}
      />
      <Bloque
        titulo="IVA Compras"
        totalIva={resumen.iva_compras}
        detalle={comprasDetalle}
        esCompras={true}
        razonSocial={resumen.razon_social}
        periodo={resumen.periodo}
        credito931={ventasCompras?.credito_931}
      />
    </div>
  );
}
