// Conciliación de compras: las compras cargadas en "Mis Comprobantes (Emitidos - Recibidos)" de
// Cargar Datos (tabla comprobantes) contra el Excel de compras del sistema de gestión interno, que
// todavía no tiene un export propio así que se carga a mano con columnas fijas (ver CAMPOS_INTERNA).
import ExcelJS from 'exceljs';
import { db } from '../db.js';
import { signoComprobante } from './clasificacionComprobantes.js';
import { cuitsNoCorresponde } from './proveedoresService.js';
import { creditoFiscal931PorPeriodo } from './formulario931Service.js';

function normalizarCuit(v) {
  if (v == null || v === '') return null;
  const soloDigitos = String(v).trim().replace(/\.0+$/, '').replace(/[^\d]/g, '');
  return soloDigitos || null;
}

// El código de comprobante de ARCA siempre arranca con el número AFIP ("1 - Factura A"). Si en el
// Excel interno solo pusieron el número (o el texto completo) igual matchea: se toma el número
// inicial y, si no hay ninguno, se cae al texto completo normalizado.
export function normalizarTipoCodigo(v) {
  if (v == null) return '';
  const texto = String(v).trim();
  const match = texto.match(/^0*(\d+)/);
  if (match) return match[1];
  return texto.toLowerCase();
}

export function normalizarNumero(v) {
  if (v == null || v === '') return '';
  const digitos = String(v).trim().replace(/[^\d]/g, '');
  if (!digitos) return String(v).trim().toLowerCase();
  return String(parseInt(digitos, 10));
}

function fechaAIso(ddmmyyyy) {
  if (!ddmmyyyy || !/^\d{2}\/\d{2}\/\d{4}$/.test(ddmmyyyy)) return null;
  const [d, m, y] = ddmmyyyy.split('/');
  return `${y}-${m}-${d}`;
}

// Encabezados aceptados para el Excel de gestión interna (no distingue mayúsculas/acentos). El
// sistema propio todavía no tiene un export armado, así que este es el formato de carga manual.
const CAMPOS_INTERNA = {
  fecha: ['fecha'],
  tipo: ['tipo comprobante', 'tipo', 'comprobante'],
  pdv: ['punto de venta', 'pdv', 'punto venta'],
  numero: ['numero', 'nro', 'nro comprobante', 'numero comprobante'],
  cuit: ['cuit', 'cuit proveedor'],
  denominacion: ['proveedor', 'denominacion', 'denominacion proveedor', 'razon social proveedor'],
  total: ['total', 'importe', 'importe total'],
};

function sinAcentos(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function mapearEncabezados(filaEncabezados) {
  const mapa = {};
  filaEncabezados.forEach((valor, idx) => {
    if (valor == null) return;
    const normalizado = sinAcentos(String(valor).trim().toLowerCase());
    for (const [campo, alias] of Object.entries(CAMPOS_INTERNA)) {
      if (mapa[campo] === undefined && alias.includes(normalizado)) mapa[campo] = idx;
    }
  });
  return mapa;
}

const upsertInterna = db.prepare(`
  INSERT INTO conciliacion_interna
    (razon_social, fecha, tipo_comprobante, tipo_codigo, pdv, numero,
     cuit_contraparte, denominacion_contraparte, total, archivo_origen)
  VALUES
    (@razon_social, @fecha, @tipo_comprobante, @tipo_codigo, @pdv, @numero,
     @cuit_contraparte, @denominacion_contraparte, @total, @archivo_origen)
  ON CONFLICT (razon_social, cuit_contraparte, tipo_codigo, pdv, numero) DO UPDATE SET
    fecha = excluded.fecha,
    tipo_comprobante = excluded.tipo_comprobante,
    denominacion_contraparte = excluded.denominacion_contraparte,
    total = excluded.total,
    archivo_origen = excluded.archivo_origen
`);

export async function importarInternaParaConciliacion(buffer, nombreArchivo, razonSocial) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheet = wb.worksheets[0];
  if (!sheet) throw new Error('El Excel no tiene hojas.');

  const encabezados = (sheet.getRow(1).values ?? []).slice(1);
  const mapa = mapearEncabezados(encabezados);
  const faltantes = ['cuit', 'pdv', 'numero'].filter((c) => mapa[c] === undefined);
  if (faltantes.length > 0) {
    throw new Error(`Al Excel le faltan columnas obligatorias: ${faltantes.join(', ')}.`);
  }

  let cargados = 0;
  let omitidos = 0;

  db.exec('BEGIN');
  try {
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const valores = row.values.slice(1);
      const val = (campo) => (mapa[campo] === undefined ? null : valores[mapa[campo]]);

      const cuit = normalizarCuit(val('cuit'));
      const pdv = normalizarNumero(val('pdv'));
      const numero = normalizarNumero(val('numero'));
      if (!cuit || !pdv || !numero) { if (row.hasValues) omitidos++; return; }

      const fechaRaw = val('fecha');
      let fecha = null;
      if (fechaRaw instanceof Date) {
        fecha = `${fechaRaw.getFullYear()}-${String(fechaRaw.getMonth() + 1).padStart(2, '0')}-${String(fechaRaw.getDate()).padStart(2, '0')}`;
      } else if (fechaRaw) {
        fecha = fechaAIso(String(fechaRaw).trim()) || String(fechaRaw).trim();
      }

      upsertInterna.run({
        razon_social: razonSocial,
        fecha,
        tipo_comprobante: val('tipo') != null ? String(val('tipo')) : null,
        tipo_codigo: normalizarTipoCodigo(val('tipo')),
        pdv,
        numero,
        cuit_contraparte: cuit,
        denominacion_contraparte: val('denominacion') != null ? String(val('denominacion')) : null,
        total: val('total') ? parseFloat(val('total')) : 0,
        archivo_origen: nombreArchivo,
      });
      cargados++;
    });
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return { comprobantes: cargados, omitidos };
}

