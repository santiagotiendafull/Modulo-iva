// Comprobantes de compra que no aparecen en ARCA (peajes, estaciones de servicio, etc.) — se cargan
// a mano acá y alimentan el Control mensual junto con los que sí vienen de Mis Comprobantes. El campo
// "enviado" es el mismo tipo de marca que pendientes_estudio.listo: se puede tildar/destildar en
// cualquier momento, no hay archivado ni borrado automático.
import { all, run, get } from '../db.js';

function normalizarCuit(v) {
  if (v == null || v === '') return null;
  const soloDigitos = String(v).trim().replace(/\.0+$/, '').replace(/[^\d]/g, '');
  return soloDigitos || null;
}

// Directorio de proveedores habituales (peajes, estaciones de servicio) para precargar CUIT +
// Denominación de una sola vez al elegir el proveedor, en vez de tipearlos en cada comprobante.
export async function listarProveedoresManuales() {
  return all('SELECT * FROM proveedores_manuales ORDER BY denominacion');
}

export async function agregarProveedorManual(cuit, denominacion) {
  const cuitNorm = normalizarCuit(cuit);
  if (!cuitNorm) throw new Error('Falta el CUIT del proveedor.');
  if (!denominacion || !denominacion.trim()) throw new Error('Falta la denominación del proveedor.');
  await run(
    `INSERT INTO proveedores_manuales (cuit, denominacion) VALUES (?, ?)
     ON CONFLICT (cuit) DO UPDATE SET denominacion = excluded.denominacion`,
    [cuitNorm, denominacion.trim()]
  );
  return get('SELECT * FROM proveedores_manuales WHERE cuit = ?', [cuitNorm]);
}

export async function eliminarProveedorManual(id) {
  await run('DELETE FROM proveedores_manuales WHERE id = ?', [id]);
}

// Cada vez que se carga un comprobante con un CUIT nuevo, se guarda solo en el directorio — así la
// próxima vez ya está precargado, sin tener que agregarlo a mano primero.
async function recordarProveedor(cuit, denominacion) {
  const cuitNorm = normalizarCuit(cuit);
  if (!cuitNorm || !denominacion) return;
  await run(
    `INSERT INTO proveedores_manuales (cuit, denominacion) VALUES (?, ?)
     ON CONFLICT (cuit) DO UPDATE SET denominacion = excluded.denominacion`,
    [cuitNorm, denominacion]
  );
}

export async function listarComprobantesManuales(razonSocial, periodo) {
  if (!['NT', 'Target'].includes(razonSocial)) throw new Error('Falta razón social (NT o Target).');
  if (periodo) {
    return all(
      'SELECT * FROM comprobantes_manuales WHERE razon_social = ? AND periodo = ? ORDER BY fecha DESC, id DESC',
      [razonSocial, periodo]
    );
  }
  return all('SELECT * FROM comprobantes_manuales WHERE razon_social = ? ORDER BY fecha DESC, id DESC', [razonSocial]);
}

export async function agregarComprobanteManual({ razonSocial, fecha, proveedor, cuit, tipoComprobante, numero, iva, monto }) {
  if (!['NT', 'Target'].includes(razonSocial)) throw new Error('Falta razón social (NT o Target).');
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error('Fecha inválida (formato YYYY-MM-DD).');
  if (!proveedor || !proveedor.trim()) throw new Error('Falta el proveedor.');
  const ivaNum = iva === '' || iva == null ? 0 : parseFloat(iva);
  if (Number.isNaN(ivaNum) || ivaNum < 0) throw new Error('El IVA debe ser un número.');
  const montoNum = parseFloat(monto);
  if (Number.isNaN(montoNum) || montoNum < 0) throw new Error('El importe total debe ser un número.');

  const cuitNorm = normalizarCuit(cuit);
  const periodo = fecha.slice(0, 7);
  const result = await run(
    `INSERT INTO comprobantes_manuales (razon_social, fecha, periodo, proveedor, cuit_contraparte, tipo_comprobante, numero, iva, monto)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [razonSocial, fecha, periodo, proveedor.trim(), cuitNorm, tipoComprobante || null, numero || null, ivaNum, montoNum]
  );
  if (cuitNorm) await recordarProveedor(cuitNorm, proveedor.trim());
  return get('SELECT * FROM comprobantes_manuales WHERE id = ?', [Number(result.lastInsertRowid)]);
}

export async function marcarEnviadoManual(id, enviado) {
  await run('UPDATE comprobantes_manuales SET enviado = ? WHERE id = ?', [enviado ? 1 : 0, id]);
}

export async function eliminarComprobanteManual(id) {
  await run('DELETE FROM comprobantes_manuales WHERE id = ?', [id]);
}
