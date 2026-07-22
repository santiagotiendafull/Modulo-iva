// Parseo e importación de comprobantes del mes en curso (DDJJ todavía no presentada), desde los
// archivos "Mis Comprobantes Emitidos/Recibidos" de ARCA. Soporta .xlsx reales y volcados de texto
// plano (mismo formato CSV-like, para cuando el binario original no está disponible).
import fs from 'node:fs';
import ExcelJS from 'exceljs';
import { db } from '../db.js';
// db acá es el cliente crudo de @libsql/client (no el helper get/all/run): se usa .batch() para
// insertar todas las filas de un archivo en una sola transacción, en vez de un round-trip por fila.

export const CUIT_A_RAZON_SOCIAL = {
  '20244058001': 'NT',
  '30709242497': 'Target',
};

export function razonSocialDesdeTexto(texto) {
  // Compacta a solo dígitos para que matchee tanto "20244058001" como "20-24405800-1": el guion
  // que ARCA a veces agrega al CUIT en el título no debería impedir la detección.
  const soloDigitos = texto.replace(/[^\d]/g, '');
  for (const [cuit, razon] of Object.entries(CUIT_A_RAZON_SOCIAL)) {
    if (soloDigitos.includes(cuit)) return razon;
  }
  return null;
}

function fechaAIso(ddmmyyyy) {
  const [d, m, y] = ddmmyyyy.split('/');
  return `${y}-${m}-${d}`;
}

function periodoDeFecha(isoFecha) {
  return isoFecha.slice(0, 7);
}

export const EMITIDOS_COLS = {
  __tipo: 'venta',
  fecha: 0, tipoComprobante: 1, pdv: 2, numeroDesde: 3, numeroHasta: 4,
  tipoDocContraparte: 6, nroDocContraparte: 7, denominacionContraparte: 8,
  iva105: 16, netoGravado105: 17, iva21: 18, netoGravado21: 19, iva27: 20, netoGravado27: 21,
  netoGravadoTotal: 22, netoNoGravado: 23, opExentas: 24, otrosTributos: 25,
  totalIva: 26, impTotal: 27,
};

export const RECIBIDOS_COLS = {
  __tipo: 'compra',
  fecha: 0, tipoComprobante: 1, pdv: 2, numeroDesde: 3, numeroHasta: 4,
  tipoDocContraparte: 6, nroDocContraparte: 7, denominacionContraparte: 8,
  iva105: 18, netoGravado105: 19, iva21: 20, netoGravado21: 21, iva27: 22, netoGravado27: 23,
  netoGravadoTotal: 24, netoNoGravado: 25, opExentas: 26, otrosTributos: 27,
  totalIva: 28, impTotal: 29,
};

// Excel a veces guarda el CUIT/DNI del emisor/receptor como número, no como texto, y ExcelJS lo
// devuelve con un ".0" pegado (ej. "30687896773.0"). Sin esto, el mismo proveedor queda duplicado
// según el archivo del que haya salido.
function normalizarCuit(v) {
  if (v == null || v === '') return null;
  const soloDigitos = String(v).trim().replace(/\.0+$/, '').replace(/[^\d]/g, '');
  return soloDigitos || null;
}

function normalizarFila(fields, cols, { razonSocial, tipo, archivoOrigen }) {
  const fecha = fields[cols.fecha];
  if (!fecha || !/^\d{2}\/\d{2}\/\d{4}$/.test(fecha)) return null;
  const fechaIso = fechaAIso(fecha);
  const num = (v) => (v === undefined || v === '' ? 0 : parseFloat(v));
  return {
    razon_social: razonSocial,
    tipo,
    periodo: periodoDeFecha(fechaIso),
    fecha: fechaIso,
    tipo_comprobante: fields[cols.tipoComprobante] || null,
    pdv: fields[cols.pdv] ?? null,
    numero_desde: fields[cols.numeroDesde] ?? null,
    numero_hasta: fields[cols.numeroHasta] ?? null,
    cuit_contraparte: normalizarCuit(fields[cols.nroDocContraparte]),
    denominacion_contraparte: fields[cols.denominacionContraparte] || null,
    neto_gravado: num(fields[cols.netoGravadoTotal]),
    neto_no_gravado: num(fields[cols.netoNoGravado]),
    op_exentas: num(fields[cols.opExentas]),
    otros_tributos: num(fields[cols.otrosTributos]),
    iva: num(fields[cols.totalIva]),
    total: num(fields[cols.impTotal]),
    neto_gravado_105: num(fields[cols.netoGravado105]),
    iva_105: num(fields[cols.iva105]),
    neto_gravado_21: num(fields[cols.netoGravado21]),
    iva_21: num(fields[cols.iva21]),
    neto_gravado_27: num(fields[cols.netoGravado27]),
    iva_27: num(fields[cols.iva27]),
    categoria: null,
    archivo_origen: archivoOrigen,
  };
}

