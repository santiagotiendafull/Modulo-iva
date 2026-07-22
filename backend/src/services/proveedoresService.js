// Clasificación de proveedores de compras: si un proveedor queda marcado "no_corresponde", ninguna
// de sus facturas toma crédito fiscal, sin importar la letra del comprobante. La clasificación es
// global por CUIT (no depende de la razón social) y queda guardada para que los próximos Excel que
// se suban ya la respeten automáticamente.
import { all, run } from '../db.js';
import { signoComprobante } from './clasificacionComprobantes.js';

export async function establecerEstado(cuit, estado) {
  if (!cuit) throw new Error('falta el CUIT del proveedor');
  if (estado !== 'corresponde' && estado !== 'no_corresponde') {
    throw new Error('estado debe ser "corresponde" o "no_corresponde"');
  }
  await run(`
    INSERT INTO proveedores (cuit, estado, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT (cuit) DO UPDATE SET estado = excluded.estado, updated_at = excluded.updated_at
  `, [cuit, estado]);
}

// CUITs marcados "no_corresponde" — se usa para vetar esas compras en todos los cálculos de IVA.
export async function cuitsNoCorresponde() {
  const rows = await all("SELECT cuit FROM proveedores WHERE estado = 'no_corresponde'");
  return new Set(rows.map((r) => r.cuit));
}

// Lista de proveedores de compras vistos en los comprobantes cargados, con su clasificación (o
// "nuevo" si todavía no se clasificó) y el volumen de compras que le corresponde a cada uno.
export async function listarProveedores() {
  const rows = await all(`
    SELECT cuit_contraparte AS cuit, denominacion_contraparte AS denominacion,
           tipo_comprobante, neto_gravado, iva, razon_social
    FROM comprobantes
    WHERE tipo = 'compra' AND cuit_contraparte IS NOT NULL AND cuit_contraparte != ''
  `);

  const estados = new Map((await all('SELECT cuit, estado FROM proveedores')).map((p) => [p.cuit, p.estado]));

  const porCuit = new Map();
  for (const r of rows) {
    if (!porCuit.has(r.cuit)) {
      porCuit.set(r.cuit, { cuit: r.cuit, denominacion: r.denominacion, comprobantes: 0, neto_gravado: 0, iva: 0, razonesSociales: new Set() });
    }
    const acc = porCuit.get(r.cuit);
    if (r.denominacion) acc.denominacion = r.denominacion;
    acc.razonesSociales.add(r.razon_social);
    const signo = signoComprobante('compra', r.tipo_comprobante);
    if (signo === 0) continue; // solo se cuenta lo que hoy toma crédito fiscal (Factura A y sus NC)
    acc.comprobantes += 1;
    acc.neto_gravado += signo * r.neto_gravado;
    acc.iva += signo * r.iva;
  }

  const proveedores = [...porCuit.values()]
    .map((p) => ({ ...p, razonesSociales: [...p.razonesSociales], estado: estados.get(p.cuit) ?? null }))
    .sort((a, b) => (a.denominacion || '').localeCompare(b.denominacion || ''));

  return {
    proveedores,
    hayNuevos: proveedores.some((p) => p.estado === null),
    hayNuevosPorRazonSocial: {
      NT: proveedores.some((p) => p.estado === null && p.razonesSociales.includes('NT')),
      Target: proveedores.some((p) => p.estado === null && p.razonesSociales.includes('Target')),
    },
  };
}

// Compras que no se toman porque su proveedor está marcado "no_corresponde" — para el listado y el
// total de monto gravado / IVA que se pierde por ese motivo.
export async function comprasExcluidasPorProveedor() {
  const noCorresponde = await cuitsNoCorresponde();
  if (noCorresponde.size === 0) return { filas: [], totales: { neto_gravado: 0, iva: 0 } };

  const rows = await all(`
    SELECT razon_social, periodo, fecha, tipo_comprobante, cuit_contraparte AS cuit,
           denominacion_contraparte AS denominacion, neto_gravado, iva
    FROM comprobantes
    WHERE tipo = 'compra' AND cuit_contraparte IS NOT NULL AND cuit_contraparte != ''
    ORDER BY fecha DESC
  `);

  const filas = [];
  let totalGravado = 0;
  let totalIva = 0;
  for (const r of rows) {
    if (!noCorresponde.has(r.cuit)) continue;
    const signo = signoComprobante('compra', r.tipo_comprobante);
    if (signo === 0) continue; // ya estaba afuera del cálculo por otro motivo (no es lo que se "pierde" acá)
    const neto = signo * r.neto_gravado;
    const iva = signo * r.iva;
    filas.push({ ...r, neto_gravado: neto, iva });
    totalGravado += neto;
    totalIva += iva;
  }

  return { filas, totales: { neto_gravado: totalGravado, iva: totalIva } };
}
