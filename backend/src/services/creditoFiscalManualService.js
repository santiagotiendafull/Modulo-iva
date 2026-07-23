// Crédito fiscal manual: monto fijo por período para comprobantes que no aparecen en ARCA pero se
// pueden tomar como crédito fiscal. Se suma al IVA Compras del período igual que el crédito del
// Formulario 931 (ver posicionService.js).
import { all, run } from '../db.js';

export async function listarCreditoManual() {
  return all('SELECT * FROM credito_fiscal_manual ORDER BY periodo DESC, id DESC');
}

export async function agregarCreditoManual(razonSocial, periodo, monto, descripcion) {
  if (!['NT', 'Target'].includes(razonSocial)) throw new Error('razón social inválida');
  if (!/^\d{4}-\d{2}$/.test(periodo)) throw new Error('período inválido (formato YYYY-MM)');
  const n = parseFloat(monto);
  if (Number.isNaN(n) || n <= 0) throw new Error('el monto debe ser un número mayor a 0');
  await run(
    'INSERT INTO credito_fiscal_manual (razon_social, periodo, monto, descripcion) VALUES (?, ?, ?, ?)',
    [razonSocial, periodo, n, descripcion || null]
  );
}

export async function eliminarCreditoManual(id) {
  await run('DELETE FROM credito_fiscal_manual WHERE id = ?', [id]);
}

// Mapa periodo -> suma de montos, para sumarlo al armar la posición de varios períodos de una.
export async function creditoManualPorPeriodo(razonSocial) {
  const rows = await all(
    'SELECT periodo, SUM(monto) as monto FROM credito_fiscal_manual WHERE razon_social = ? GROUP BY periodo',
    [razonSocial]
  );
  return new Map(rows.map((r) => [r.periodo, r.monto]));
}

// Crédito manual de un período puntual: 0 si no hay nada cargado para esa razón social/período.
export async function creditoManual(razonSocial, periodo) {
  const mapa = await creditoManualPorPeriodo(razonSocial);
  return mapa.get(periodo) ?? 0;
}
