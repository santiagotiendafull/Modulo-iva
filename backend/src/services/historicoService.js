// Parseo e importación de las posiciones mensuales históricas (PDF F.2051 de ARCA).
import fs from 'node:fs';
import path from 'node:path';
import pdfParse from 'pdf-parse';
import { db } from '../db.js';
import { CUIT_A_RAZON_SOCIAL } from './mesEnCursoService.js';

function parseNumber(str) {
  if (str == null) return 0;
  return parseFloat(str.replace(/\./g, '').replace(',', '.'));
}

function razonSocialDesdeCuit(cuit) {
  const normalizado = (cuit || '').replace(/[^\d]/g, '');
  return CUIT_A_RAZON_SOCIAL[normalizado] ?? null;
}

function extract(text, label, { excludeSuffix } = {}) {
  const re = new RegExp(label + '\\s*\\$?\\s*([\\d.,]+)', 'g');
  let match;
  while ((match = re.exec(text)) !== null) {
    if (excludeSuffix) {
      const after = text.slice(match.index + match[0].length, match.index + match[0].length + 30);
      if (new RegExp('^\\s*' + excludeSuffix).test(after)) continue;
    }
    return parseNumber(match[1]);
  }
  return null;
}

export function parsePdfText(text, archivoOrigen) {
  const flat = text.replace(/\s+/g, ' ').trim();

  const cuitMatch = flat.match(/CUIT\s*([\d-]{10,15})/);
  const periodoMatch = flat.match(/Per[ií]odo\s*(\d{6})/);
  const fechaMatch = flat.match(/Fecha de Presentaci[oó]n\s*([\d/]{8,10})/);

  const razonSocial = cuitMatch ? razonSocialDesdeCuit(cuitMatch[1]) : null;
  if (!razonSocial) {
    throw new Error(`No se pudo determinar la razón social (CUIT no reconocido) en ${archivoOrigen}`);
  }

  if (!periodoMatch) throw new Error(`No se pudo extraer el período de ${archivoOrigen}`);
  const periodoRaw = periodoMatch[1]; // YYYYMM
  const periodo = `${periodoRaw.slice(0, 4)}-${periodoRaw.slice(4, 6)}`;

  const ivaVentas = extract(flat, 'Total del d[eé]bito fiscal del per[ií]odo');
  const ivaCompras = extract(flat, 'Total del cr[eé]dito fiscal del per[ií]odo');
  if (ivaVentas == null || ivaCompras == null) {
    throw new Error(`No se pudo extraer débito/crédito fiscal de ${archivoOrigen}`);
  }

  const saldoAnteriorContrib = extract(flat, 'Saldo t[eé]cnico a favor del contribuyente del per[ií]odo anterior');
  const saldoAnteriorArca = extract(flat, 'Saldo t[eé]cnico a favor de ARCA del per[ií]odo anterior');
  let saldoTecnicoAnterior = 0;
  if (saldoAnteriorContrib != null) saldoTecnicoAnterior = saldoAnteriorContrib;
  else if (saldoAnteriorArca != null) saldoTecnicoAnterior = -saldoAnteriorArca;

  const saldoResultContrib = extract(flat, 'Saldo t[eé]cnico a favor del contribuyente(?!\\s*del)', { excludeSuffix: 'del' });
  const saldoResultArca = extract(flat, 'Saldo t[eé]cnico a favor de ARCA(?!\\s*del)', { excludeSuffix: 'del' });
  let saldoTecnico;
  if (saldoResultArca != null && saldoResultArca !== 0) saldoTecnico = -saldoResultArca;
  else if (saldoResultContrib != null) saldoTecnico = saldoResultContrib;
  else if (saldoResultArca != null) saldoTecnico = -saldoResultArca;
  else throw new Error(`No se pudo extraer el saldo técnico resultante de ${archivoOrigen}`);

  const retenciones = extract(flat, 'Total de retenciones, percepciones y pagos a cuenta neto de restituciones') ?? 0;

  const saldoLibreContrib = extract(flat, 'Saldo de libre disponibilidad a favor del contribuyente del per[ií]odo');
  const saldoLibreArca = extract(flat, 'Saldo de impuesto a favor de ARCA');
  const saldoLibreDisponibilidad = saldoLibreContrib ?? (saldoLibreArca != null ? -saldoLibreArca : 0);

  const diferencia = ivaVentas - ivaCompras;

  return {
    razon_social: razonSocial,
    periodo,
    iva_ventas: ivaVentas,
    iva_compras: ivaCompras,
    diferencia,
    saldo_tecnico_anterior: saldoTecnicoAnterior,
    saldo_tecnico: saldoTecnico,
    retenciones_percepciones: retenciones,
    saldo_libre_disponibilidad: saldoLibreDisponibilidad,
    fecha_presentacion: fechaMatch ? fechaMatch[1] : null,
    cuit: cuitMatch ? cuitMatch[1] : null,
    archivo_origen: archivoOrigen,
  };
}

const upsertStmt = db.prepare(`
  INSERT INTO posiciones_historicas
    (razon_social, periodo, iva_ventas, iva_compras, diferencia, saldo_tecnico_anterior,
     saldo_tecnico, retenciones_percepciones, saldo_libre_disponibilidad, fecha_presentacion, cuit, archivo_origen)
  VALUES
    (@razon_social, @periodo, @iva_ventas, @iva_compras, @diferencia, @saldo_tecnico_anterior,
     @saldo_tecnico, @retenciones_percepciones, @saldo_libre_disponibilidad, @fecha_presentacion, @cuit, @archivo_origen)
  ON CONFLICT (razon_social, periodo) DO UPDATE SET
    iva_ventas = excluded.iva_ventas,
    iva_compras = excluded.iva_compras,
    diferencia = excluded.diferencia,
    saldo_tecnico_anterior = excluded.saldo_tecnico_anterior,
    saldo_tecnico = excluded.saldo_tecnico,
    retenciones_percepciones = excluded.retenciones_percepciones,
    saldo_libre_disponibilidad = excluded.saldo_libre_disponibilidad,
    fecha_presentacion = excluded.fecha_presentacion,
    cuit = excluded.cuit,
    archivo_origen = excluded.archivo_origen
`);

const existeStmt = db.prepare('SELECT 1 FROM posiciones_historicas WHERE razon_social = ? AND periodo = ?');

export function existeHistorico(razonSocial, periodo) {
  return !!existeStmt.get(razonSocial, periodo);
}

// Parsea el PDF y devuelve los datos detectados sin escribir en la base — para poder avisar antes
// de pisar una DDJJ que ya está cargada.
export async function parseSoloPdfBuffer(buffer, archivoOrigen) {
  const { text } = await pdfParse(buffer);
  return parsePdfText(text, archivoOrigen);
}

export async function importarPdfBuffer(buffer, archivoOrigen) {
  const row = await parseSoloPdfBuffer(buffer, archivoOrigen);
  upsertStmt.run(row);
  return row;
}

export async function importarTodosLosPdfs(sourceDir) {
  const razonesSociales = ['Target', 'NT'];
  const resultados = [];
  for (const razon of razonesSociales) {
    const dir = path.join(sourceDir, razon);
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.pdf'));
    for (const file of files) {
      const buffer = fs.readFileSync(path.join(dir, file));
      const row = await importarPdfBuffer(buffer, file);
      resultados.push(row);
    }
  }
  return resultados;
}
