// Configuración editable de la app. Por ahora un único valor: el porcentaje que se aplica a la
// Suma de Rem. 10 del Formulario 931 para obtener el crédito fiscal adicional.
import { get, run } from '../db.js';

const CLAVE_PORCENTAJE_931 = 'porcentaje_931';
const PORCENTAJE_931_POR_DEFECTO = 9.7;

export async function obtenerPorcentaje931() {
  const row = await get('SELECT valor FROM configuracion WHERE clave = ?', [CLAVE_PORCENTAJE_931]);
  return row ? parseFloat(row.valor) : PORCENTAJE_931_POR_DEFECTO;
}

export async function establecerPorcentaje931(valor) {
  const n = parseFloat(valor);
  if (Number.isNaN(n) || n < 0 || n > 100) {
    throw new Error('El porcentaje debe ser un número entre 0 y 100.');
  }
  await run(`
    INSERT INTO configuracion (clave, valor) VALUES (?, ?)
    ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor
  `, [CLAVE_PORCENTAJE_931, String(n)]);
  return n;
}