// La conciliación de comprobantes es contra las compras del sistema interno: se compara contra las
// mismas compras cargadas en "Mis Comprobantes (Emitidos - Recibidos)" de Cargar Datos (tabla
// comprobantes), sin necesidad de subirlas de nuevo acá.
const selectComprasCargadas = db.prepare("SELECT fecha, periodo, tipo_comprobante, pdv, numero_desde, cuit_contraparte, denominacion_contraparte, total FROM comprobantes WHERE razon_social = ? AND tipo = 'compra' ORDER BY fecha, numero_desde");
const selectInterna = db.prepare('SELECT * FROM conciliacion_interna WHERE razon_social = ? ORDER BY fecha, numero');

function clave(row) {
  return `${row.cuit_contraparte}|${row.tipo_codigo}|${row.pdv}|${row.numero}`;
}

// Cruza ARCA vs interna por (cuit, tipo, pdv, número). Devuelve una fila por comprobante, marcando
// si está en ambos lados, solo en ARCA (falta cargarlo en el sistema interno) o solo en interna.
export function obtenerConciliacion(razonSocial) {
  const arca = selectComprasCargadas.all(razonSocial).map((r) => ({
    fecha: r.fecha,
    periodo: r.periodo,
    tipo_comprobante: r.tipo_comprobante,
    tipo_codigo: normalizarTipoCodigo(r.tipo_comprobante),
    pdv: normalizarNumero(r.pdv),
    numero: normalizarNumero(r.numero_desde),
    cuit_contraparte: normalizarCuit(r.cuit_contraparte) ?? r.cuit_contraparte,
    denominacion_contraparte: r.denominacion_contraparte,
    total: r.total,
  })).filter((r) => r.cuit_contraparte && r.pdv && r.numero);
  const interna = selectInterna.all(razonSocial);
  const internaPorClave = new Map(interna.map((r) => [clave(r), r]));
  const usadas = new Set();

  const filas = arca.map((r) => {
    const k = clave(r);
    const enInterna = internaPorClave.has(k);
    if (enInterna) usadas.add(k);
    return {
      fecha: r.fecha,
      periodo: r.periodo,
      tipo_comprobante: r.tipo_comprobante,
      pdv: r.pdv,
      numero: r.numero,
      cuit_contraparte: r.cuit_contraparte,
      denominacion_contraparte: r.denominacion_contraparte,
      total: r.total,
      en_arca: true,
      en_interna: enInterna,
      estado: enInterna ? 'ok' : 'falta_interno',
    };
  });

  for (const r of interna) {
    const k = clave(r);
    if (usadas.has(k)) continue;
    filas.push({
      fecha: r.fecha,
      periodo: r.fecha ? r.fecha.slice(0, 7) : null,
      tipo_comprobante: r.tipo_comprobante,
      pdv: r.pdv,
      numero: r.numero,
      cuit_contraparte: r.cuit_contraparte,
      denominacion_contraparte: r.denominacion_contraparte,
      total: r.total,
      en_arca: false,
      en_interna: true,
      estado: 'falta_arca',
    });
  }

  filas.sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '') || String(a.numero).localeCompare(String(b.numero)));

  return {
    filas,
    resumen: {
      total: filas.length,
      ok: filas.filter((f) => f.estado === 'ok').length,
      falta_interno: filas.filter((f) => f.estado === 'falta_interno').length,
      falta_arca: filas.filter((f) => f.estado === 'falta_arca').length,
    },
  };
}

export function comprobantesFaltantesEnInterna(razonSocial) {
  return obtenerConciliacion(razonSocial).filas.filter((f) => f.estado === 'falta_interno');
}

const deleteInterna = db.prepare('DELETE FROM conciliacion_interna WHERE razon_social = ?');