function celdaAValor(cell) {
  if (cell == null) return '';
  if (cell instanceof Date) {
    // Excel guarda fechas como medianoche UTC del día calendario, sin intención de huso horario.
    // Con getDate()/getMonth() locales, en un server en UTC-3 (Argentina) esa medianoche UTC cae
    // en las 21hs del día anterior, corriendo todas las fechas un día para atrás. Con los métodos
    // UTC se lee el día calendario tal cual está guardado.
    const d = String(cell.getUTCDate()).padStart(2, '0');
    const m = String(cell.getUTCMonth() + 1).padStart(2, '0');
    return `${d}/${m}/${cell.getUTCFullYear()}`;
  }
  if (typeof cell === 'object') {
    if ('text' in cell) return cell.text;
    if ('result' in cell) return cell.result;
    if ('richText' in cell) return cell.richText.map((r) => r.text).join('');
  }
  return cell;
}

async function workbookDesdeBufferOArchivo(bufferOPath) {
  const wb = new ExcelJS.Workbook();
  if (typeof bufferOPath === 'string') await wb.xlsx.readFile(bufferOPath);
  else await wb.xlsx.load(bufferOPath);
  return wb;
}

// El formato oficial "Mis Comprobantes" trae título (fila 1) + encabezados (fila 2) antes de los
// datos, pero el export "consulta" de ARCA (mismas columnas, sin título con el CUIT) arranca
// directo con los encabezados en la fila 1. En vez de asumir una cantidad fija de filas a saltear,
// se busca la fila de encabezados (la primera cuya primera celda empieza con "fecha") y los datos
// arrancan justo después — así funciona con cualquiera de los dos formatos.
function indiceFilaEncabezado(sheet) {
  let indice = null;
  sheet.eachRow((row, rowNumber) => {
    if (indice != null) return;
    const primera = String(celdaAValor(row.getCell(1).value) || '').trim().toLowerCase();
    if (primera.startsWith('fecha')) indice = rowNumber;
  });
  return indice;
}

export async function leerFilasXlsx(bufferOPath) {
  const wb = await workbookDesdeBufferOArchivo(bufferOPath);
  const sheet = wb.worksheets[0];
  const filaEncabezado = indiceFilaEncabezado(sheet) ?? 2;
  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= filaEncabezado) return;
    const values = row.values.slice(1).map(celdaAValor); // values[0] queda vacío por el 1-index de exceljs
    if (values.length > 1) rows.push(values);
  });
  return rows;
}

export function leerFilasTextoPlano(filePath, numCampos) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const chunks = raw.split(/(?=\d{2}\/\d{2}\/\d{4},)/).slice(1); // descarta preámbulo + encabezado
  return chunks
    .map((chunk) => chunk.trim().split(',').slice(0, numCampos))
    .filter((fields) => /^\d{2}\/\d{2}\/\d{4}$/.test(fields[0]));
}

// El CUIT del título cae en alguna de las filas antes de los encabezados ("Mis Comprobantes
// Emitidos - CUIT ..."). El export "consulta" de ARCA no trae esa fila en absoluto (encabezados
// directo en la fila 1) — en ese caso no hay forma de detectar la razón social desde el archivo y
// se devuelve null, para que quien sube el archivo la elija a mano.
export async function razonSocialDesdeXlsx(bufferOPath) {
  const wb = await workbookDesdeBufferOArchivo(bufferOPath);
  const sheet = wb.worksheets[0];
  const filaEncabezado = indiceFilaEncabezado(sheet) ?? 2;
  let texto = '';
  for (let i = 1; i < filaEncabezado; i++) {
    const row = sheet.getRow(i);
    if (!row) continue;
    row.eachCell({ includeEmpty: false }, (cell) => {
      texto += ` ${celdaAValor(cell.value) ?? ''}`;
    });
  }
  return razonSocialDesdeTexto(texto);
}

export function razonSocialDesdeTextoPlano(filePath) {
  const inicio = fs.readFileSync(filePath, 'utf8').slice(0, 300);
  return razonSocialDesdeTexto(inicio);
}

const INSERT_COMPROBANTE_SQL = `
  INSERT INTO comprobantes
    (razon_social, tipo, periodo, fecha, tipo_comprobante, pdv, numero_desde, numero_hasta,
     cuit_contraparte, denominacion_contraparte, neto_gravado, neto_no_gravado, op_exentas,
     otros_tributos, iva, total, neto_gravado_105, iva_105, neto_gravado_21, iva_21,
     neto_gravado_27, iva_27, categoria, archivo_origen)
  VALUES
    (@razon_social, @tipo, @periodo, @fecha, @tipo_comprobante, @pdv, @numero_desde, @numero_hasta,
     @cuit_contraparte, @denominacion_contraparte, @neto_gravado, @neto_no_gravado, @op_exentas,
     @otros_tributos, @iva, @total, @neto_gravado_105, @iva_105, @neto_gravado_21, @iva_21,
     @neto_gravado_27, @iva_27, @categoria, @archivo_origen)
`;

