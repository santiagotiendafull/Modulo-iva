// Parseo e importación del Formulario 931 (declaración jurada de aportes y contribuciones).
// "Suma de Rem. 10" es la base imponible de un crédito fiscal adicional: Suma de Rem. 10 ×
// porcentaje configurable (configuracionService) se suma al IVA Compras del mismo período.
import pdfParse from 'pdf-parse';
import { get, all, run } from '../db.js';
import { CUIT_A_RAZON_SOCIAL } from './mesEnCursoService.js';
import { obtenerPorcentaje931 } from './configuracionService.js';

function parseNumber(str) {
  if (str == null) return 0;
  return parseFloat(str.replace(/\./g, '').replace(',', '.'));
}

function razonSocialDesdeCuit(cuit) {
  const normalizado = (cuit || '').replace(/[^\d]/g, '');
  return CUIT_A_RAZON_SOCIAL[normalizado] ?? null;
}

export function parsePdfText931(text, archivoOrigen) {
  const flat = text.replace(/\s+/g, ' ').trim();

  const cuitMatch = flat.match(/C\.?U\.?I\.?T\.?\s*([\d-]{10,15})/);
  const razonSocial = cuitMatch ? razonSocialDesdeCuit(cuitMatch[1]) : null;
  if (!razonSocial) {
    throw new Error(`No se pudo determinar la razón social (CUIT no reconocido) en ${archivoOrigen}`);
  }

  const periodoMatch = flat.match(/(\d{2})\/(\d{4})\s*Servicios Eventuales/);
  if (!periodoMatch) throw new Error(`No se pudo extraer el período (Mes - Año) de ${archivoOrigen}`);
  const periodo = `${periodoMatch[2]}-${periodoMatch[1]}`;

  const remMatch = flat.match(/Suma de Rem\.?\s*10\s*:?\s*([\d.,]+)/);
  if (!remMatch) throw new Error(`No se pudo extraer "Suma de Rem. 10" de ${archivoOrigen}`);
  const sumaRem10 = parseNumber(remMatch[1]);

  return {
    razon_social: razonSocial,
    periodo,
    suma_rem_10: sumaRem10,
    cuit: cuitMatch[1],
    archivo_origen: archivoOrigen,
  };
}

export async function existeFormulario931(razonSocial, periodo) {
  const row = await get('SELECT 1 FROM formulario_931 WHERE razon_social = ? AND periodo = ?', [razonSocial, periodo]);
  return !!row;
}

// Parsea sin escribir en la base — para poder avisar antes de pisar un 931 que ya está cargado.
export async function parseSoloPdfBuffer931(buffer, archivoOrigen) {
  const { text } = await pdfParse(buffer);
  return parsePdfText931(text, archivoOrigen);
}

export async function importarPdfBuffer931(buffer, archivoOrigen) {
  const row = await parseSoloPdfBuffer931(buffer, archivoOrigen);
  await run(`
    INSERT INTO formulario_931 (razon_social, periodo, suma_rem_10, cuit, archivo_origen)
    VALUES (@razon_social, @periodo, @suma_rem_10, @cuit, @archivo_origen)
    ON CONFLICT (razon_social, periodo) DO UPDATE SET
      suma_rem_10 = excluded.suma_rem_10,
      cuit = excluded.cuit,
      archivo_origen = excluded.archivo_origen
  `, row);
  return row;
}

export async function formulario931PorPeriodo(razonSocial) {
  const rows = await all('SELECT periodo, suma_rem_10 FROM formulario_931 WHERE razon_social = ?', [razonSocial]);
  return new Map(rows.map((r) => [r.periodo, r]));
}

// Crédito fiscal adicional de un período puntual: 0 si no hay 931 cargado para esa razón social/período.
export async function creditoFiscal931(razonSocial, periodo) {
  const row = await get('SELECT suma_rem_10 FROM formulario_931 WHERE razon_social = ? AND periodo = ?', [razonSocial, periodo]);
  if (!row) return 0;
  return row.suma_rem_10 * ((await obtenerPorcentaje931()) / 100);
}

// Mapa periodo -> crédito fiscal 931, para sumarlo al armar la posición de varios períodos de una.
export async function creditoFiscal931PorPeriodo(razonSocial) {
  const rows = await all('SELECT periodo, suma_rem_10 FROM formulario_931 WHERE razon_social = ?', [razonSocial]);
  const porcentaje = (await obtenerPorcentaje931()) / 100;
  return new Map(rows.map((r) => [r.periodo, r.suma_rem_10 * porcentaje]));
}