export function limpiarInterna(razonSocial) { deleteInterna.run(razonSocial); }

// --- Interna vs Externa -----------------------------------------------------------------------
// Recalcula la posición de IVA con nuestra propia metodología (misma regla de signo por
// comprobante y exclusión de proveedores "no corresponde" que usa el mes en curso, ver
// clasificacionComprobantes.js y proveedoresService.js) a partir de los mismos Emitidos/Recibidos
// que ya se cargan en "Cargar datos" (tabla comprobantes) — no hace falta volver a subirlos acá.
// Esto es el cálculo "interno"; se compara contra lo que el estudio contable presentó
// (posiciones_historicas). Como esa tabla solo guarda el mes en curso (una vez que un período tiene
// DDJJ, ARCA ya no se vuelve a cargar ahí), la comparación solo es posible mientras el período
// todavía no tenía DDJJ al momento de cargarlo.
const selectComprobantesTodo = db.prepare('SELECT periodo, tipo, tipo_comprobante, cuit_contraparte, iva, fecha FROM comprobantes WHERE razon_social = ?');

export function posicionInternaPorPeriodo(razonSocial) {
  const rows = selectComprobantesTodo.all(razonSocial);
  const noCorresponde = cuitsNoCorresponde();

  const porPeriodo = new Map();
  for (const r of rows) {
    if (!porPeriodo.has(r.periodo)) {
      porPeriodo.set(r.periodo, { periodo: r.periodo, iva_ventas: 0, iva_compras: 0, credito_931: 0, ultima_fecha: null });
    }
    const acc = porPeriodo.get(r.periodo);
    if (r.fecha && (!acc.ultima_fecha || r.fecha > acc.ultima_fecha)) acc.ultima_fecha = r.fecha;

    if (r.tipo === 'compra' && noCorresponde.has(r.cuit_contraparte)) continue;
    const signo = signoComprobante(r.tipo, r.tipo_comprobante);
    if (signo === 0) continue;
    if (r.tipo === 'venta') acc.iva_ventas += signo * r.iva;
    else acc.iva_compras += signo * r.iva;
  }

  // Mismo crédito fiscal adicional que en el Dashboard (Suma de Rem. 10 × porcentaje configurable),
  // sumado acá también para que "Interno" sea comparable con el resultado fiscal real.
  const creditos931 = creditoFiscal931PorPeriodo(razonSocial);
  for (const [periodo, credito] of creditos931) {
    if (!porPeriodo.has(periodo)) porPeriodo.set(periodo, { periodo, iva_ventas: 0, iva_compras: 0, credito_931: 0, ultima_fecha: null });
    const acc = porPeriodo.get(periodo);
    acc.iva_compras += credito;
    acc.credito_931 = credito;
  }

  return [...porPeriodo.values()].sort((a, b) => a.periodo.localeCompare(b.periodo));
}

const selectHistoricos = db.prepare('SELECT periodo, iva_ventas, iva_compras, diferencia, fecha_presentacion FROM posiciones_historicas WHERE razon_social = ? ORDER BY periodo');

// Une, por período, lo que calculamos nosotros (interno) con lo que declaró el estudio (externo).
// ultima_fecha_arca sirve para que el frontend pueda avisar si el mes de ARCA todavía está
// incompleto (mes en curso) en vez de mostrar una diferencia que en realidad es solo por eso.
export function conciliacionInternaExterna(razonSocial) {
  const internos = posicionInternaPorPeriodo(razonSocial);
  const internoPorPeriodo = new Map(internos.map((i) => [i.periodo, i]));
  const externos = selectHistoricos.all(razonSocial);
  const externoPorPeriodo = new Map(externos.map((e) => [e.periodo, e]));

  const periodos = [...new Set([...internoPorPeriodo.keys(), ...externoPorPeriodo.keys()])].sort();

  const filas = periodos.map((periodo) => {
    const i = internoPorPeriodo.get(periodo);
    const e = externoPorPeriodo.get(periodo);
    const interno = i ? { iva_ventas: i.iva_ventas, iva_compras: i.iva_compras, credito_931: i.credito_931, diferencia: i.iva_ventas - i.iva_compras } : null;
    const externo = e ? { iva_ventas: e.iva_ventas, iva_compras: e.iva_compras, diferencia: e.diferencia, fecha_presentacion: e.fecha_presentacion } : null;
    return {
      periodo,
      interno,
      externo,
      ultima_fecha_arca: i?.ultima_fecha ?? null,
      diferencia_ventas: interno && externo ? interno.iva_ventas - externo.iva_ventas : null,
      diferencia_compras: interno && externo ? interno.iva_compras - externo.iva_compras : null,
      diferencia_total: interno && externo ? interno.diferencia - externo.diferencia : null,
    };
  });

  return { filas };
}
