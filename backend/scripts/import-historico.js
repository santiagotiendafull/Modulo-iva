// CLI: importa todos los PDF históricos desde data/source/historico/{NT,Target}.
// Se puede correr de nuevo cuando lleguen los PDFs de los próximos meses: hace upsert por (razon_social, periodo).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importarTodosLosPdfs } from '../src/services/historicoService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = path.join(__dirname, '..', '..', 'data', 'source', 'historico');

const resultados = await importarTodosLosPdfs(SOURCE_DIR);
for (const row of resultados) {
  console.log(
    `[${row.razon_social}] ${row.periodo} — Ventas ${row.iva_ventas.toFixed(2)} | Compras ${row.iva_compras.toFixed(2)} | ` +
    `Diferencia ${row.diferencia.toFixed(2)} | Saldo técnico anterior ${row.saldo_tecnico_anterior.toFixed(2)} | ` +
    `Saldo técnico ${row.saldo_tecnico.toFixed(2)}`
  );
}
console.log(`\nImportados ${resultados.length} períodos históricos.`);
