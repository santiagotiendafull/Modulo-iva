// Uso único: copia todos los datos del archivo SQLite local a Turso. Se corre con las variables
// TURSO_DATABASE_URL / TURSO_AUTH_TOKEN seteadas apuntando a la base de destino. No toca el
// archivo local (solo lee de ahí), así que se puede correr de nuevo si hace falta.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPathLocal = path.join(__dirname, '..', 'data', 'modulo_iva.db');

const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN;
if (!tursoUrl || !tursoToken) {
  console.error('Faltan TURSO_DATABASE_URL / TURSO_AUTH_TOKEN.');
  process.exit(1);
}

const local = createClient({ url: `file:${dbPathLocal}` });
const turso = createClient({ url: tursoUrl, authToken: tursoToken });

// 1) el schema en Turso (mismo archivo que usa la app)
const schema = fs.readFileSync(path.join(__dirname, '..', 'src', 'schema.sql'), 'utf8');
await turso.executeMultiple(schema);

// 2) copiar tabla por tabla
const TABLAS = [
  'posiciones_historicas',
  'comprobantes',
  'proveedores',
  'formulario_931',
  'configuracion',
  'conciliacion_interna',
];

for (const tabla of TABLAS) {
  const { rows, columns } = await local.execute(`SELECT * FROM ${tabla}`);
  if (rows.length === 0) {
    console.log(`${tabla}: 0 filas (nada para copiar)`);
    continue;
  }
  const cols = columns.filter((c) => c !== 'id'); // el id lo regenera Turso (AUTOINCREMENT)
  const placeholders = cols.map((c) => `@${c}`).join(', ');
  const sql = `INSERT INTO ${tabla} (${cols.join(', ')}) VALUES (${placeholders})`;
  const statements = rows.map((r) => {
    const args = {};
    for (const c of cols) args[c] = r[c];
    return { sql, args };
  });
  await turso.batch(statements, 'write');
  console.log(`${tabla}: ${rows.length} filas copiadas`);
}

console.log('\nListo — Turso tiene ahora una copia de todos los datos locales.');
