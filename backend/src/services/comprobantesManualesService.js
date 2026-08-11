// Comprobantes de compra que no aparecen en ARCA (peajes, estaciones de servicio, etc.) — se cargan
// a mano acá y alimentan el Control mensual junto con los que sí vienen de Mis Comprobantes. El campo
// "enviado" es el mismo tipo de marca que pendientes_estudio.listo: se puede tildar/destildar en
// cualquier momento, no hay archivado ni borrado automático.
import { all, run, get } from '../db.js';

export async function listarProveedoresFrecuentes() {
  const rows = await all('SELECT DISTINCT proveedor FROM comprobantes_manuales ORDER BY proveedor');
  return rows.map((r) => r.proveedor);
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

export async function agregarComprobanteManual({ razonSocial, fecha, proveedor, tipoComprobante, numero, monto }) {
  if (!['NT', 'Target'].includes(razonSocial)) throw new Error('Falta razón social (NT o Target).');
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error('Fecha inválida (formato YYYY-MM-DD).');
  if (!proveedor || !proveedor.trim()) throw new Error('Falta el proveedor.');
  const montoNum = parseFloat(monto);
  if (Number.isNaN(montoNum) || montoNum < 0) throw new Error('El monto debe ser un número.');

  const periodo = fecha.slice(0, 7);
  const result = await run(
    `INSERT INTO comprobantes_manuales (razon_social, fecha, periodo, proveedor, tipo_comprobante, numero, monto)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [razonSocial, fecha, periodo, proveedor.trim(), tipoComprobante || null, numero || null, montoNum]
  );
  return get('SELECT * FROM comprobantes_manuales WHERE id = ?', [Number(result.lastInsertRowid)]);
}

export async function marcarEnviadoManual(id, enviado) {
  await run('UPDATE comprobantes_manuales SET enviado = ? WHERE id = ?', [enviado ? 1 : 0, id]);
}

export async function eliminarComprobanteManual(id) {
  await run('DELETE FROM comprobantes_manuales WHERE id = ?', [id]);
}
