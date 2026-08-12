// Comprobantes que el estudio contable todavía no tiene: nos manda un Excel acumulado del año cada
// mes con lo que le falta, repartido en varias hojas relevantes para una misma razón social (a veces
// formato "Mis Comprobantes Recibidos" completo, a veces con columnas extra Estado/Motivo
// Diferencia). No se compara contra ARCA — se cargan tal cual como la lista de pendientes: se eligen
// todas las hojas relevantes de esa razón social y se importan juntas, reemplazando por completo lo
// que había antes (el estudio ya viene sacando de esa lista lo que le vamos mandando).
import ExcelJS from 'exceljs';
import { db, all, run, get } from '../db.js';

function normalizarCuit(v) {
  if (v == null || v === '') return null;
  const soloDigitos = String(v).trim().replace(/\.0+$/, '').replace(/[^\d]/g, '');
  return soloDigitos || null;
}

function sinAcentos(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// El Excel del estudio no siempre viene con la fecha en un formato prolijo tipo Excel: al ser una
// planilla que arma el estudio a mano, aparecen variantes (1 o 2 dígitos de día/mes, año de 2 o 4
// dígitos, separador "-" en vez de "/", ISO "aaaa-mm-dd") y a veces la celda quedó como un número de
// serie de Excel en vez de una fecha real. Antes solo se aceptaba "dd/mm/aaaa" exacto — cualquier
// otra cosa quedaba sin fecha (celda vacía en la tabla). Se prueban varios formatos antes de
// rendirse, para no perder la fecha de un comprobante solo porque el estudio la tipeó distinto.
function fechaAIso(valorCrudo) {
  if (valorCrudo == null || valorCrudo === '') return null;
  const texto = String(valorCrudo).trim();

  // dd/mm/aaaa o d/m/aaaa (con o sin ceros a la izquierda), separador "/" o "-".
  const conSeparador = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (conSeparador) {
    let [, d, m, y] = conSeparador;
    if (y.length === 2) y = `20${y}`; // el estudio a veces tipea el año con 2 dígitos
    const dia = d.padStart(2, '0');
    const mes = m.padStart(2, '0');
    if (Number(dia) >= 1 && Number(dia) <= 31 && Number(mes) >= 1 && Number(mes) <= 12) {
      return `${y}-${mes}-${dia}`;
    }
  }

  // aaaa-mm-dd (ISO), por si la celda ya venía en ese formato.
  const iso = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Número de serie de Excel (días desde el 30/12/1899, con el bug del año bisiesto 1900 que Excel
  // arrastra a propósito por compatibilidad con Lotus 1-2-3): pasa esto cuando ExcelJS entrega la
  // celda como número en vez de Date. Rango razonable: años ~2015 a ~2035.
  const serie = texto.match(/^\d{5}(\.\d+)?$/);
  if (serie) {
    const n = parseFloat(texto);
    if (n >= 42000 && n <= 50000) {
      const fecha = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);
      const y = fecha.getUTCFullYear();
      const m = String(fecha.getUTCMonth() + 1).padStart(2, '0');
      const d = String(fecha.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }

  return null;
}

// Acepta tanto los encabezados de la hoja "Faltantes" (con Estado/Motivo) como los de "Mis
// Comprobantes Recibidos" completo (con desglose por alícuota) — el estudio manda uno u otro según
// el mes, y ambos traen los mismos datos base que necesitamos.
const CAMPOS = {
  tipo: ['tipo', 'tipo comprobante'],
  pdv: ['punto de venta'],
  numero: ['numero desde', 'numero', 'nro', 'nro comprobante'],
  cuit: ['nro. doc. emisor', 'cuit', 'cuit proveedor'],
  denominacion: ['denominacion emisor', 'proveedor', 'denominacion'],
  neto_gravado: ['imp. neto gravado', 'neto gravado total', 'neto gravado'],
  iva: ['iva', 'total iva'],
  total: ['imp. total', 'total', 'importe total'],
};

function mapearEncabezados(fila) {
  const mapa = {};
  fila.forEach((valor, idx) => {
    if (valor == null) return;
    const normalizado = sinAcentos(String(valor).trim().toLowerCase());
    // La columna de fecha se matchea "empieza con" (no exacto) porque algunas hojas la titulan
    // "Fecha Comprobante" o similar en vez de solo "Fecha" — mismo criterio que ya usa
    // indiceFilaEncabezado más abajo para encontrar la fila de encabezados, así los dos coinciden.
    // Si no fuera así, la fila de encabezados se detecta bien pero la columna de fecha nunca se
    // mapea, y todas las filas de esa hoja quedan sin fecha.
    if (mapa.fecha === undefined && normalizado.startsWith('fecha')) {
      mapa.fecha = idx;
      return;
    }
    for (const [campo, alias] of Object.entries(CAMPOS)) {
      if (mapa[campo] === undefined && alias.includes(normalizado)) mapa[campo] = idx;
    }
  });
  return mapa;
}

function celdaAValor(cell) {
  if (cell == null) return '';
  if (cell instanceof Date) {
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

// Fila cuya primera celda empieza con "fecha": algunas hojas traen una fila de título antes de los
// encabezados y otras no, así que no se puede asumir una cantidad fija de filas a saltear.
function indiceFilaEncabezado(sheet) {
  let indice = null;
  sheet.eachRow((row, rowNumber) => {
    if (indice != null) return;
    const primera = String(celdaAValor(row.getCell(1).value) || '').trim().toLowerCase();
    if (primera.startsWith('fecha')) indice = rowNumber;
  });
  return indice;
}

export async function previsualizarHojas(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb.worksheets.map((s) => ({ nombre: s.name, filas: Math.max(0, s.rowCount - 1) }));
}

const INSERT_SQL = `
  INSERT INTO pendientes_estudio
    (razon_social, fecha, tipo_comprobante, pdv, numero, cuit_contraparte, denominacion_contraparte, neto_gravado, iva, total, archivo_origen, listo)
  VALUES
    (@razon_social, @fecha, @tipo_comprobante, @pdv, @numero, @cuit_contraparte, @denominacion_contraparte, @neto_gravado, @iva, @total, @archivo_origen, @listo)
`;

function parsearHoja(sheet, razonSocial, archivoOrigen) {
  const filaEncabezado = indiceFilaEncabezado(sheet);
  if (!filaEncabezado) throw new Error(`Hoja "${sheet.name}": no se encontró la fila de encabezados (tiene que haber una columna "Fecha").`);
  const encabezados = (sheet.getRow(filaEncabezado).values ?? []).slice(1).map(celdaAValor);
  const mapa = mapearEncabezados(encabezados);
  const faltantes = ['cuit', 'total'].filter((c) => mapa[c] === undefined);
  if (faltantes.length > 0) throw new Error(`A la hoja "${sheet.name}" le faltan columnas obligatorias: ${faltantes.join(', ')}.`);

  const filas = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= filaEncabezado) return;
    const valores = row.values.slice(1).map(celdaAValor);
    const val = (campo) => (mapa[campo] === undefined ? null : valores[mapa[campo]]);

    const cuit = normalizarCuit(val('cuit'));
    if (!cuit) return;

    const fecha = fechaAIso(val('fecha'));

    filas.push({
      razon_social: razonSocial,
      fecha,
      tipo_comprobante: val('tipo') != null && val('tipo') !== '' ? String(val('tipo')) : null,
      pdv: val('pdv') != null && val('pdv') !== '' ? String(val('pdv')) : null,
      numero: val('numero') != null && val('numero') !== '' ? String(val('numero')) : null,
      cuit_contraparte: cuit,
      denominacion_contraparte: val('denominacion') != null && val('denominacion') !== '' ? String(val('denominacion')) : null,
      neto_gravado: val('neto_gravado') ? parseFloat(val('neto_gravado')) : 0,
      iva: val('iva') ? parseFloat(val('iva')) : 0,
      total: val('total') ? parseFloat(val('total')) : 0,
      archivo_origen: archivoOrigen,
      listo: 0,
    });
  });
  return filas;
}

// El estudio manda un solo Excel con varias hojas relevantes para la misma razón social (ej. una
// hoja "Faltantes ... enero a mayo" y otra con el mes en curso completo tipo "T-JUNIO 26"). Hay que
// importarlas juntas: cada hoja sola no representa el total de lo pendiente, así que se combinan
// todas las filas y recién ahí se reemplaza lo que había antes para esa razón social.
export async function importarHojas(buffer, nombresHojas, razonSocial, archivoOrigen) {
  if (!['NT', 'Target'].includes(razonSocial)) throw new Error('Falta razón social (NT o Target).');
  if (!Array.isArray(nombresHojas) || nombresHojas.length === 0) throw new Error('Elegí al menos una hoja para importar.');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const filasCrudas = [];
  for (const nombreHoja of nombresHojas) {
    const sheet = wb.getWorksheet(nombreHoja);
    if (!sheet) throw new Error(`No se encontró la hoja "${nombreHoja}" en el Excel.`);
    filasCrudas.push(...parsearHoja(sheet, razonSocial, archivoOrigen));
  }

  // Algunas hojas del estudio (formato "Mis Comprobantes Recibidos" completo) traen cada comprobante
  // duplicado: una fila con los montos reales y otra idéntica (mismo CUIT/PDV/Número) con todo en
  // cero. Se agrupa por CUIT+PDV+Número y se queda la de mayor total absoluto.
  const porClave = new Map();
  for (const f of filasCrudas) {
    const clave = `${f.cuit_contraparte}|${f.pdv}|${f.numero}`;
    const actual = porClave.get(clave);
    if (!actual || Math.abs(f.total) > Math.abs(actual.total)) porClave.set(clave, f);
  }

  // Un comprobante marcado "listo" (ya lo encontramos) no deja de estar listo solo porque llegó un
  // Excel nuevo del estudio — se preserva el estado si sigue apareciendo en la carga nueva.
  const listosAntes = await all(
    'SELECT cuit_contraparte, pdv, numero FROM pendientes_estudio WHERE razon_social = ? AND listo = 1',
    [razonSocial]
  );
  const clavesListas = new Set(listosAntes.map((r) => `${r.cuit_contraparte}|${r.pdv}|${r.numero}`));

  const filas = [...porClave.entries()].map(([clave, f]) => ({ ...f, listo: clavesListas.has(clave) ? 1 : 0 }));

  await db.batch([
    { sql: 'DELETE FROM pendientes_estudio WHERE razon_social = ?', args: [razonSocial] },
    ...filas.map((r) => ({ sql: INSERT_SQL, args: r })),
  ], 'write');

  return { cantidad: filas.length };
}

export async function obtenerPendientes(razonSocial) {
  const filas = await all('SELECT * FROM pendientes_estudio WHERE razon_social = ? ORDER BY fecha, numero', [razonSocial]);

  const porProveedor = new Map();
  for (const f of filas) {
    const actual = porProveedor.get(f.cuit_contraparte) || {
      cuit: f.cuit_contraparte, denominacion: f.denominacion_contraparte, iva: 0, cantidad: 0,
    };
    actual.iva += f.iva;
    actual.cantidad += 1;
    porProveedor.set(f.cuit_contraparte, actual);
  }
  const topProveedores = [...porProveedor.values()].sort((a, b) => b.iva - a.iva).slice(0, 5);

  const enviados = await get(
    `SELECT COUNT(*) as n FROM envio_estudio_item ei
     JOIN envio_estudio e ON e.id = ei.envio_id
     WHERE e.razon_social = ?`,
    [razonSocial]
  );

  return {
    filas,
    kpis: {
      total_iva: filas.reduce((acc, f) => acc + f.iva, 0),
      cantidad_pendiente: filas.length,
      cantidad_listos: filas.filter((f) => f.listo).length,
      cantidad_enviados: enviados?.n ?? 0,
      top_proveedores: topProveedores,
    },
  };
}

// Papel de trabajo: tildar/destildar un comprobante como "ya lo tenemos" no lo saca de pendientes ni
// lo manda al estudio — solo queda marcado hasta que se genere el PDF de envío con enviarAEstudio.
export async function marcarListo(id, listo) {
  await run('UPDATE pendientes_estudio SET listo = ? WHERE id = ?', [listo ? 1 : 0, id]);
}

export async function obtenerHistorial(razonSocial) {
  const envios = await all('SELECT * FROM envio_estudio WHERE razon_social = ? ORDER BY fecha_hora DESC', [razonSocial]);
  if (envios.length === 0) return [];
  const items = await all(
    `SELECT ei.* FROM envio_estudio_item ei
     JOIN envio_estudio e ON e.id = ei.envio_id
     WHERE e.razon_social = ?
     ORDER BY ei.id`,
    [razonSocial]
  );
  const itemsPorEnvio = new Map();
  for (const it of items) {
    if (!itemsPorEnvio.has(it.envio_id)) itemsPorEnvio.set(it.envio_id, []);
    itemsPorEnvio.get(it.envio_id).push(it);
  }
  return envios.map((e) => ({ ...e, items: itemsPorEnvio.get(e.id) ?? [] }));
}

export async function enviarAEstudio(razonSocial, ids, usuario) {
  if (!['NT', 'Target'].includes(razonSocial)) throw new Error('Falta razón social (NT o Target).');
  if (!Array.isArray(ids) || ids.length === 0) throw new Error('No hay comprobantes seleccionados.');

  const placeholders = ids.map(() => '?').join(',');
  const filas = await all(`SELECT * FROM pendientes_estudio WHERE razon_social = ? AND id IN (${placeholders})`, [razonSocial, ...ids]);
  if (filas.length === 0) throw new Error('Los comprobantes seleccionados ya no están pendientes.');

  const envioResult = await run('INSERT INTO envio_estudio (razon_social, usuario, cantidad) VALUES (?, ?, ?)', [razonSocial, usuario ?? null, filas.length]);
  const envioId = Number(envioResult.lastInsertRowid);

  await db.batch([
    ...filas.map((f) => ({
      sql: `INSERT INTO envio_estudio_item
              (envio_id, fecha, tipo_comprobante, pdv, numero, cuit_contraparte, denominacion_contraparte, neto_gravado, iva, total)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [envioId, f.fecha, f.tipo_comprobante, f.pdv, f.numero, f.cuit_contraparte, f.denominacion_contraparte, f.neto_gravado, f.iva, f.total],
    })),
    { sql: `DELETE FROM pendientes_estudio WHERE id IN (${placeholders})`, args: ids },
  ], 'write');

  return { envio_id: envioId, filas };
}

export async function pendientesPorProveedor(razonSocial, cuit) {
  if (!['NT', 'Target'].includes(razonSocial)) throw new Error('Falta razón social (NT o Target).');
  return all('SELECT * FROM pendientes_estudio WHERE razon_social = ? AND cuit_contraparte = ? ORDER BY fecha, numero', [razonSocial, normalizarCuit(cuit)]);
}
