// Motor de base: @libsql/client habla tanto con un archivo SQLite local (desarrollo) como con Turso
// (producción) sin cambiar una sola consulta — es el mismo dialecto SQL. Cuál usar se decide solo
// por si están seteadas las variables de entorno TURSO_DATABASE_URL / TURSO_AUTH_TOKEN.
//
// A diferencia de node:sqlite (síncrono), este cliente es asíncrono: toda consulta devuelve una
// Promise. Por eso get/all/run de acá son async y hay que hacerles await en todos los servicios.
import { createClient } from '@libsql/client';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPathLocal = path.join(__dirname, '..', 'data', 'modulo_iva.db');

const url = process.env.TURSO_DATABASE_URL || `file:${dbPathLocal}`;
const authToken = process.env.TURSO_AUTH_TOKEN;
const esLocal = url.startsWith('file:');

export const db = createClient(authToken ? { url, authToken } : { url });

export async function get(sql, args = []) {
  const r = await db.execute({ sql, args });
  return r.rows[0];
}

export async function all(sql, args = []) {
  const r = await db.execute({ sql, args });
  return r.rows;
}

export async function run(sql, args = []) {
  return db.execute({ sql, args });
}

// Prepara la base al arrancar el server: crea el schema si no existe y aplica las migraciones
// simples que fueron quedando. Hay que esperarla (await initDb()) antes de levantar el server.
export async function initDb() {
  if (esLocal) {
    if (!fs.existsSync(path.dirname(dbPathLocal))) fs.mkdirSync(path.dirname(dbPathLocal), { recursive: true });
    await run('PRAGMA journal_mode = WAL');
  }

  // conciliacion_arca quedó retirada: la conciliación de compras pasó a usar directamente la tabla
  // comprobantes (la misma que ya carga "Mis Comprobantes (Emitidos - Recibidos)" en Cargar Datos).
  await run('DROP TABLE IF EXISTS conciliacion_arca');

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await db.executeMultiple(schema);

  // Migración simple para bases ya creadas antes de agregar el desglose por alícuota.
  const columnasComprobantes = new Set((await all('PRAGMA table_info(comprobantes)')).map((c) => c.name));
  for (const columna of ['neto_gravado_105', 'iva_105', 'neto_gravado_21', 'iva_21', 'neto_gravado_27', 'iva_27']) {
    if (!columnasComprobantes.has(columna)) {
      await run(`ALTER TABLE comprobantes ADD COLUMN ${columna} REAL NOT NULL DEFAULT 0`);
    }
  }

  // Primera vez que corre: siembra las 3 cuentas iniciales (una por rol).
  const { hashPassword } = await import('./services/authService.js');
  const yaHayUsuarios = await get('SELECT id FROM usuarios LIMIT 1');
  if (!yaHayUsuarios) {
    const cuentasIniciales = [
      ['Nicolas Trevisan', 'NicolasIVA', 'gerente'],
      ['Administracion', 'AdminIVA', 'administrador'],
      ['Devs', 'DevsIVA', 'dev'],
    ];
    for (const [username, password, rol] of cuentasIniciales) {
      await run('INSERT INTO usuarios (username, password_hash, rol) VALUES (?, ?, ?)', [username, hashPassword(password), rol]);
    }
  }
}
