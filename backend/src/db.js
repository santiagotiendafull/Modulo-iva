import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'data', 'modulo_iva.db');

export const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL');

// conciliacion_arca quedó retirada: la conciliación de compras pasó a usar directamente la tabla
// comprobantes (la misma que ya carga "Mis Comprobantes (Emitidos - Recibidos)" en Cargar Datos),
// así que no hace falta subir el Excel de Recibidos dos veces. No hay pérdida real: esa tabla nunca
// tuvo datos de producción cargados.
db.exec('DROP TABLE IF EXISTS conciliacion_arca');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Migración simple para bases ya creadas antes de agregar el desglose por alícuota.
const columnasComprobantes = new Set(db.prepare('PRAGMA table_info(comprobantes)').all().map((c) => c.name));
for (const columna of ['neto_gravado_105', 'iva_105', 'neto_gravado_21', 'iva_21', 'neto_gravado_27', 'iva_27']) {
  if (!columnasComprobantes.has(columna)) {
    db.exec(`ALTER TABLE comprobantes ADD COLUMN ${columna} REAL NOT NULL DEFAULT 0`);
  }
}
