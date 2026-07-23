// Configuración editable de la app: el porcentaje del Formulario 931, y qué apartados/secciones
// de la app están visibles para gerente/administrador (el rol dev siempre ve todo).
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

const CLAVE_UI_VISIBILIDAD = 'ui_visibilidad';

// Todo visible por defecto. Cada clave es un apartado/sección/ítem que el dev puede apagar
// para gerente/administrador (el dev nunca deja de ver nada, aunque él mismo lo apague).
export const CLAVES_VISIBILIDAD = {
  'nav.cargar-datos': 'Cargar datos (menú)',
  'nav.proveedores': 'Proveedores (menú)',
  'conciliacion.comprobantes': 'Conciliación → Comprobantes',
  'dashboard.resultado-fiscal': 'Dashboard → Resultado fiscal por mes',
  'dashboard.ventas-compras': 'Dashboard → Desglose Ventas/Compras',
  'dashboard.evolucion': 'Dashboard → Gráfico de evolución del saldo técnico',
};

export async function obtenerVisibilidad() {
  const row = await get('SELECT valor FROM configuracion WHERE clave = ?', [CLAVE_UI_VISIBILIDAD]);
  const guardado = row ? JSON.parse(row.valor) : {};
  const resultado = {};
  for (const clave of Object.keys(CLAVES_VISIBILIDAD)) {
    resultado[clave] = guardado[clave] !== false;
  }
  return resultado;
}

export async function establecerVisibilidad(valores) {
  const actual = await obtenerVisibilidad();
  for (const clave of Object.keys(valores || {})) {
    if (clave in CLAVES_VISIBILIDAD) actual[clave] = !!valores[clave];
  }
  await run(`
    INSERT INTO configuracion (clave, valor) VALUES (?, ?)
    ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor
  `, [CLAVE_UI_VISIBILIDAD, JSON.stringify(actual)]);
  return actual;
}
