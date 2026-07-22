// CLI: importa todos los archivos de mes en curso desde data/source/mes-en-curso.
// Se puede correr de nuevo cada vez que se suba un archivo nuevo: borra e inserta de nuevo por
// (razon_social, tipo, archivo_origen).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importarTodosLosArchivos } from '../src/services/mesEnCursoService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = path.join(__dirname, '..', '..', 'data', 'source', 'mes-en-curso');

const { total, detalle } = await importarTodosLosArchivos(SOURCE_DIR);
for (const d of detalle) {
  console.log(`[${d.razonSocial ?? '??'}] ${d.archivo}: ${d.filas} comprobantes`);
}
console.log(`\nImportados ${total} comprobantes del mes en curso.`);