// fileNameOrBuffer: path (CLI) o Buffer (subida por HTTP) — leerFilas y razonSocialDesdeXlsx
// aceptan ambos. nombreArchivo es siempre el nombre a mostrar/guardar como archivo_origen.
// razonSocialManual: algunos exports de ARCA (la "consulta" en vez de "Mis Comprobantes") no traen
// el CUIT en ningún lado — para esos, quien sube el archivo la elige a mano en el front.
async function parseArchivo({ fileNameOrBuffer, nombreArchivo, tipo, cols, leerFilas, razonSocialManual }) {
  const detectada = tipo === 'raw'
    ? razonSocialDesdeTextoPlano(fileNameOrBuffer)
    : await razonSocialDesdeXlsx(fileNameOrBuffer);
  const razonSocial = detectada ?? razonSocialManual ?? null;
  if (!razonSocial) return { razonSocial: null, filas: [] };
  const filasRaw = await leerFilas(fileNameOrBuffer);
  const filas = filasRaw
    .map((fields) => normalizarFila(fields, cols, { razonSocial, tipo: cols.__tipo, archivoOrigen: nombreArchivo }))
    .filter(Boolean);
  return { razonSocial, filas };
}

// Parsea sin escribir en la base — para previsualizar antes de cargar.
export async function previsualizarArchivo(args) {
  const { razonSocial, filas } = await parseArchivo(args);
  if (!razonSocial) return { razonSocial: null, periodos: [], comprobantes: 0 };
  return {
    razonSocial,
    periodos: [...new Set(filas.map((f) => f.periodo))],
    comprobantes: filas.length,
  };
}

// Se cargan todos los comprobantes del archivo, tenga o no DDJJ presentada ese período: el
// resultado fiscal (posicionService) siempre prioriza la DDJJ cuando existe, así que estos datos no
// la pisan — y tenerlos disponibles es lo que permite comparar "Interna vs Externa" en Conciliación.
export async function importarArchivo({ fileNameOrBuffer, nombreArchivo, tipo, cols, leerFilas, razonSocialManual }) {
  const { razonSocial, filas } = await parseArchivo({ fileNameOrBuffer, nombreArchivo, tipo, cols, leerFilas, razonSocialManual });
  if (!razonSocial) return { razonSocial: null, filas: [] };

  await db.batch([
    { sql: 'DELETE FROM comprobantes WHERE razon_social = ? AND tipo = ? AND archivo_origen = ?', args: [razonSocial, cols.__tipo, nombreArchivo] },
    ...filas.map((r) => ({ sql: INSERT_COMPROBANTE_SQL, args: r })),
  ], 'write');

  return { razonSocial, filas };
}

export async function importarTodosLosArchivos(sourceDir) {
  let total = 0;
  const detalle = [];
  if (!fs.existsSync(sourceDir)) return { total, detalle };
  const archivos = fs.readdirSync(sourceDir);

  for (const file of archivos) {
    const filePath = `${sourceDir}/${file}`;
    const esEmitido = /emitid/i.test(file);
    const esRecibido = /recibid/i.test(file);
    let resultado = null;
    // Nombre real de ARCA: "Mis Comprobantes Emitidos/Recibidos - CUIT ... .xlsx". El sufijo
    // "_raw.txt" es solo para los volcados de texto plano usados en pruebas.
    if (/\.xlsx$/i.test(file) && esEmitido) {
      resultado = await importarArchivo({ fileNameOrBuffer: filePath, nombreArchivo: file, tipo: 'xlsx', cols: EMITIDOS_COLS, leerFilas: leerFilasXlsx });
    } else if (/\.xlsx$/i.test(file) && esRecibido) {
      resultado = await importarArchivo({ fileNameOrBuffer: filePath, nombreArchivo: file, tipo: 'xlsx', cols: RECIBIDOS_COLS, leerFilas: leerFilasXlsx });
    } else if (/_raw\.txt$/i.test(file) && esEmitido) {
      resultado = await importarArchivo({ fileNameOrBuffer: filePath, nombreArchivo: file, tipo: 'raw', cols: EMITIDOS_COLS, leerFilas: (p) => leerFilasTextoPlano(p, 28) });
    } else if (/_raw\.txt$/i.test(file) && esRecibido) {
      resultado = await importarArchivo({ fileNameOrBuffer: filePath, nombreArchivo: file, tipo: 'raw', cols: RECIBIDOS_COLS, leerFilas: (p) => leerFilasTextoPlano(p, 30) });
    }
    if (resultado) {
      total += resultado.filas.length;
      detalle.push({ archivo: file, razonSocial: resultado.razonSocial, filas: resultado.filas.length });
    }
  }
  return { total, detalle };
}
